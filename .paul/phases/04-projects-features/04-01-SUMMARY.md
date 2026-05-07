---
phase: 04-projects-features
plan: 01
subsystem: data
tags: [activity-log, change-tracking, sync, completed-json, vanilla-js, python]

requires:
  - phase: 03-projects-panel-ux
    provides: stable projects panel; activity-log feature does not depend on the rename/heading changes but ships behind them in main
  - discovery: 04-projects-features/DISCOVERY.md
    provides: the data-model and persistence pattern (mirror completionLog) and the 8-event MVP scope

provides:
  - state.projectActivityLog (new collection persisted in completed.json, server-merged like completionLog)
  - _logActivity helper (free function taking state + event details)
  - getProjectActivity(projectId) accessor (project-scoped, oldest-first sort)
  - 8 mutation sites instrumented to emit events: addTask, updateTask (status + projectId), completeTask, deleteTask, restoreCompletedTask, addProject, updateProject, completeProject
  - mergeStates support: dedicated mergeActivityEntries function so cross-device merge keys on `ts` (not `updatedAt`)

affects: [04-02 UI tab consumes getProjectActivity; future plans adding new STATUS values must reconsider emission predicates]

tech-stack:
  added: []
  patterns:
    - "Activity logging: free-function helper takes state, callers pass deviceInfo.label as actor — keeps emission sites compact and matches _logDoingSessionStart style"
    - "Two-entry pattern for cross-project moves: source and destination each get an entry so each project's log is self-contained"
    - "Cross-device merge for ts-keyed collections: dedicated merger inside mergeStates rather than overloading the updatedAt-based mergeCollections"

key-files:
  created: []
  modified:
    - app/server.py
    - app/web_ui/js/data.js
    - tests/taskManager.test.js

key-decisions:
  - "Captured taskTitle into the entry at emit time so the log stays readable after task deletion"
  - "Excluded scheduling fields (myDayDate/calendarDate/calendarTime/dueDate/followUpDate/urgent) from activity log per discovery — only status changes feed it"
  - "addProject sets _completionsDirty (small behavior change) — adjusted one pre-existing test to reset the flag after setup"

patterns-established:
  - "Project-scoped derived data (activity log, future per-project history) lives alongside completionLog in completed.json and reuses its split-persistence + lazy-load story"

duration: ~45min
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 4 Plan 01: Project Activity Log — Data Layer Summary

**The data layer of the project activity log is in place. Every status change, project assignment, completion, deletion, restoration, and project-lifecycle event silently records a structured entry into the same persistence file as completionLog. No UI yet — that's plan 04-02.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45 min |
| Tasks | 3 of 3 |
| Files modified | 3 |
| Tests delta | 160 → 179 (+19 new; 1 pre-existing test updated for the `_completionsDirty` behavior change) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Emission for the 8 MVP event types | Pass | All 8 sites instrumented; cross-project moves emit two entries (source + destination); 11 task-event tests + 4 project-event tests cover the matrix |
| AC-2: Server merges accumulatively | Pass | Server-side `_merge_collection` extended to `projectActivityLog` keyed on `ts`; client-side unit test against `__testing.mergeStates` proves the same behavior locally — overlapping IDs keep the newer ts, no entries lost |
| AC-3: Accessor returns scoped, sorted, non-mutating | Pass | `getProjectActivity` filters by projectId, sorts oldest→newest, slices before sort, returns [] for unknown ids |
| AC-4: Conditional sync payload + round-trip | Pass | `delete sendPayload.projectActivityLog` added inside the existing `!_completionsDirty` block; hydration mergeById added; smoke test confirmed `/state` and `/completed` 200 after restart |

## Accomplishments

- Activity-log data model deployed without inventing a new persistence pathway — the entire feature reuses the `completionLog` story (split file, server-merged accumulator, `_completionsDirty`-conditional PUT, lazy-load via `ensureCompletedLoaded`).
- 8 emission sites wired with consistent shape and idempotent semantics (no double-emit, no emit on no-op updates).
- Cross-project task moves correctly produce two entries so each project's log is self-contained — future UI doesn't need to do cross-references at render time.
- Tests cover both per-event-type emission and the full cross-device merge accumulator behavior at the unit level (no server roundtrip needed in CI).

## Task Commits

