---
phase: 03-projects-panel-ux
plan: 02
subsystem: ui
tags: [vanilla-js, projects-panel, status, gtd, warning-logic]

requires:
  - phase: 03-projects-panel-ux
    provides: 03-01 already shipped panel rename + heading; 03-02 closes Phase 3

provides:
  - Projects panel "no next action" warning now correctly accounts for delegated and in-progress tasks
  - hasNextAction predicate widened: NEXT | DOING | WAITING (was: NEXT only)

affects: [04-projects-features (project activity log), any future plan that adds new STATUS values — must reconsider this predicate]

tech-stack:
  added: []
  patterns:
    - "When 'risk' or 'missing' UI signals derive from task status, the predicate should match GTD semantics, not literal status names — delegated and in-progress are both implicitly 'next'"

key-files:
  created: []
  modified:
    - app/web_ui/js/panels/projects.js

key-decisions:
  - "Included STATUS.DOING in predicate even though feedback only cited delegated — same logical defect, one-character change, narrower scope would leave a near-identical bug for follow-up"
  - "Kept logic in UI layer (panels/projects.js) rather than refactoring into a TaskManager method — refactor is out of scope for a 1-line fix"

patterns-established:
  - "Single-source predicate consumed by multiple UI sites: define the rule once at the map-population step, let consumers read through the map for free inheritance of any future predicate change"

duration: ~5min
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 3 Plan 02: "No Next Action" Warning Logic Summary

**Projects with delegated (`waiting`) or in-progress (`doing`) tasks are no longer wrongly flagged as "missing next action." A delegated task is implicitly the next event (the delegate's response), and a `doing` task IS the action being taken. Only projects with truly stalled work (inbox, someday, completed only) remain flagged. Resolves feedback `3ff676c5`.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5 min |
| Started | 2026-05-07 |
| Completed | 2026-05-07 |
| Tasks | 2 of 2 (1 auto + 1 checkpoint) |
| Files modified | 1 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Delegated work counts as a next action | Pass | `STATUS.WAITING` added to predicate at `panels/projects.js:22`; user verified at checkpoint |
| AC-2: In-progress work counts as a next action | Pass | `STATUS.DOING` added to predicate at `panels/projects.js:21` (judgment call beyond literal feedback wording) |
| AC-3: Truly stalled projects still get flagged | Pass | Inbox, someday, and completed tasks still don't satisfy the predicate; user verified |

## Accomplishments

- One-line predicate change resolved the warning-noise complaint without touching consumer sites
- Discovered and fixed an analogous defect (`doing` tasks) within the same change — narrowest scope without leaving a follow-up bug
- Demonstrated the value of the existing single-source-of-truth pattern (one map populated once, three UI consumers read from it)

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Expand hasNextAction predicate | (pending phase commit) | fix | Add STATUS.DOING and STATUS.WAITING to the at-risk-suppression predicate |

Will be bundled into the Phase 3 transition commit alongside any final state-file updates.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/js/panels/projects.js` | Modified | Lines 19-25: `hasNextAction` predicate now matches NEXT, DOING, or WAITING. Consumer sites at lines 41/45/81 inherit the fix unchanged |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Include `STATUS.DOING` even though feedback only cited delegated | Same logical defect (a `doing`-only project would still be wrongly flagged); the fix is the same one-character change; splitting into a separate plan would mean a second loop for an extension that's literally one OR-clause | Phase 3 fully resolves both the cited and the analogous case in one shot |
| Use explicit-OR form (`a === X \|\| a === Y \|\| a === Z`) instead of `[X,Y,Z].includes(a)` | OR is faster (no per-task array allocation), more grep-able when auditing dependencies on a specific status, and matches existing code style in projects.js | No micro-perf concern at current scale; main benefit is grep-ability |
| Keep logic in UI layer (`panels/projects.js`), not TaskManager | Moving to a TaskManager selector just to add a test would balloon scope; the fix is one line and visible behavior is verified at the checkpoint | Logic stays where it's used; if a future plan needs the same predicate elsewhere, it can extract then |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as written.

### Auto-fixed Issues

None.

### Deferred Items

None new. Note for future maintenance: if a new `STATUS` value is ever added (e.g., a "scheduled" or "blocked" state), this predicate must be revisited — the boundary in 03-02-PLAN.md called this out, and the SUMMARY's `affects` field flags it for future plans.

## Issues Encountered

None.

## Skill Audit

`.paul/SPECIAL-FLOWS.md` not present — skill audit skipped.

## Next Phase Readiness

**Ready:**
- Phase 3 is complete: feedback `1448576c` and `3ff676c5` both resolved
- Phase 4 (Projects Panel — Features: project activity log via `7868b077`) is unblocked

**Concerns:**
- None for Phase 3 itself. Phase 4's activity-log work is "Research: Likely" per ROADMAP — expect a discovery step (data model decisions) before APPLY there.

**Blockers:**
None.

---
*Phase: 03-projects-panel-ux, Plan: 02 (final plan in Phase 3)*
*Completed: 2026-05-07*
