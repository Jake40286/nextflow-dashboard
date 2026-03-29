# GTD Dashboard — Feedback Backlog

> Generated from `data/feedback.json`. Use `@feedback.md` to load this context.
> Last reviewed: 2026-03-29 | Last updated: 2026-03-29 (sync pass: marked 4 resolved bugs)

---

## Open Bugs

### ~~`576fc9d2` — Date on task cards shows one day behind~~ ✓ Resolved
Fixed 3 bare `new Date(YYYY-MM-DD)` calls: `isTaskOverdue()` (`ui.js:7783`), `getDueUrgencyClass()` (`ui.js:7790`), and the `calendarCursor` assignment from the date filter input (`ui.js:370`). All now append `"T00:00:00"` to force local-time parsing.

---

### ~~`7d64073d` — Feedback button overlaps flyout close button~~ ✓ Resolved
`openTaskFlyout()` adds `body.flyout-open`; `closeTaskFlyout()` removes it. CSS shifts `.feedback-widget` left by `min(520px, 100%) + spacing` when flyout is open. (`ui.js:6200`, `style.css:3463`)

---

### ~~`188efa59` — Next action from project defaults to first physical context~~ ✓ Resolved
Removed `fallbackContext` variable and fallback entirely. New next-action tasks from the project panel now default to `contexts: []`. (`ui.js:1875`)

---

### ~~`4949dee0` — Area of Focus dropdown stale in flyout after adding new area~~ ✓ Resolved
Already fixed — `populateAreaSelect()` is called inside `renderTaskFlyout()` (`ui.js:6929`), which re-runs on every statechange when the flyout is open (statechange handler at `ui.js:551`).

---

### ~~`99168b1f` — Renaming a people tag creates a duplicate instead of updating~~ ✓ Resolved
`renamePeopleTag()` now updates all tasks, reference, and completionLog entries, then rebuilds `peopleOptions` via `normalizePeopleOptions()` from scratch — old tag is never re-added. (`data.js:1841`, `f66e731`)

---

### ~~`79820da9` — Setting a follow-up date also sets the due date~~ ✓ Resolved
Clarify flow now uses `dueType` to route exclusively: `followUp` sets only `followUpDate`; `due` sets only `dueDate`. Both fields start as `null` in the update payload. (`ui.js:6056-6143`, `f66e731`)

---

### ~~`98ea1fd1` — Unable to delete people tags~~ ✓ Resolved
`deletePeopleTag()` was not calling `emitChange()` after mutating state. Fixed — deletion now persists. (`data.js:1887`, `fb03475`)

---

### ~~`4853dfca` — Deleting a people tag reverts on page refresh~~ ✓ Resolved
`deletePeopleTag()` now strips the deleted tag from `peopleOptions` both before and after `normalizePeopleOptions()`, preventing re-addition from text-mention scanning. (`data.js:1913-1918`, `eed3ffb`)

---

### ~~`998317c5` — data/ files owned by root, can't edit from host CLI~~ ✓ Resolved
`Dockerfile` now creates `appuser` (UID/GID 1000), chowns `/app`, `/data`, `/secrets`, and sets `USER appuser`. `docker-compose.yml` adds `user: "1000:1000"`. **One-time host fix needed for existing installs:** `sudo chown -R $USER:$USER ./data`.

---

## Open Features

### UX / Clarify Flow

#### ~~`160e09e2` — Show description field after "Is it actionable?" step~~ ✓ Resolved
Already implemented — `clarifyDescSummary` (editable div) is part of `clarifyActionableSummary` which shows after the actionable question is answered, pre-filled at `ui.js:5431`.

#### ~~`d0a97ecf` — Reword "Is this actionable?" prompt~~ ✓ Resolved
Already updated — `index.html:725` reads "Does this need to be done?"

#### `8ac04bf5` — Someday/Maybe tasks lack up-front processing
**Solution (two options):**
- **Option A (minimal):** At step 9 of clarify, when routing to Someday, require at least one context or effort tag before saving — gentle friction without a full extra step.
- **Option B (periodic review):** Add a "Review Someday" mode that surfaces items older than N days for quick re-clarification. Triggered manually from the Someday panel header. No schema changes needed — use `updatedAt` threshold.

---

### Next Actions / Task Views

#### ~~`c96dee98` — "Just Get Started" button (low-effort, low-time auto-select)~~ ✓ Resolved
`pickRandomTask()` now filters for `effortLevel === "low"` + `timeRequired === "<5min"|"<15min"` before falling back to any next task. (`ui.js:4201`)

#### ~~`964a6d9` — Click context column header to filter~~ ✓ Resolved
Context column headers now have `is-filterable` class when `groupBy === "context"`. Click sets `this.filters.context = [group.key]`; click again toggles off. Active header gets `is-active` styling. (`ui.js:1556`, `style.css:1184`)

#### ~~`cfa1cda4` — Sort option: "days since touched"~~ ✓ Resolved
Added `case "stale-first"` to `sortTasks()` sorting by `updatedAt` ascending. New "Longest untouched" option added to sort `<select>`. (`ui.js:1317`, `index.html:271`)

#### ~~`a0f30d40` — Hide "No Area" group when empty~~ ✓ Resolved
`buildNextActionsGroups()` only creates the "No Area" group when tasks without an area exist — dynamic grouping, no static "No Area" bucket. Already implemented.

