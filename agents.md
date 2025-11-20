# GTD Dashboard — Codex Agent Notes

## Snapshot
- Dockerized Python `ThreadingHTTPServer` serves `app/web_ui` static assets and exposes a `/state` JSON API (reads/writes `STATE_FILE`, defaults to `/data/state.json`, with dated backups in `STATE_BACKUP_DIR`).
- Single-page GTD dashboard built with vanilla JS modules (`js/app.js` bootstraps `TaskManager`, `UIController`, `AnalyticsController`).
- State loads from `localStorage` (`gtd-dashboard-state-v1`) and, when fetch is available, syncs with the `/state` endpoint; seeded demo data lives in `js/data.js`.
- No build tooling; served as static assets (`index.html`, `css/`, `js/`, `assets/`, `lib/`).
- Third-party dependencies are vendored: `lib/chart.min.js` (analytics) and `lib/dragdrop.js` (drag interactions referenced by UI).

## Key UX Areas (see `index.html`)
- **Top bar**: quick capture form with optional details, live Inbox + Due Today/Overdue counters, theme toggle, help modal entry point.
- **Sidebar**: weekly summary stats, multi-select filters (context/project/person/energy/time), integration placeholders, Pomodoro widget, Markdown import/export controls.
- **Workspace**: Inbox, Next, Waiting, Someday panels share list markup, allow drag/drop, and expose task flyout with workflow transitions + completion/closure flows.
- **Clarify modal**: guided Capture → Clarify → Organize steps (actionable check, next action, project link/creation, date selection, delegate/waiting).
- **Projects view**: accordion of active/someday projects with quick add form (`#newProjectForm`), activate controls, and project completion modal (wrap-up notes).
- **Calendar & Review**: calendar list from `TaskManager.getCalendarEntries`; Reports tab groups completions by week/month/year with context/project filters; random next-action picker.

## Data / Logic Overview
- `TaskManager` (`js/data.js`)
  - Manages in-memory state + persistence; reads local storage first, then attempts remote `/state` fetch/write (PUT/POST fallback) with toast warnings on failure.
  - Status constants: `inbox`, `next`, `waiting`, `someday`; `STATUS_ORDER` drives UI grouping. Tasks track context, people tag, energy level, time required, assignee, waitingFor, due/calendar dates, and optional closure notes.
  - Projects carry tags for area/theme/status plus deadlines; completed projects store closure notes and snapshots; completionLog/reference track archived tasks.
  - Markdown sync: parses headings → status via `normalizeStatusToken`, supports metadata tokens (`status::`, `due::`, `calendar::`/`📆`, `waiting::`, `owner::`, `@context`, `#project`), merges/creates projects, exports current state back out.
  - Emits custom events: `statechange` (UI re-render), `toast` (notifications).
- `UIController` (`js/ui.js`)
  - Initializes filters, tabs, collapsible panels, Pomodoro select list, theme syncing (`data-theme` on `.app`), random task picker, and completion reporting filters.
  - Tracks filter state in-memory; `TAB_STORAGE_KEY` keeps active workspace tab in `localStorage`.
  - Renders list cards, project accordions, completed projects (editable closure notes), counts, calendar, reports, and handles toasts/integration placeholders.
  - Task flyout provides inline editing plus workflow buttons; Clarify modal guides inbox processing; project completion modal captures wrap-up notes.
- `AnalyticsController` (`js/analytics.js`)
  - Reads `taskManager.getAnalyticsHistory()` + `getSummary()` to keep stacked bar chart up to date; falls back to manual canvas drawing if `Chart` is missing.
- `app.js`
  - Entry point hooking DOMContentLoaded to init UI + analytics + feature setup: quick add, theme toggle, refresh/resets, Pomodoro timer, project form, markdown sync, help modal.
  - Local `PomodoroTimer` handles simple 25-minute countdown with callbacks tied to focused task selection.

## Backend / Ops
- `app/server.py`: threaded HTTP server serving `web_ui` and `/state` JSON. Env vars `HOST`/`PORT` (default `0.0.0.0:8000`), `STATE_FILE` for shared state path, `STATE_BACKUP_DIR` for dated backups; uses a lock to guard concurrent writes and logs failures to stderr.
- Docker: `Dockerfile` copies `app/` into `python:3.11-slim`, exposes 8000. `docker-compose.yml` maps `./app` and `./data` into the container, loads `.env`, and runs `python server.py` (host port defaulted to `8002:8000` in compose).

## Styling / Assets
- `css/reset.css` (base) + `css/style.css` (layout, cards, responsive tweaks, dark theme variables).
- Fonts & imagery live under `assets/`; check `assets/fonts` for bundled typefaces referenced in CSS.

## Local Development Tips
- No tooling required; open `index.html` in a browser or serve via any static server (`npx http-server .`, `python -m http.server`).
- Docker path: `cp .env.example .env`, set `STATE_FILE`/`HOST`/`PORT`, then `docker compose up --build -d`. Shared state writes land in `./data` via bind mount; `/state` API keeps multiple browsers in sync.
- Because state persists to browser `localStorage` and server JSON, use the header refresh button (reloads) or Alt/Meta + refresh (factory reset) to test initial data flows quickly.
- Drag/drop relies on `lib/dragdrop.js`; ensure any future refactors keep module load order intact (scripts loaded at bottom of `index.html`).

## Follow-ups / Questions to Track
1. Clarify target browser support before layering on modern APIs (currently uses `crypto.randomUUID`, `EventTarget`, `CustomEvent`).
2. Determine whether integrations (email/slack/calendar placeholders) should be wired up or remain mock buttons.
3. Confirm if Markdown schema should round-trip additional metadata (e.g., energy/time tags, closure notes) before expanding parser/exporter.
4. Decide on build tooling (bundler, TypeScript, linting) if the project grows; presently everything is edited directly in `js/`.
5. Define retention/rotation expectations for `/data/state.json` backups and whether the server should validate payload shape before writing.
