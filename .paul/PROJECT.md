# nextflow

## What This Is

A mostly-built self-hosted personal productivity web app — Python 3.11 backend, vanilla ES-module JS SPA, Docker Compose. Tasks, projects, and calendar events live in a single JSON file that every browser on the local network shares in real time. Current focus is refining existing features and clearing the feedback backlog.

## Core Value

Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application |
| Version | 0.1.0 |
| Status | Beta / Active refinement |
| Last Updated | 2026-05-07 (after Phase 6 — v1.0 milestone complete) |

**Production URLs:**
- http://localhost:8002 — Local dev / Docker

## Requirements

### Core Features

- **Capture** — Quickly dump anything into the Inbox; no context required. Fast-entry starting point for everything.
- **Clarify** — Process each inbox item through a guided 9-step modal that asks the right questions (actionable? who owns it? which project? energy level?) and routes it to the correct bucket automatically.
- **Work** — Execute tasks via My Day (focused daily planning), Kanban board (drag tasks through status columns), or Pending Tasks (filtered by context like @Home or @Phone).
- **Review** — Run the Weekly Review workflow to process open loops, check delegated items, clear the inbox, and keep the system trustworthy.
- **Track projects & delegation** — Group related tasks under Projects to see progress; use the Delegated view to follow up on anything waiting on another person or task.

### Validated (Shipped)

- [x] Inbox capture — fast entry, no context required
- [x] 9-step clarify modal with auto-routing
- [x] My Day, Kanban, Pending Tasks panels
- [x] Weekly Review workflow
- [x] Projects & Delegated views
- [x] Real-time multi-browser sync (optimistic locking, conflict resolution)
- [x] Google Calendar sync
- [x] Service worker / offline support
- [x] Gzip state compression, atomic writes, tombstone-based deletion
- [x] Top-bar status sections — My Day + Neglected (Phase 2.5)
- [x] Projects panel UX — accurate panel label + clear add-project affordance + correct "no next action" warning logic (Phase 3)
- [x] Project activity / change log — silently records task and project lifecycle events; visible in a bottom-of-flyout section per project (Phase 4)
- [x] Active Task Views polish — Area-of-Focus filter on association flyout; click-anywhere expand/collapse on Notes / List / Follow-up / Prerequisites flyout sections; multi-edit bar redesigned with draft+Apply/Cancel, "(Mixed)" placeholder for heterogeneous selections, tri-state Contexts chip group (observed all/some/none × intent add/remove); Weekly Review Pending Tasks step gained guidance copy; Settings → Tags & Contexts now visible by default (Phase 5)
- [x] Settings & Convert polish — "Inactive" → "Completed" terminology on Settings task counts; Convert-to-Project carries task.notes → project.vision and task.dueDate → project.deadline alongside the existing areaOfFocus; latent ES-module-scope bug fixed that had silently aborted Settings panel rendering for the Features and Tags & Contexts sections (Phase 6)

### Active (In Progress)

- _v1.0 Feedback Clearance & Polish milestone closed 2026-05-07. No active work in progress. Next milestone TBD via /paul:discuss-milestone._

### Planned (Next)

- To be defined during /paul:plan

### Out of Scope

- None declared

## Constraints

### Technical Constraints

- No build tools — frontend served directly from `app/web_ui/`; no transpilation or bundling step
- State persistence is flat JSON (no database); complex queries must be done in-memory
- Docker bind-mounts: code changes to `app/` are live; changes to `docker-compose.yml` or volumes require full rebuild

### Business Constraints

- None declared

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| No framework (vanilla JS) | Zero build tooling, fast iteration, no dependency churn | Pre-2026 | Active |
| Flat JSON state | Simple, portable, inspectable; fits single-user self-hosted scale | Pre-2026 | Active |
| Python ThreadingHTTPServer | No framework overhead; full control over request handling | Pre-2026 | Active |
| Top-bar pattern: hardcoded hex blended via `color-mix(... var(--surface))` | Mirrors existing urgent-bar; defer migration to theme variables until urgent-bar also migrates | 2026-05-07 | Active (Phase 2.5) |
| "Has next action" predicate matches NEXT, DOING, or WAITING (not just NEXT) | GTD semantics: delegated tasks are implicitly the next event; in-progress tasks ARE the action. Avoids noise on the at-risk warning. Future STATUS additions must reconsider this predicate | 2026-05-07 | Active (Phase 3) |
| Project activity log mirrors the `completionLog` split-persistence pattern (lives in `completed.json`, server-merged accumulator, `_completionsDirty`-conditional sync) | Reuses three battle-tested mechanics; no new persistence machinery; cross-device merge is provably accumulative | 2026-05-07 | Active (Phase 4) |
| Activity log scope: status-change + project-assign + lifecycle events; NOT note edits, dueDate, contexts, etc. | User feedback explicitly said "status of tasks etc. should be logged" / "I wouldn't want some information to become permanent, like notes" | 2026-05-07 | Active (Phase 4) |
| Bulk-edit: draft + Apply/Cancel pattern, Mixed-placeholder for heterogeneous single-value selects, tri-state chips for multi-value fields (Contexts), selection survives Apply with DOM-based view reconciliation | Replaces immediate-apply pattern (which lost selection after every edit and silently overwrote heterogeneous values); follows established Gmail/Linear/Notion conventions | 2026-05-07 | Active (Phase 5) |
| Multi-value bulk-edit fields use tri-state chip cycle (no-change → add → remove → no-change) with observed-state class × intent-state class | Future bulk-edit fields (people-tags, etc.) should mirror this pattern instead of inventing parallel UX | 2026-05-07 | Active (Phase 5) |
| Helpers shared between `panels/<name>.js` modules and `ui.js` must be IMPORTED (or duplicated locally) — never referenced as free identifiers. Object.assign mixin pattern doesn't bridge ES module top-level scope | Two unimported references to ui.js helpers in panels/settings.js threw ReferenceError on every Settings render and silently aborted the function for months. Future panels must avoid the trap | 2026-05-07 | Active (Phase 6) |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Feedback log items resolved | 0 open | TBD | Not started |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend | Python 3.11 `ThreadingHTTPServer` | No frameworks |
| Frontend | Vanilla ES-module JS SPA | No build step |
| Persistence | JSON files on disk | `state.json` + `completed.json` |
| Sync | Optimistic locking + LWW merge | `_rev`, `_fieldTimestamps`, `_tombstones` |
| Deployment | Docker Compose | Port 8002, bind-mounted `./app` and `./data` |
| Calendar | Google Calendar sync | `app/google_calendar.py` |
| Testing | Node built-in test runner | `tests/taskManager.test.js` |

## Links

| Resource | URL |
|----------|-----|
| Repository | /home/jssmith/docker/nextflow |
| App (local) | http://localhost:8002 |
| Feedback log | GET /feedback (server endpoint) |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-05-07 after Phase 6 — v1.0 milestone complete*
