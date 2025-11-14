# GTD Dashboard — Codex Agent Notes

## Snapshot
- Single-page GTD dashboard built with vanilla JS modules (`js/app.js` bootstraps `TaskManager`, `UIController`, `AnalyticsController`).
- State persisted to `localStorage` under `gtd-dashboard-state-v1`; app ships with seeded demo data defined in `js/data.js`.
- No build tooling; served as static assets (`index.html`, `css/`, `js/`, `assets/`, `lib/`).
- Third-party dependencies are vendored: `lib/chart.min.js` (analytics) and `lib/dragdrop.js` (drag interactions referenced by UI).

## Key UX Areas (see `index.html`)
- **Top bar**: quick capture form with optional details, live Inbox + Due Today counters, theme toggle (light/dark), help modal entry point.
- **Sidebar**: weekly summary stats, context/project filters, integration placeholders, weekly review checklist, Pomodoro widget, Markdown import/export controls.
- **Workspace tabs**: Inbox, Next, Waiting, Someday panels share list markup, enable drag/drop plus status-specific action buttons.
- **Projects view**: accordion of active/someday projects with quick add form (`#newProjectForm`) and activate controls.
- **Calendar & Analytics**: mini calendar list fed from `TaskManager.getCalendarEntries`, stacked bar chart rendered via `AnalyticsController`.

## Data / Logic Overview
- `TaskManager` (`js/data.js`)
  - Manages in-memory state + persistence; exposes CRUD helpers for tasks, projects, checklist, theme, analytics, markdown import/export.
  - Status constants: `inbox`, `next`, `waiting`, `someday`; `STATUS_ORDER` drives UI grouping.
  - Markdown sync: parses headings → status via `normalizeStatusToken`, supports metadata tokens (`status::`, `due::`, `📅`, `@context`, `#project`), merges/creates projects on import, exports current state back out.
  - Emits custom events: `statechange` (UI re-render), `toast` (notifications).
- `UIController` (`js/ui.js`)
  - Initializes filters, tabs, collapsible panels, Pomodoro select list, theme syncing (`data-theme` on `.app`).
  - Tracks filter state in-memory; `TAB_STORAGE_KEY` keeps active workspace tab in `localStorage`.
  - Renders list cards, project accordions, counts, calendar, checklist; handles toasts and integration placeholders.
- `AnalyticsController` (`js/analytics.js`)
  - Reads `taskManager.getAnalyticsHistory()` + `getSummary()` to keep stacked bar chart up to date; falls back to manual canvas drawing if `Chart` is missing.
- `app.js`
  - Entry point hooking DOMContentLoaded to init UI + analytics + feature setup: quick add, theme toggle, refresh/resets, Pomodoro timer, project form, markdown sync, help modal.
  - Local `PomodoroTimer` handles simple 25-minute countdown with callbacks tied to focused task selection.

## Styling / Assets
- `css/reset.css` (base) + `css/style.css` (layout, cards, responsive tweaks, dark theme variables).
- Fonts & imagery live under `assets/`; check `assets/fonts` for bundled typefaces referenced in CSS.

## Local Development Tips
- No tooling required; open `index.html` in a browser or serve via any static server (`npx http-server .`, `python -m http.server`).
- Because state persists to browser `localStorage`, use the header refresh button (reloads) or Alt/Meta + refresh (factory reset) to test initial data flows quickly.
- Drag/drop relies on `lib/dragdrop.js`; ensure any future refactors keep module load order intact (scripts loaded at bottom of `index.html`).

## Follow-ups / Questions to Track
1. Clarify target browser support before layering on modern APIs (currently uses `crypto.randomUUID`, `EventTarget`, `CustomEvent`).
2. Determine whether integrations (email/slack/calendar placeholders) should be wired up or remain mock buttons.
3. Confirm if Markdown schema should round-trip additional metadata (priority, energy, etc.) before expanding parser/exporter.
4. Decide on build tooling (bundler, TypeScript, linting) if the project grows; presently everything is edited directly in `js/`.
