# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-06)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.0 Feedback Clearance & Polish — Phase 5: Active Task Views (filtering, bulk edit, UX consistency across panels)

## Current Position

Milestone: v1.0 Feedback Clearance & Polish
Phase: 5 of 7 (Active Task Views) — Not started
Plan: not started
Status: Ready to plan (Phase 4 just closed)
Last activity: 2026-05-07 — Phase 4 closed: 04-01 + 04-02 both shipped on feature/projects-activity-log; transition complete.

Progress:
- Milestone: [███████░░░] 71% (5 of 7 phases complete — 1, 2, 2.5, 3, 4)
- Phase 5: [░░░░░░░░░░] 0% — Not started (3 plans queued)

## Loop Position

Current loop state:
```
Phase 2 (closed):
  02-01 + 02-01-FIX:  PLAN ──▶ APPLY ──▶ UNIFY ──▶ VERIFY    [✓ closed, merged via PRs #26, #27]

Phase 2.5 (closed):
  02.5-01:            PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed, committed addd7a7]

Phase 3 (closed):
  03-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  03-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]

Phase 4 (closed):
  04-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  04-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]

Phase 5 (next — ready to plan):
  05-01, 05-02, 05-03: ○ ──── ○ ──── ○ ──── ○ ──── ○
```

## Accumulated Context

### Decisions

- Kept MutationObserver as primary signal in review.js `_watchClarifyClose`; statechange is fallback only (preserves visual timing)
- Used `display: none` for association flyout when task flyout is open (not z-index) — hides invisible tap target cleanly
- convertedProjectId captured before _completeClarifyStep (state resets during close) — must capture early in finalizeClarifyRouting
- Auto-open project flyout skipped during process sessions (batch clarify) — would conflict with next queued task
- 2026-05-07: Phase 3 re-scoped from a live `GET /feedback` query rather than the 2026-05-06 stripped scope, after finding the prior audit had over-stripped. Future phase audits should always re-query `/feedback` rather than diff against a static snapshot.
- 2026-05-07: Phase 2.5 inserted ahead of Phase 3 by user request. Mirrors urgent-bar pattern (data.js `getUrgentTasks` + ui.js `renderUrgentBar`) for "My Day" (myDayDate==today OR dueDate==today, uncapped) and "Neglected" (top 5 active tasks past `staleTaskThresholds.stale`, default 14 days).
- 2026-05-07: My Day + Neglected CSS uses hardcoded hex (`#2563eb`, `#b45309`) blended via `color-mix(... var(--surface))` — mirrors the existing urgent-bar at `style.css:6498` (`#dc2626`) instead of introducing new `--myday-accent`/`--neglected-accent` theme variables. If the urgent-bar is ever migrated to variables, migrate all three bars together.
- 2026-05-07: Inbox tasks excluded from `getNeglectedTasks()` (inbox is unprocessed, not stale). My Day kept uncapped, Neglected hard-capped at 5; settings UI to tune both deferred to a future plan.
- 2026-05-07 (03-01): Projects panel section heading uses a fresh `.project-create-heading` class (not the existing `.workspace-tool-title`) — different layout context; reusing would carry implicit cascade from rules meant for the workspace-tool sidebar pattern.
- 2026-05-07 (03-01): "Add a new project" heading sits OUTSIDE the form (not as a `<legend>` inside a `<fieldset>`) to keep the existing `aria-label="Create project"` semantics untouched.
- 2026-05-07 (03-01): In-panel "Active" status group label at `ui.js:7793` deliberately preserved — it's a status filter, not the panel title. Boundaries section caught this; future plans should look for shared-vocabulary traps when renaming.

### Deferred Issues

- Process session case for auto-flyout (0bf1bf88): when batch-clarifying, the project flyout is not opened after convert routing to avoid conflict with the next queued task.
- 57 open feedback items not currently in ROADMAP scope. Decide later whether to bucket more into Phases 3–6, draft new phases, or descope the milestone tagline.
- `483a286b` (rename "Move to waiting" + delegate-to-person) is task-flyout work; sitting outside Phase 3 scope but flagged as a candidate.
- Phase 2.5 follow-up candidates (out of scope for 02.5-01): settings UI to tune the Neglected cap (currently hardcoded 5) and the My Day cap (currently uncapped); shared "status-bar" base class refactor of urgent + my-day + neglected once the new bars prove stable.

### Blockers/Concerns

None.

### Git State

- Last commit: `d5a0070` — feat(activity-log): show project activity in the project flyout (Plan 04-02, Phase 4 closer)
- Branch: `feature/projects-activity-log` (TWO commits ahead of main: `aaaa4c0` 04-01 + `d5a0070` 04-02)
- Working tree: clean (modulo this STATE update)
- Pending merge to main as Phase 4 transition.
- Earlier merges: Phase 2.5 (`52abf0b`); Phase 3 (`3c80027`).

## Session Continuity

Last session: 2026-05-07
Stopped at: Phase 4 closed; ready to plan Phase 5.
Next action: `/paul:plan` for Phase 5 (Active Task Views: 7 feedback items across 3 plans). Optional: merge `feature/projects-activity-log` → `main` first.
Resume context:
- Branch: `feature/projects-activity-log` (will be merged to main as part of Phase 4 transition)
- npm test baseline: 179/179 passing
- Phase 5 scope (3 plans):
  - 05-01: Association filters and flyout improvements (`059f0a1e` Area of Focus filter; `f3d948ce` flyout notes/lists always expanded)
  - 05-02: Backlog panel improvements (`bb343993`, `8dac310e`, `1f7139ee`, `2dc7c45a`)
  - 05-03: Bulk edit UX (`fb700fcc`)

---
*STATE.md — Updated after every significant action*
