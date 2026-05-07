# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-06)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.0 Feedback Clearance & Polish — Phase 3: Projects Panel — UX

## Current Position

Milestone: v1.0 Feedback Clearance & Polish
Phase: 3 of 7 (Projects Panel — UX) — In progress
Plan: 03-01 closed (PLAN/APPLY/UNIFY all ✓); 03-02 ready to plan
Status: 03-01 loop closed
Last activity: 2026-05-07 — UNIFY complete for 03-01. SUMMARY.md written. 160/160 tests passing. On feature/projects-panel-ux.

Progress:
- Milestone: [████░░░░░░] 43% (3 of 7 phases complete — 1, 2, 2.5)
- Phase 3: [█████░░░░░] 50% — 03-01 closed, 03-02 ready to plan

## Loop Position

Current loop state:
```
Phase 2 (closed):
  02-01 + 02-01-FIX:  PLAN ──▶ APPLY ──▶ UNIFY ──▶ VERIFY    [✓ closed, merged via PRs #26, #27]

Phase 2.5 (closed):
  02.5-01:            PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed, committed addd7a7]

Phase 3 (active):
  03-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed, awaiting commit + 03-02]
  03-02:              ○ ──── ○ ──── ○             [Ready to plan]
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

- Last commit: `addd7a7` — feat(top-bar): add My Day and Neglected status sections (Phase 2.5)
- Branch: `feature/top-bar-status-sections` (NOT yet merged to main — left for user)
- Uncommitted in working tree: `CLAUDE.md` (unrelated git-workflow doc update from earlier session)
- Feature branches merged this phase: none

## Session Continuity

Last session: 2026-05-07
Stopped at: 03-01 UNIFY complete on `feature/projects-panel-ux`; ready to plan 03-02.
Next action: `/paul:plan` for plan 03-02 (suppress "no next action" warning when delegated task exists, feedback `3ff676c5`).
Resume context:
- Branch: `feature/projects-panel-ux` (active, awaiting either 03-02 work or merge to main after 03-02 ships)
- npm test baseline: 160/160 passing
- Summary: `.paul/phases/03-projects-panel-ux/03-01-SUMMARY.md`
- Files touched in 03-01: `app/web_ui/index.html`, `app/web_ui/js/ui.js`, `app/web_ui/css/style.css`
- 03-02 scope hint: feedback `3ff676c5` — suppress the "missing next action" warning on a project when at least one delegated task exists. Likely touches the project-card render path in `ui.js` near the `toggleMissingNextAction` filter logic.

---
*STATE.md — Updated after every significant action*
