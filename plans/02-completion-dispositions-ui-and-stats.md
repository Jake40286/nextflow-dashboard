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

 Slice 2 — Disposition modal + stats rendering + review.js wire-up

 Goal

 Surface the new per-task dispositions in the UI: insert a new "Resolve remaining tasks" modal between the user clicking "Complete project" and the existing closure-notes modal. Render the new "skipped-with-project" archive type
 distinctly in stats. Decide and wire up the review-flow behavior.

 Done when

 1. Completing a project with ≥ 1 active task shows the new disposition modal with one row per task.
 2. Each row has a <select> with Complete / Skip / Keep / Delete (default: Skip).
 3. Header has "Apply to all: [select] [Apply]" — clicking sets every per-row select to the chosen value (does not auto-submit).
 4. "Continue" forwards dispositions into the existing closure-notes modal flow; "Cancel" aborts the entire completion.
 5. Completing a project with zero active tasks skips the new modal entirely (goes straight to closure notes — current behavior).
 6. Statistics/Reports panel(s) render "skipped-with-project" distinctly from "completed".
 7. review.js:815 either shows the same modal or explicitly bypasses it (decision documented in PR).
 8. Browser smoke checklist below passes.

 Layers touched

 - Data: none (Slice 1 already shipped the data path).
 - Logic: app/web_ui/js/ui.js
   - New showProjectCompleteTaskDispositionModal(projectName, unfinishedTasks) near showProjectDeleteDialog (ui.js:8928). Returns Promise<{ dispositions } | null>.
   - Modify openProjectCompleteModal (ui.js:2366) to compute unfinished tasks first, call the new modal if non-empty, then proceed to closure-notes carrying dispositions through.
   - Modify handleProjectCompletionSubmit (ui.js:2485) to pass { dispositions } into completeProject.
   - DOM lookups go through cacheElements per project convention; never query DOM directly inside the modal builder.
 - UI:
   - New modal markup (built dynamically by the new function, matching showProjectDeleteDialog's pattern).
   - CSS for the per-row disposition list — extend whichever stylesheet hosts .project-delete-dialog styles. Reuse tokens.
 - Stats rendering: app/web_ui/js/panels/statistics.js and/or panels/reports.js
   - Recognize "skipped-with-project" as a distinct grouping. Render alongside completed (e.g., a "Skipped" tally).
   - Existing "skipped" (recurring-task skips) should NOT be conflated — keep them either separate or grouped under a parent "Skipped" with sub-buckets, depending on what feels right when you see the panel.
 - Review flow: app/web_ui/js/review.js:815
   - Decide: show the disposition modal mid-review (parity, more friction) or pass { dispositions: {} } explicitly (current behavior, preserves review momentum). Default recommendation: show the modal — the user is already in a
 deliberate-decisions mindset.
 - Tests: tests/taskManager.test.js — minimal additions, since the data path is covered in Slice 1. Optionally add a thin integration test that exercises openProjectCompleteModal → handleProjectCompletionSubmit → completeProject
 end-to-end (DOM-lite, no full browser).

 Dependencies

 - Requires: Slice 1 (consumes completeProject dispositions API).
 - Blocks: nothing.

 Verification (Slice 2 — browser)

 After docker compose up --build -d, at http://localhost:8002:
 1. Create a project "Test" with 4 tasks across next, waiting, someday.
 2. Click "Complete project" → verify new modal appears with all 4 rows, default Skip on each.
 3. Click "Apply to all: Complete" → verify all rows update.
 4. Override row 2 → Keep, row 3 → Delete, row 4 → Skip.
 5. Click Continue → closure-notes modal opens.
 6. Submit closure notes → verify:
   - Row 1 task: in completionLog as "completed", removed from active.
   - Row 2 task: in active list, projectId = null.
   - Row 3 task: in completionLog as "deleted", has tombstone, removed from active.
   - Row 4 task: in completionLog as "skipped-with-project", has tombstone, removed from active.
   - Project is in completedProjects.
 7. Open Statistics panel → verify "skipped-with-project" count appears.
 8. Edge: complete a different project with zero active tasks → verify new modal does NOT appear.
 9. Edge: open new modal then click Cancel → verify project is NOT completed and closure-notes modal does NOT open.
 10. Sync: complete a project with mixed dispositions on device A → device B picks up changes via existing merge without conflict.

 ---
 Out of scope (both slices)

 - Re-opening completed projects.
 - Bulk-completing projects.
 - Changing the existing deleteProject cascade UX.
 - New skipped status on active tasks (we use a completion-log archive type only).
 - Notification / undo of project completion.
