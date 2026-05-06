Context (shared by both slices)

 When a user marks a project Completed via completeProject() (app/web_ui/js/data.js:2224-2250), every active task linked to that project is silently orphaned (task.projectId = null). The task remains in its current status panel
 with no parent — leaving the user with mystery tasks and no historical record of why the project closed with stragglers.

 The recently shipped delete-project flow handles the parallel concern with a three-way modal (showProjectDeleteDialog at ui.js:8929-8971). Project completion never got the equivalent treatment.

 Goal. When completing a project that has unfinished tasks, present each task to the user and let them pick a disposition per task (with a "set all" bulk shortcut). Default per-task disposition: Skip.

 Disposition options:

 ┌─────────────┬────────────────────────────────────────────────────────────────────┬──────────────────────────────┐
 │ Disposition │                            What happens                            │        Archive entry         │
 ├─────────────┼────────────────────────────────────────────────────────────────────┼──────────────────────────────┤
 │ Complete    │ Marked done via completeTask                                       │ yes — "completed"            │
 ├─────────────┼────────────────────────────────────────────────────────────────────┼──────────────────────────────┤
 │ Skip        │ Tombstoned + new createSkipSnapshot(task, "skipped-with-project")  │ yes — "skipped-with-project" │
 ├─────────────┼────────────────────────────────────────────────────────────────────┼──────────────────────────────┤
 │ Keep        │ Orphaned in place (projectId = null), remains in active task lists │ none                         │
 ├─────────────┼────────────────────────────────────────────────────────────────────┼──────────────────────────────┤
 │ Delete      │ Tombstoned + createCompletionSnapshot(task, now, "deleted")        │ yes — "deleted"              │
 └─────────────┴────────────────────────────────────────────────────────────────────┴──────────────────────────────┘

 ---
 Milestone: per-task disposition feature (single milestone, two slices)

 SLICE 1 ── Data-layer extension + tests ── invisible to users, fully back-compat
    │
    ▼
 SLICE 2 ── Disposition modal + stats rendering + review.js wire-up ── user-visible feature

 Slices are sequential: Slice 2 calls the API Slice 1 introduces. No parallel worktrees.

 ---
 Slice 1 — Data-layer extension + tests

 Goal

 Extend completeProject to accept a per-task dispositions map; add a "skipped-with-project" archive type; cover all four disposition paths with unit tests. Fully back-compat — existing callers (no dispositions passed) get today's
 behavior unchanged.

 Done when

 1. completeProject(id, notes, { dispositions: { taskId: "complete"|"skip"|"keep"|"delete" } }) correctly applies each disposition before moving the project to completedProjects.
 2. completeProject(id, notes) with no options behaves identically to today (orphans all tasks).
 3. createSkipSnapshot accepts an archiveType parameter and produces a "skipped-with-project" entry distinguishable from the existing recurring-task "skipped".
 4. New unit tests pass: each disposition path, mixed dispositions, and the back-compat default.
 5. npm test passes overall.

 Layers touched

 - Data: app/web_ui/js/data.js
   - Extend completeProject(projectId, closureNotes, options = {}) at data.js:2224.
   - Generalize createSkipSnapshot at data.js:4008-4014 to accept archiveType (default "skipped" for back-compat).
   - For each task in options.dispositions, branch on disposition value:
       - complete → reuse existing completeTask logic (or inline for atomicity within the same emitChange() window).
     - skip → write state._tombstones[taskId] = now; push createSkipSnapshot(task, "skipped-with-project") to completionLog; remove from state.tasks.
     - keep → set projectId = null (existing behavior, now opt-in).
     - delete → write tombstone; push createCompletionSnapshot(task, now, "deleted") to completionLog; remove from state.tasks (mirror of deleteProject cascade at data.js:2142-2196).
   - Tasks not present in the dispositions map fall back to current behavior (projectId = null) so the data path is safe even if the UI mis-sends a partial map.
   - Set _completionsDirty = true whenever any disposition produced a completionLog entry.
 - Logic: same file (data.js) — no separate logic module.
 - API: none (server doesn't change; sync of tombstones + completionLog already works via existing merge logic).
 - UI: none — Slice 1 does not touch UI. Existing handleProjectCompletionSubmit at ui.js:2485 still calls completeProject(id, notes) without options → orphans everything → unchanged today's behavior.
 - Tests: tests/taskManager.test.js
   - completeProject with no options.dispositions orphans all tasks (back-compat).
   - completeProject with dispositions = { id1: "complete" } writes a completed entry and removes from active tasks.
   - completeProject with dispositions = { id1: "skip" } writes a skipped-with-project entry, tombstones the task, removes from active.
   - completeProject with dispositions = { id1: "keep" } orphans only that task (projectId = null); other tasks fall back to keep.
   - completeProject with dispositions = { id1: "delete" } writes a deleted entry, tombstones, removes.
   - Mixed dispositions over multiple tasks produce expected combined state.
   - createSkipSnapshot(task, "skipped-with-project") archive type is on the snapshot.
   - Sync/merge: a tombstone written by dispositions: skip survives a remote merge from a stale device. (Use existing mergeStates test fixtures.)

 Dependencies

 - Requires: none (back-compat extension on top of current completeProject).
 - Blocks: Slice 2 (UI modal calls this new API).

 Reuse map

 ┌─────────────────────────────────────┬───────────────────────────────────────────────┬──────────────────────────────────┐
 │                Need                 │                Existing helper                │             Location             │
 ├─────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
 │ Cascade-delete-with-archive pattern │ deleteProject cascade branch                  │ data.js:2142-2196                │
 ├─────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
 │ Mark task complete                  │ completeTask                                  │ data.js (grep)                   │
 ├─────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
 │ Skip-archive snapshot               │ createSkipSnapshot                            │ data.js:4008-4014 (generalize)   │
 ├─────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
 │ Deletion-archive snapshot           │ createCompletionSnapshot(task, ts, "deleted") │ data.js                          │
 ├─────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────────┤
 │ Tombstone write                     │ state._tombstones[id] = ISO                   │ deleteTask/completeTask patterns │
 └─────────────────────────────────────┴───────────────────────────────────────────────┴──────────────────────────────────┘

 Verification (Slice 1)

 - npm test — full suite green.
 - node --test --test-name-pattern "completeProject" — focused run.
 - No browser smoke needed — UI doesn't change yet.
