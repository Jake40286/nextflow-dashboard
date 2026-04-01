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
node --test --test-name-pattern "mergeStates"

# Restore a backup
gunzip -c data/backups/full/state-YYYYMMDD-HHMMSS.json.gz | \
  curl -X POST http://localhost:8002/state -H "Content-Type: application/json" -d @-
```

## Architecture

**Stack:** Python 3.11 `ThreadingHTTPServer` (no frameworks) + vanilla ES-module JavaScript SPA + Docker. No build tools — the frontend is served directly from `app/web_ui/`.

---

### Server (`app/server.py`)

Handles static file serving and a small JSON REST API. All JSON responses are gzip-compressed when the client sends `Accept-Encoding: gzip`. Key endpoints:

- `GET /state` — returns active state (tasks, projects, settings, checklist, analytics). Completion history is **intentionally excluded** and served separately.
- `GET /completed` — returns `completionLog`, `reference`, `completedProjects`. Only fetched by Statistics and Reports panels on first activation.
- `PUT`/`POST /state` — writes state, splits completion data into `data/completed.json`, triggers Google Calendar sync and backup.
- `POST /upload`, `GET /images/<filename>` — image upload/serve.
- `/feedback` (CRUD), `/credentials/google` (CRUD), `POST /admin/cleanup-images`.

**State split rationale:** `completionLog`/`reference`/`completedProjects` can grow large and are only needed by Statistics/Reports. Keeping them out of `/state` reduces the sync payload by ~50% as the app ages.

**Thread safety:** All reads/writes to `STATE_FILE`/`COMPLETED_FILE` are guarded by `STATE_LOCK`. Feedback uses a separate `FEEDBACK_LOCK`. Google Calendar sync uses `_CALENDAR_SYNC_LOCK`.

---

### State persistence

Two JSON files on disk, both bind-mounted from `./data/` into the container at `/data/`:

- `data/state.json` — active tasks, projects, settings, checklist, analytics.
- `data/completed.json` — `completionLog`, `reference`, `completedProjects`.

Env vars for overriding paths (set in `.env`): `STATE_FILE`, `COMPLETED_FILE`, `IMAGES_DIR`, `FEEDBACK_FILE`, `GOOGLE_CREDENTIALS_FILE`, `STATE_BACKUP_DIR`, `STATE_BACKUP_RETENTION`.

---

### Frontend modules (`app/web_ui/js/`)

**`app.js`** — Entry point. Constructs `TaskManager`, `UIController`, `AnalyticsController`. On `DOMContentLoaded` calls `ui.init()` and `analytics.init()`, then wires standalone DOM features: quick-add form, theme cycle toggle, manual refresh, Pomodoro timer, projects panel shortcuts, markdown sync, and help modal.

**`data.js`** — `TaskManager extends EventTarget`. All business logic, state reads/writes, localStorage cache (`nextflow-state-v1`), server sync, and offline/merge-conflict resolution. Emits `statechange`, `toast`, `syncconflict`, `versionchange`, `connection` events. The single source of truth — `ui.js` and `analytics.js` read state only through `TaskManager` methods.

Key sync flow: every mutation calls `emitChange()` → `save()` → `persistLocally()` (debounced 500ms, flushes immediately on `beforeunload`/`visibilitychange`) + `persistRemotely()` → `flushRemoteQueue()`. On conflict, `mergeStates()` resolves with last-write-wins per entity; `collectRemovalMarkers()` prevents zombie-resurrection of deleted tasks.

Merge granularity: `mergeTasks()` uses `MERGE_FIELD_GROUPS` (groups: `scheduling`, `status`, `dueDate`, `followUpDate`) for per-group LWW using op log timestamps — finer than whole-task `updatedAt`. `mergeSettings()` uses `SETTINGS_MERGE_GROUPS` (groups: `appearance`, `calendar`, `flags`, `lists`) for per-group LWW.

On initial load, `loadRemoteState()` fetches `/state` and `/completed` in parallel. `flushRemoteQueue()` only fetches `/completed` when a conflict is actually detected (not on every flush). Conflict detection uses `slimStateForHash()` to compare only the fields `/state` returns, keeping local and server signatures compatible.

**Op log** (`nextflow-op-log` in localStorage, max 300 entries): every change to `OP_LOG_FIELDS` (`status`, `myDayDate`, `calendarDate`, `calendarTime`, `dueDate`, `followUpDate`) is recorded with a per-entry UUID, timestamp, device identity, task id/title, field name, previous value, and next value. The top 100 entries (`OP_LOG_SHARED_MAX`) are included as `deviceLog` in every server PUT payload and merged back from the remote state on load. Powers the Sync Diagnostics table in the Settings panel (`renderSyncDiagnostics()` in `ui.js`). Device identity is stored in `nextflow-device-info` localStorage key (auto-generated per browser, never sent to a remote service).

**Client PUT payload never includes completion fields** — `writeServerState()` strips `completionLog`, `reference`, and `completedProjects` before sending. The server manages these exclusively in `completed.json`.

**`ui.js`** — `UIController`. All DOM rendering and event handling, organized by panel. `PANEL_RENDER_FNS` is a frozen map of panel-id → render method name — **adding a new panel requires an entry here and a corresponding `render<Panel>()` method**. `_dirtyPanels` is a Set tracking which panels need re-rendering. On `statechange`, `renderAll()` marks all panels dirty and renders only the active one; hidden panels render on-demand when `setActivePanel()` is called. Always-unconditional calls in `renderAll()`: `renderSummary()`, `renderAssociationFlyout()`, `updateSuggestionLists()`, `updateCounts()`, `syncTheme()`, `applyPanelVisibility()`.

All DOM element references are looked up once in `cacheElements()` and accessed via `this.elements.*` throughout — never query the DOM directly inside render methods.

**`analytics.js`** — `AnalyticsController`. Chart rendering only, wrapping `chart.min.js`. Reads from `TaskManager`; no state mutations.

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

Key task fields: `status`, `contexts`, `dueDate`, `followUpDate`, `myDayDate`, `areaOfFocus`, `project`, `waitingFor`, `effortLevel`, `timeRequired`, `recurrence`, `peopleTags`, `notes`.

Key settings fields: `peopleOptions`, `deletedPeopleOptions` (tracks explicitly deleted tags to prevent text-mention resurrection), `contextOptions`, `areaOptions`, `featureFlags`, `staleTaskThresholds`, `theme`, `customTheme`, `customThemePalettes`.

---

### Async panel data loading

`setActivePanel()` handles lazy-loading for panels that need server data beyond `/state`:
- `statistics` / `reports` — calls `taskManager.ensureCompletedLoaded()` then re-renders.
- `settings` — calls `ui.loadFeedbackList()` to fetch `GET /feedback` and populate the admin list.

When adding a panel that needs a separate fetch, hook into `setActivePanel()` with the same pattern.

---

### Google Calendar sync (`app/google_calendar.py`)

Triggered asynchronously after each `POST /state`. Requires `GOOGLE_CREDENTIALS_FILE` (path to service account JSON) and `GOOGLE_CALENDAR_ID` env vars, or per-request settings stored via `POST /credentials/google`. A `_calendar_sync_key` tuple `(calendarId, timezone, duration)` tracks the active config; reinitialises the sync object only when config changes.

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
- Imports `__testing` from `data.js` for access to internal helpers (`mergeStates`, `slimStateForHash`, `hydrateState`, etc.).

New tests should follow this pattern — no server required, no mocking framework.

`SERVER_VERSION` is set to the current git short SHA at startup (falls back to a timestamp if git is unavailable). The frontend uses `_serverVersion` in the `/state` response to detect when the server was redeployed.
