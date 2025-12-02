# Codex Context

## Application Snapshot
- **Stack**: Static GTD dashboard served by `app/server.py` (Python `ThreadingHTTPServer`) with a `/state` JSON API; frontend is vanilla JS modules under `app/web_ui/js/` with CSS in `app/web_ui/css/`.
- **State Flow**: `TaskManager` hydrates from localStorage first, then merges with `/state` (includes conflict resolution, backups, and Google Calendar sync). All filters/settings live in-memory on the client.
- **Recent UX**:
  - Sidebar multi-select filters for context, project, person, waiting-for, energy, and time apply globally (Inbox, Next, Waiting, Someday, Projects, Calendar, Reports, All Active).
  - “All Active” tab aggregates every non-completed task (respecting filters) for a holistic view.
  - Manual sync button in the header triggers an explicit flush/read cycle with user feedback.
  - Task flyout shows origin device slug, calendar times, and allows restore of archived items.

## Sync & Persistence
- **Manual Sync**: `TaskManager.manualSync()` flushes pending changes, reloads remote state, and refreshes local cache when the header “Sync” button is pressed.
- **Google Calendar**: Service-account–based sync writes dated/timed tasks to the configured calendar, stores task→event mappings in `/data/google-events.json`, and supports timezone/duration env vars.
- **Backups**: Every `/state` write produces a gzipped snapshot (`/data/backups/full/state-YYYYMMDD-HHMMSS.json.gz`) via `StateBackupManager`.

## Calendar & Filters
- Calendar grid/list now display times (`HH:MM • Title`) and allow viewing/restoring completed entries.
- Next Actions hide future calendar-scheduled work until the date arrives; due dates still appear.
- Waiting-for filter populates from `task.waitingFor` and filters everywhere, including Projects and Calendar counts.

## Clarify / Workflow Tweaks
- Clarify modal opens directly on “Is this actionable?” with vertical button stacks. Non-actionable choices appear in the order: Someday/Maybe, Reference, Trash.
- Two-minute question defaults to “No — Continue”; Yes remains available beneath it.

## Tasks & Metadata
- Tasks carry device slugs, recurrence rules, calendar time, and short slugs for reference.
- Deleting a task moves it to the deletion log and prevents it from resurfacing during merges; deleted entries are filtered out of completed views.

## Testing & Commands
- No build tooling; run `npm test` to execute the Node test suite (`tests/taskManager.test.js`).
- Docker deployment: `docker compose up --build -d` (with `/data` and `/secrets` mounts) exposes the dashboard plus `/state` API.
