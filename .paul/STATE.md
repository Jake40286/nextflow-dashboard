# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-06)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.0 Feedback Clearance & Polish — Phase 5: Active Task Views (filtering, bulk edit, UX consistency across panels)

## Current Position

Milestone: v1.0 Feedback Clearance & Polish
Phase: 5 of 7 (Active Task Views) — In progress (05-01 + 05-02 closed; 05-03 next)
Plan: 05-02 closed (PLAN/APPLY/UNIFY all ✓); 05-03 ready to plan
Status: 05-02 loop closed
Last activity: 2026-05-07 — UNIFY complete for 05-02. SUMMARY written. Feedback 8dac310e + 2dc7c45a marked resolved. 179/179 tests passing.

Progress:
- Milestone: [███████░░░] 71% (5 of 7 phases complete — 1, 2, 2.5, 3, 4)
- Phase 5: [██████░░░░] 67% — 05-01 + 05-02 closed; 05-03 queued

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

Phase 5 (active):
  05-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  05-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  05-03:              ○ ──── ○ ──── ○             [Ready to plan — bulk-edit redesign]
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
- 2026-05-07 (05-02): Weekly Review per-section guidance pattern — single `#reviewSectionGuidance` element in shared header, toggled by `section.id` in both `_renderCurrentItem` and `_renderHistoricalItem`. Future Review sections that need scoped guidance can extend this pattern instead of inlining per-card.
- 2026-05-07 (05-02): Default `#settingsAccordionLists` open in `index.html` (matches Appearance accordion). Smallest fix for "I see no tags or contexts at all" — closed `<details>` was the cause, not a code regression. Rename/Delete buttons in `panels/settings.js:684-700` were always wired correctly.

### Deferred Issues

- Process session case for auto-flyout (0bf1bf88): when batch-clarifying, the project flyout is not opened after convert routing to avoid conflict with the next queued task.
- 57 open feedback items not currently in ROADMAP scope. Decide later whether to bucket more into Phases 3–6, draft new phases, or descope the milestone tagline.
- `483a286b` (rename "Move to waiting" + delegate-to-person) is task-flyout work; sitting outside Phase 3 scope but flagged as a candidate.
- `bb343993` (apply Backlog UX elements to other pages) descoped from v1.0 milestone 2026-05-07 per user. Feedback record stays open for a future milestone; revisit if user clarifies which elements + which pages.
- Phase 2.5 follow-up candidates (out of scope for 02.5-01): settings UI to tune the Neglected cap (currently hardcoded 5) and the My Day cap (currently uncapped); shared "status-bar" base class refactor of urgent + my-day + neglected once the new bars prove stable.

### Blockers/Concerns

None.

### Git State

- Phase 4 already merged to main as `6164484` (fast-forward).
- Active branch: `feature/active-task-views` for Phase 5; will hold all three Phase 5 plans before merging.
- Earlier merges: Phase 2.5 (`52abf0b`); Phase 3 (`3c80027`); Phase 4 (`6164484`).

## Session Continuity

Last session: 2026-05-07
Stopped at: 05-02 closed on feature/active-task-views; ready to plan 05-03.
Next action: `/paul:plan` for 05-03 — bulk-edit redesign.
Resume context:
- Branch: `feature/active-task-views` (will hold 05-03 before merging Phase 5 to main)
- npm test baseline: 179/179 passing
- 05-03 scope: `fb700fcc` item 3 — bulk-edit draft+Apply/Cancel redesign on Pending Tasks panel, plus Contexts as a multi-value field
- Manual UAT for 05-02 not blocking (feedback already marked resolved); if AC-2 surface still appears empty in browser, revisit diagnostic Step A in 05-02-PLAN.md (CSS / data getter / null element fallbacks)

---
*STATE.md — Updated after every significant action*