---

### Projects

#### ~~`a58267c5` — Project Notes: aggregate task notes chronologically~~ ✓ Resolved
Collapsible "Notes (N)" `<details>` section appended to each expanded project body. Flatmaps all `task.notes[]` from project tasks, sorts by `createdAt`, renders as a left-bordered list with task title + date metadata. (`ui.js` ~2066, `style.css` `.project-notes-section`)

#### `a110e190` — Detect and merge duplicate projects
**Solution:** On the Projects panel, add a "Find duplicates" utility that compares project names using simple string similarity (Levenshtein or token overlap — no external library needed). Surface matches as a list with a "Merge into…" action that: (1) reassigns all tasks from the source project to the target, (2) merges `nextTaskIds`, (3) archives/deletes the source. Entirely in `ui.js` + `TaskManager.updateTask()` — no server changes.

#### ~~`2cb80f40` — Statistics: click project in Project Health for detail panel~~ ✓ Resolved
Project health rows are now clickable — each row object includes `projectId`. `renderStatisticsRows()` now accepts an `onItemClick` option that adds `is-clickable` styling and a click handler. Clicking a project navigates to the Projects panel and expands + scrolls to that project. (`ui.js` ~2685, ~2897)

#### ~~`f4c15cd1` — Show active task count on collapsed project rows~~ ✓ Resolved
Already implemented — `<span class="badge project-task-count">` is rendered in the project `<summary>` at `ui.js:1783`.

---

### Task Model / Metadata

#### `b93adb40` — Inline references in task titles (`#Project`, `+Person`, `task:slug`)
**Solution:** Two-phase approach:
1. **Input:** On title save (flyout or quick-add), parse the title for `#Word`, `+Name`, `task:slug` tokens. Auto-set `projectId`, `peopleTag`, or `waitingFor` if matched and currently unset. Show a confirmation toast: "Linked to project X."
2. **Display:** In `createTaskCard()`, use a regex to wrap matched tokens in `<span class="inline-ref">` for styled rendering.

`PEOPLE_TAG_PATTERN` already exists in `data.js`. No schema changes — these are derived links, not stored as a separate field.

#### ~~`8f749edc` — Effort level tooltip definitions~~ ✓ Resolved
Already implemented — effort `<option>` elements in `index.html` already carry `title` attributes with Low/Medium/High definitions.

#### `303d6941` — Shopping list (lightweight task variant)
**Solution (two options):**
- **Option A (simplest):** Add a `@Errands` quick-add shortcut that creates an inbox task with `timeRequired: '<5min'`, `effortLevel: 'low'`, and `context: ['@Errands']` pre-filled. No schema change.
- **Option B (proper list):** Add a `listItems[]` fast-entry mode — the field already exists on tasks. Create a dedicated "Lists" panel that renders tasks with `listItems.length > 0` and no other metadata, with a streamlined checklist UI. No server changes needed.

---

### Reports / Statistics

#### ~~`0358c466` — "Remove" button on restored tasks in weekly report~~ ✓ Resolved
Added "Remove from report" button alongside View/Restore in `renderReportDetails()`. On click, adds the task ID to `this._hiddenReportTaskIds` (session-only `Set`) and re-renders details. Tasks in the set are filtered out before rendering. (`ui.js` ~4140, ~4210)

---

### Infrastructure / Sync

#### ~~`3e2f3dc5` — Completed tasks server-only, excluded from client sync payload~~ ✓ Resolved
`writeServerState()` now destructures out `completionLog`, `reference`, and `completedProjects` before serialising the PUT body. (`data.js:285`)

---

### Mobile / Accessibility

#### `396fc729` — Full mobile-friendly layout
**Solution:** This is a multi-week effort given `ui.js` is ~8400 lines of DOM manipulation. Prioritized approach:
1. **Phase 1:** Fix the most-used panels (Inbox, Next, MyDay) with responsive breakpoints in `style.css` — collapse columns, stack cards vertically.
2. **Phase 2:** Make the flyout full-screen on narrow viewports (`@media (max-width: 768px) { .task-flyout { width: 100vw } }`).
3. **Phase 3:** Kanban and Statistics panels — lowest priority, most complex.
No JS changes required for phases 1-2; CSS-only.

---

### Notifications

#### `5953b8c8` — Email digests (daily/weekly)
**Solution:** Requires a new background service. Options:
- **Simple (no new deps):** Add a `/digest` endpoint to `server.py` that generates an HTML summary. Set up a host-level cron (`crontab`) or Docker cron container that POSTs to `/digest` and pipes output to `sendmail`/`msmtp`.
- **Integrated:** Add a `digest_scheduler.py` module that runs a background thread checking time, formats HTML from state, and sends via SMTP (credentials stored in `.env`). Settings page already has a config section pattern to follow.

---

### Admin / Settings

#### ~~`df67a01d` — View/edit feedback reports from GUI~~ ✓ Resolved
Feedback section in Settings now loads and renders all items on panel activate. Bugs listed first, then features. Each item shows a "Resolve" button (calls `PATCH /feedback`); "Clear resolved" button removes resolved items. (`ui.js:loadFeedbackList`, `index.html:580`)
