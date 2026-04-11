# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the app (available at http://localhost:8002)
docker compose up --build -d

# Stop the app
docker compose down

# Restart just the container after Python changes (JS is served live — no restart needed)
docker compose restart web

# Tail container logs
docker compose logs -f

# Run all tests (Node built-in test runner, no build step)
npm test

# Run a single test by name pattern
node --test --test-name-pattern "mergeTasks"

# Restore a backup
gunzip -c data/backups/full/state-YYYYMMDD-HHMMSS.json.gz | \
  curl -X PUT http://localhost:8002/state -H "Content-Type: application/json" -d @-
```

## Architecture

**Stack:** Python 3.11 `ThreadingHTTPServer` (no frameworks) + vanilla ES-module JavaScript SPA + Docker. No build tools — the frontend is served directly from `app/web_ui/`.

---

### Server (`app/server.py`)

Handles static file serving and a small JSON REST API. All JSON responses are gzip-compressed when the client sends `Accept-Encoding: gzip`. Key endpoints:

- `GET /state` — returns active state (tasks, projects, settings, checklist, analytics) plus `_rev` and `_serverVersion`. Completion history is **intentionally excluded** and served separately.
- `GET /completed` — returns `completionLog`, `reference`, `completedProjects`. Only fetched by Statistics and Reports panels on first activation.
- `PUT /state` — writes state. Supports optimistic locking via `If-Match: <rev>` header; returns `409 Conflict` with current server state as the body when revisions don't match. Splits completion data into `data/completed.json`, triggers Google Calendar sync and backup. **POST to `/state` returns 405** — PUT only.
- `POST /upload`, `GET /images/<filename>` — image upload/serve.
- `/feedback` (CRUD), `/credentials/google` (CRUD), `POST /admin/cleanup-images`.

**Optimistic locking:** The server owns the `_rev` field — it increments it on every write and strips any client-supplied value. Clients send `If-Match: <lastKnownRev>`. On mismatch the 409 body is the complete current server state, which the client merges and retries (up to 3 attempts). A missing `If-Match` header is accepted unconditionally (first write / legacy clients).

**State split rationale:** `completionLog`/`reference`/`completedProjects` can grow large and are only needed by Statistics/Reports. Keeping them out of `/state` reduces the sync payload by ~50% as the app ages.

**Atomic writes:** All state writes use `_atomic_write()` (write to `.tmp` then `os.replace()`), eliminating partial-write corruption.

**Thread safety:** All reads/writes to `STATE_FILE`/`COMPLETED_FILE` are guarded by `STATE_LOCK`. Feedback uses a separate `FEEDBACK_LOCK`. Google Calendar sync uses `_CALENDAR_SYNC_LOCK`.

---

### State persistence

Two JSON files on disk, both bind-mounted from `./data/` into the container at `/data/`:

- `data/state.json` — active tasks, projects, settings, checklist, analytics, `_rev`, `_tombstones`.
- `data/completed.json` — `completionLog`, `reference`, `completedProjects`.

Env vars for overriding paths (set in `.env`): `STATE_FILE`, `COMPLETED_FILE`, `IMAGES_DIR`, `FEEDBACK_FILE`, `GOOGLE_CREDENTIALS_FILE`, `STATE_BACKUP_DIR`, `STATE_BACKUP_RETENTION`.

---

### Frontend modules (`app/web_ui/js/`)

**`app.js`** — Entry point. Constructs `TaskManager`, `UIController`, `AnalyticsController`. On `DOMContentLoaded` calls `ui.init()` and `analytics.init()`, then wires standalone DOM features: quick-add form, theme cycle toggle, manual refresh, Pomodoro timer, projects panel shortcuts, markdown sync, and help modal.

**`data.js`** — `TaskManager extends EventTarget`. All business logic, state reads/writes, localStorage cache (`nextflow-state-v1`), server sync, and offline/merge-conflict resolution. Emits `statechange`, `toast`, `syncconflict`, `versionchange`, `connection` events. The single source of truth — `ui.js` and `analytics.js` read state only through `TaskManager` methods.

**Sync flow:** every mutation calls `emitChange()` → `save()` → `persistLocally()` (debounced 500ms, flushes immediately on `beforeunload`/`visibilitychange`) + `persistRemotely()` → `flushRemoteQueue()`.

`flushRemoteQueue()` sends `PUT /state` with `If-Match: lastKnownRev`. On `409 Conflict` the response body (current server state) is merged with local state via `mergeStates()`, `lastKnownRev` is updated from the 409 body's `_rev`, and the PUT is retried. `lastKnownRev` is stored in localStorage under `REV_KEY` (`nextflow-last-rev`) and updated on every successful write or GET.

**Tombstones:** `deleteTask()` and `completeTask()` both write `state._tombstones[taskId] = ISO-timestamp`. `mergeTasks()` checks these maps: if a tombstone timestamp is newer than both sides' `updatedAt`, the task is suppressed entirely. `restoreCompletedTask()` deletes the tombstone entry. The server prunes `_tombstones` entries older than 30 days on every write.

**Merge granularity:** `mergeTasks()` uses `MERGE_FIELD_GROUPS` (groups: `scheduling`, `status`, `dueDate`, `followUpDate`) for per-group LWW via `_fieldTimestamps` on each task — finer than whole-task `updatedAt`. `mergeSettings()` uses `SETTINGS_MERGE_GROUPS` (groups: `appearance`, `calendar`, `flags`, `lists`) for per-group LWW. Notes and listItems use `mergeSubcollection()` (union + per-item LWW), so concurrent additions on either device always survive.

On initial load, `loadRemoteState()` fetches `/state` and `/completed` in parallel. `flushRemoteQueue()` only fetches `/completed` when a 409 conflict actually occurs.

**Op log** (`nextflow-op-log` in localStorage, max 300 entries): every change to `OP_LOG_FIELDS` (`status`, `myDayDate`, `calendarDate`, `calendarTime`, `dueDate`, `followUpDate`) is recorded with a per-entry UUID, timestamp, device identity, task id/title, field name, previous value, and next value. The top 100 entries (`OP_LOG_SHARED_MAX`) are included as `deviceLog` in every server PUT payload and merged back from the remote state on load. Powers the Sync Diagnostics table in the Settings panel (`renderSyncDiagnostics()` in `ui.js`). Device identity is stored in `nextflow-device-info` localStorage key (auto-generated per browser, never sent to a remote service). The op log is **diagnostics-only** — it does not drive merge decisions.

**Completion fields in PUT payloads are conditional** — `flushRemoteQueue()` includes `completionLog`, `reference`, and `completedProjects` only when `_completionsDirty` is set (after a task is completed, deleted, or restored). Regular task edits send a slim payload without them. `_completionsDirty` is cleared after a successful PUT. The server merges incoming completion data with `completed.json` rather than replacing it, so a stale device cannot wipe history.

**`ui.js`** — `UIController`. All DOM rendering and event handling, organized by panel. `PANEL_RENDER_FNS` is a frozen map of panel-id → render method name — **adding a new panel requires an entry here and a corresponding `render<Panel>()` method**. `_dirtyPanels` is a Set tracking which panels need re-rendering. On `statechange`, `renderAll()` marks all panels dirty and renders only the active one; hidden panels render on-demand when `setActivePanel()` is called. Always-unconditional calls in `renderAll()`: `renderSummary()`, `renderAssociationFlyout()`, `updateSuggestionLists()`, `updateCounts()`, `syncTheme()`, `applyPanelVisibility()`.

All DOM element references are looked up once in `cacheElements()` and accessed via `this.elements.*` throughout — never query the DOM directly inside render methods.

**`analytics.js`** — `AnalyticsController`. Chart rendering only, wrapping `chart.min.js`. Reads from `TaskManager`; no state mutations.

**`review.js`** — `ReviewController`. Drives the full-screen Weekly Review mode. Walks five sections in order: Inbox (gated — must reach zero) → Next Actions → Waiting For → Someday/Maybe → Projects. Session state (current position, processed IDs, stats) is stored in localStorage under `nextflow-review-session` with a 12-hour TTL so reviews can be paused/resumed. Streak data (`settings.review`) is synced across devices via `taskManager.updateReviewData()` on completion.

**`sw.js`** — Service worker. Caches core assets under `nextflow-shell-v1`. Strategy: network-first for `.js`/`.css` (so deploys are picked up immediately), cache-first for navigation and other static assets. `/state` API calls are always bypassed — never cached.

---

### Data model constants (all in `data.js`)

- `STATUS`: `inbox | next | doing | waiting | someday`
- `PHYSICAL_CONTEXTS`: `@Phone @Office @Home @Errands @Lab @Work @Team @Desk`
- `EFFORT_LEVELS`: `low | medium | high`
- `TIME_REQUIREMENTS`: `<5min | <15min | <30min | 30min+`
- `RECURRENCE_TYPES`: `daily | weekly | monthly`
- `PROJECT_AREAS`: `Work | Personal | Home | Finance | Health`
- `PROJECT_THEMES`: `Networking | DevOps | Automations | Family | Admin | Research`
- `PROJECT_STATUSES`: `Active | OnHold | Completed`
- People tags match `PEOPLE_TAG_PATTERN`: `/^\+[A-Za-z0-9][A-Za-z0-9_-]*$/`

Key task fields: `status`, `contexts`, `dueDate`, `followUpDate`, `myDayDate`, `areaOfFocus`, `project`, `waitingFor`, `effortLevel`, `timeRequired`, `recurrence`, `peopleTags`, `notes`, `_fieldTimestamps`.

Key settings fields: `peopleOptions`, `deletedPeopleOptions` (tracks explicitly deleted tags to prevent text-mention resurrection), `contextOptions`, `areaOptions`, `featureFlags`, `staleTaskThresholds`, `theme`, `customTheme`, `customThemePalettes`, `_fieldTimestamps`.

Key state-level fields: `_rev` (server-assigned, monotonic), `_tombstones` (map of `taskId → ISO-timestamp`).

---

### Async panel data loading

`setActivePanel()` handles lazy-loading for panels that need server data beyond `/state`:
- `statistics` / `reports` — calls `taskManager.ensureCompletedLoaded()` then re-renders.
- `settings` — calls `ui.loadFeedbackList()` to fetch `GET /feedback` and populate the admin list.

When adding a panel that needs a separate fetch, hook into `setActivePanel()` with the same pattern.

---

### Google Calendar sync (`app/google_calendar.py`)

Triggered asynchronously after each `PUT /state`. Requires `GOOGLE_CREDENTIALS_FILE` (path to service account JSON) and `GOOGLE_CALENDAR_ID` env vars, or per-request settings stored via `POST /credentials/google`. A `_calendar_sync_key` tuple `(calendarId, timezone, duration)` tracks the active config; reinitialises the sync object only when config changes.

### Backups (`app/backup.py`)

`StateBackupManager.write_backup()` is called after every successful state write, producing gzipped snapshots in `STATE_BACKUP_DIR` (default `./data/backups/full`). Retains the most recent `STATE_BACKUP_RETENTION` files (default 30); older ones are pruned automatically.

---

## Slash commands

Custom slash commands live in `.claude/commands/`. Key references for this project:

- `@feedback.md` — current bug/feature backlog with proposed solutions and resolved status. **Check this before starting any bug fix or feature work** to avoid duplicating analysis already done.
- `@project-context.md` — concise architectural reference (stack, key files, data model, design decisions). Useful as context for `/ask` architectural questions.

Both files are kept in sync with `data/feedback.json` — when items are implemented, mark them resolved in both places.

---

## Tests

Tests live in `tests/taskManager.test.js` and use Node's built-in test runner. The file:
- Sets `globalThis.fetch = undefined` to prevent any network calls.
- Uses `manager.remoteSyncEnabled = false` on every constructed instance.
- Imports `__testing` from `data.js` for access to internal helpers (`mergeStates`, `mergeTasks`, `mergeSettings`, `_buildConflictSummary`, `_mergeTombstones`, etc.).

New tests should follow this pattern — no server required, no mocking framework.

`SERVER_VERSION` is set to the current git short SHA at startup (falls back to a timestamp if git is unavailable). The frontend uses `_serverVersion` in the `/state` response to detect when the server was redeployed.