Bundled into the Phase 4 feature branch — single commit at the end of UNIFY rather than per-task. Final phase commit will land when Phase 4 closes after 04-02 ships.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/server.py` | Modified | Added `projectActivityLog` to `_COMPLETION_KEYS`; added matching `_merge_collection` call (keyed on `ts`); updated GET /completed docstring |
| `app/web_ui/js/data.js` | Modified | Added `projectActivityLog: []` to two default-state shapes; new `_logActivity` helper next to `_logDoingSessionStart`; new `getProjectActivity` accessor next to `getTaskById`; sync wiring (hydration mergeById, conditional PUT delete, dirty derivation length comparison); 8 emission sites; new `mergeActivityEntries` inside `mergeStates` |
| `tests/taskManager.test.js` | Modified | Added `projectActivityLog: []` to `createManager` fixture; 19 new tests; one pre-existing `deleteProject` test reset to handle the `addProject → _completionsDirty=true` behavior change |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `_logActivity` is a free function taking `state`, not a method on TaskManager | Mirrors `_logDoingSessionStart` style; keeps the emission-site call short; doesn't introduce new `this` coupling | Future emission sites copy the same call shape with no surprises |
| Two-entry emission for cross-project task moves | Each project's log shows the move from its own perspective; no cross-reference logic needed at render time | Slightly higher write volume on moves (acceptable: moves are rare) |
| Capture `taskTitle` snapshot into each entry at emit time | Log entries remain human-readable after the underlying task is deleted | Tiny extra storage per entry; big readability win |
| Dedicated `mergeActivityEntries` inside `mergeStates` (keyed on `ts`) instead of extending `mergeCollections` (keyed on `updatedAt`) | Activity entries carry `ts` not `updatedAt`; overloading `mergeCollections` would have pushed timestamp-field detection into a hot path used by other collections | Clean separation; no behavior change for existing collections |
| Reset `_completionsDirty` in the one pre-existing test that assumed `addProject` doesn't flip it | The flag flip is correct new behavior (project creation IS a state change that needs to sync); the test's intent (verifying deleteProject path on empty project) is preserved | Single-line test change; documented in the SUMMARY |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Found `mergeStates` didn't know to merge the new field — fixed during Task 3 verify |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** One real plumbing gap caught by tests during APPLY. No scope drift.

### Auto-fixed Issues

**1. mergeStates needed dedicated handling for ts-keyed collections**
- **Found during:** Task 3 verify (server-merge unit test failed)
- **Issue:** Plan called for hooking `projectActivityLog` into `mergeById` at hydration time, but `mergeStates` (used during sync conflict resolution) was untouched. `mergeStates`'s helper keys on `updatedAt`, which activity entries don't have, so two devices syncing concurrently would lose local-only entries.
- **Fix:** Added a `mergeActivityEntries` function inside `mergeStates` that keys on `ts`; routed `projectActivityLog` through it.
- **Files:** `app/web_ui/js/data.js` (mergeStates body)
- **Verification:** The server-merge accumulator test now passes — overlapping ids keep the newer `ts`, local-only entries survive.

### Deferred Items

None new beyond what discovery already documented:
- Note edits, dueDate/contexts/etc. field changes — explicitly excluded per feedback wording, can be revisited later
- Server-side prune for very old entries — not needed at v1; can be added when storage actually grows
- Backfill from existing completionLog — discovery decided against (fakes a history that didn't really exist)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Test fixture `createManager` didn't include `projectActivityLog: []` — first-pass tests crashed reading `.length` on `undefined` | Added the field to the fixture's default state |
| `mergeStates` keyed on `updatedAt`; activity entries use `ts` | Added a dedicated `mergeActivityEntries` keyed on `ts` (see Auto-fixed Issues #1) |
| One pre-existing `deleteProject` test broke because `addProject` now flips `_completionsDirty` | Reset the flag after setup in that one test; intent preserved |

## Next Phase Readiness

**Ready:**
- Plan 04-02 (UI tab in project flyout) is unblocked — it can now call `taskManager.getProjectActivity(projectId)` and render
- Server-side support is in place; first activity entries will appear in `data/completed.json` as soon as a real browser session triggers a sync
- Cross-device merge proven via unit test — 04-02 doesn't need to worry about losing entries during normal multi-device usage

**Concerns:**
- Existing projects start with empty logs (intentional — see DISCOVERY.md). The 04-02 UI should handle "no entries yet" gracefully.
- Storage growth is technically unbounded; fine at typical use, may need a server prune knob in a future plan if a power user generates extreme volumes.

**Blockers:**
None.

---
*Phase: 04-projects-features, Plan: 01*
*Completed: 2026-05-07*
