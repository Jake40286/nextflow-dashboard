# Technical Debt

_Captured automatically after /simplify and /review. Review before starting related work._

---

## 2026-05-04 — feature/recurring-catch-up-skip

### From /simplify
- [ ] `app/web_ui/js/data.js` (multiple call sites: ~1655, ~1923, ~2158, ~4001, new ~4011) — `archiveType` values (`"reference"`, `"completed"`, `"deleted"`, `"skipped"`) are bare strings; should be promoted to an `ARCHIVE_TYPE` constants object alongside `STATUS`/`RECURRENCE_TYPES`.
  - Why deferred: pre-existing pattern of bare strings — fixing it means touching unrelated call sites; out of scope for the catch-up-skip feature
  - Resolve when: someone touches archive-type filtering logic (e.g. adds a "neglect chart" or new archive type), or as a standalone cleanup PR

- [ ] `app/web_ui/js/data.js` `computeNextRecurrenceDates` return shape — `skipped` field could be renamed to `cyclesAdvanced` so the caller's `>= 2` guard reads as intent.
  - Why deferred: would churn the public-ish return shape and tests for cosmetic gain
  - Resolve when: TBD — bundle with any other rename of the recurrence helpers

- [ ] Reports panel (`app/web_ui/js/`) — confirm no UI breakage from the new `archiveType: "skipped"` completionLog entries; consider surfacing skipped/neglect history in Statistics.
  - Why deferred: plan explicitly said "Do not add UI surfacing for skipped entries in this PR; keep scope tight"
  - Resolve when: user requests a "neglect chart" or files a follow-up

### From /review
- [ ] `app/web_ui/js/data.js:4793` — `skipped` aggregated via `Math.max` across due / calendar / fallback bases; if `dueDate` is current but `calendarDate` is months stale (or vice versa), the max can cross the `>= 2` catch-up threshold and the stored `skippedCount` then reflects whichever base drifted furthest, not "occurrences skipped."
  - Why deferred: nit; in practice the two dates usually move together
  - Resolve when: a user reports a confusing "Skipped N occurrences" toast, or pick one canonical base (prefer `dueDate`, fall back to `calendarDate`) for the count

- [ ] `app/web_ui/js/data.js:1746` — single missed cycle still says "Skipped 2 occurrences" because `skipped === 2` covers "advance past yesterday + advance to today" (only 1 actually missed); toast overstates what happened.
  - Why deferred: nit; cosmetic wording issue
  - Resolve when: bundled with other UX polish — cheap fix is `skipped - 1` in the user-facing string, or reword to "Caught up N cycles"

- [ ] `app/web_ui/js/data.js:4762` — `catchUpRecurrence` has no iteration cap; relies on `advanceRecurrence` being monotonic and eventually returning `null` or a date `>= today`.
  - Why deferred: not actually reachable today; safe given current `advanceRecurrence` invariants
  - Resolve when: any change to `advanceRecurrence` semantics — add a `for (let i = 0; i < 10000; i++)` guard with `console.warn` on overrun as cheap insurance

- [ ] `app/web_ui/js/data.js:1758` — `nextDate: nextIso` may store the literal string `"unknown"` if invariants drift (currently unreachable because `isCatchUp` requires at least one successful advance).
  - Why deferred: not reachable today
  - Resolve when: refactoring `createSkipSnapshot` — set `nextDate: next ? formatIsoDate(next) : null` independent of the toast string

- [ ] `app/web_ui/js/data.js:4012` — `createSkipSnapshot` overrides `snapshot.status = STATUS.NEXT` without explanation; not obvious to a reader why skip retains live status while completion/deletion replaces it.
  - Why deferred: nit; one-line comment would suffice
  - Resolve when: next touch to `createSkipSnapshot` or `createCompletionSnapshot`

- [ ] `tests/taskManager.test.js:381` — `isoDateOffsetDays` uses `new Date()` directly; tests are time-dependent and could flake if a run straddles midnight UTC.
  - Why deferred: low risk for current Node test runs; "Not worth fixing now"
  - Resolve when: CI is added on a slow machine, or any flake is observed — pass a fixed "today" into `skipRecurringTaskInstance` or stub the clock

### From /review (round 2)
- [ ] `app/web_ui/js/data.js:4011` — `snapshot.status = STATUS.NEXT` clobbers the live task's status (e.g. `SOMEDAY`, `WAITING`); skipped entries are filtered from stats so it's mostly cosmetic, but preserving `task.status` would be more honest.
  - Why deferred: cosmetic; skipped entries don't feed stats today
  - Resolve when: skipped entries surface anywhere status matters (e.g. neglect chart, history detail view)

- [ ] `app/web_ui/js/data.js:1741` — `skippedThrough: formatIsoDate(today)` reads as "skipped through today, next is today" when catch-up lands exactly on today. Semantically odd but only matters if a future UI surfaces this field.
  - Why deferred: not user-visible today
  - Resolve when: any UI starts rendering `skippedThrough`

- [ ] `tests/taskManager.test.js` — no test covers the skip-snapshot dedup-on-merge path: calling `skipRecurringTaskInstance` twice on the same recurring task and verifying both entries survive an `ensureCompletedLoaded` round-trip (or a direct `mergeStates` of two skip snapshots with the same `sourceId`). Would have caught the duplicate-id bug fixed in this PR.
  - Why deferred: fix landed; coverage gap noted for follow-up
  - Resolve when: next touch to `createSkipSnapshot` or completion-merge logic — add a regression test that two consecutive skips on the same task produce two distinct entries after a merge round-trip

## 2026-05-05 — feature/completion-dispositions-data-layer

### From /simplify
- [ ] `app/web_ui/js/data.js:2245` — disposition values (`"complete"`, `"skip"`, `"keep"`, `"delete"`) are bare strings; should be promoted to a `DISPOSITION` constants object (relates to the existing `ARCHIVE_TYPE` debt item above).
  - Why deferred: no constants exist; adding them would be scope creep for the data-layer slice; Slice 2 UI will also reference these values and is the natural point to introduce constants
  - Resolve when: Slice 2 implementation, or when the ARCHIVE_TYPE constant cleanup is tackled

- [ ] `app/web_ui/js/data.js` (~1642, ~1922, ~2154, ~2234) — `this.state._tombstones[task.id] = now` is repeated verbatim at four call sites (`completeTask`, `deleteTask`, `deleteProject`, `completeProject`); a `_writeTombstone(id, ts)` helper would centralize the write.
  - Why deferred: touches code outside the diff scope; out of scope for data-layer slice
  - Resolve when: standalone cleanup PR, or next time tombstone semantics change

- [ ] `app/web_ui/js/data.js` (`deleteProject` ~2154 and `completeProject` ~2232) — bulk-archive loop (build `remaining`/`newEntries`/`removedIds`, splice tasks, prepend log, set dirty) is structurally identical in both methods (~10 lines); could be extracted into a private `_archiveTaskBatch` helper.
  - Why deferred: both call sites work correctly; out of scope for the data-layer slice
  - Resolve when: a third caller appears, or as a standalone cleanup PR

- [ ] `app/web_ui/js/data.js` (`completeTask` ~1645 and `completeProject` ~2248) — the `_closeDoingSession(task, now)` + `normalizeTaskTags(task)` + `createCompletionSnapshot(task, now, "completed")` sequence is duplicated; could be a shared `_snapshotCompletedTask(task, ts)` helper.
  - Why deferred: out of scope for the data-layer slice; `completeTask` has additional side effects (emitChange, recurrence, unlock) that make a shared helper subtle
  - Resolve when: next touch to `completeTask` or the disposition loop

### From /review
- [ ] `app/web_ui/js/data.js:2249` — an unrecognized disposition string (not one of the four valid values) falls into the `else` branch: writes a tombstone and removes the task with no archive entry, silently losing it.
  - Why deferred: not reachable by any current or planned caller — `?? "keep"` already handles the absent-key case, and Slice 2 UI presents exactly four options; "Not currently reachable via any caller"
  - Resolve when: Slice 2 implementation — add an explicit `else if (disposition === "delete")` without a catch-all, or add a guard/warn for unknown values

- [ ] `app/web_ui/js/data.js:2257` — `createSkipSnapshot` called without `skipped` → `snapshot.skippedCount = undefined`, which is omitted from JSON; an explicit `null` would be more consistent with recurring-task skip entries.
  - Why deferred: nit; semantically appropriate (no cycle count for a one-shot project-completion skip); `skippedCount` is not read by any current consumer
  - Resolve when: next touch to `createSkipSnapshot`, or if a UI starts rendering `skippedCount` for archive entries

## 2026-05-06 — feature/urgent-flag

### From /simplify
- [ ] `app/web_ui/js/ui.js:1219` — `renderUrgentBar()` is structurally identical to `renderDoingBar()` (line 1181); both share the same fragment/chip/click-handler skeleton with only data source, label, and chip class differing; a shared `_renderStatusBar(barEl, tasks, labelText, chipClass, chipContentFn)` helper would eliminate the duplication.
  - Why deferred: would require modifying pre-existing `renderDoingBar()`; doing-bar has additional state (body class toggle, timer span child elements) that makes a shared helper non-trivial; out of scope for the urgent-flag feature
  - Resolve when: a third status bar is added, or as a standalone cleanup PR

- [ ] `app/web_ui/css/style.css:6480` — `urgent-bar` / `urgent-chip` block duplicates ~8 declarations already present in the pre-existing `doing-bar` / `doing-chip` block (line 6403): `display:flex; align-items:center; gap; overflow-x:auto; scrollbar-width:none; flex-shrink:0; border-radius:var(--radius-pill); transition`; a shared `.status-bar` / `.status-chip` base class would eliminate the repetition.
  - Why deferred: all duplicated rules live in pre-existing doing-bar CSS; modifying it is out of scope for the urgent-flag feature
  - Resolve when: the `_renderStatusBar` helper above is extracted, at which point the CSS base class refactor is natural to do in the same PR

- [ ] `app/web_ui/js/data.js:931` — `getUrgentTasks()` is a one-line filter that duplicates what `getTasks()` already handles (minus an `urgent` param); adding `urgent` as a boolean filter param to `getTasks()` would eliminate the dedicated method and follow the existing `status` / `context` / `effort` filter pattern.
  - Why deferred: adding a param to `getTasks()` modifies a heavily-used method with many callers; risk outweighs the gain from a single dedicated method that is clear and low-risk
  - Resolve when: a second caller of urgent-filtered tasks appears, or as part of a `getTasks()` filter audit

- [ ] `app/web_ui/js/ui.js:1685` — `urgentFirst` and `blockedLast` in `sortTasks()` are the same pattern (map task to binary `0|1` score, subtract); a `flagComparator(predFn, pushDown)` helper would prevent this pattern from multiplying if a third sort-priority dimension is added (e.g. `pinnedFirst`).
  - Why deferred: LOW severity; `blockedLast` is pre-existing code; two one-liners don't yet justify a shared abstraction
  - Resolve when: a third sort-priority comparator is added alongside these two

### From /review
- [ ] `tests/taskManager.test.js` — no test coverage for urgency logic: `getUrgentTasks()` (completed exclusion), the auto-`myDayDate` side effect in `updateTask()` when marking urgent, and the `urgency` merge field group (newer "clear urgent" beats older "set urgent").
  - Why deferred: nit; not blocking correctness today but the merge group behavior is subtle enough to deserve a regression test
  - Resolve when: next touch to urgency logic, or when test coverage is added for the doing-bar equivalents

- [ ] `app/web_ui/css/style.css` (`.urgent-bar`) — `scrollbar-width: none` hides overflow with no visual indicator; users with many urgent tasks won't know chips are off-screen.
  - Why deferred: nit; edge case for high urgent-task counts
  - Resolve when: add a right-edge fade-out gradient via `::after` pseudo-element — natural to do alongside the `_renderStatusBar` CSS base class refactor above

- [ ] `app/web_ui/js/ui.js:1685` (sort order) — `urgentFirst` runs before `blockedLast`, so urgent-but-blocked tasks float to the top of every panel even though they're unactionable.
  - Why deferred: deliberate design decision but undocumented; product call on whether urgent > blocked or blocked > urgent
  - Resolve when: user reports confusion, or add a comment to `sortTasks()` explaining the intentional priority ordering

- [ ] `app/web_ui/js/data.js:4094` (`normalizeTask`) — `urgent: task.urgent || null` (never `false`) is consistent with the codebase but undocumented; a future reader may wonder why `false` is absent.
  - Why deferred: nit; consistent with other optional fields like `dueDate`/`followUpDate`
  - Resolve when: next touch to `normalizeTask` — add a one-liner comment: "optional fields use null (not false) as the absent sentinel"

- [ ] `app/web_ui/js/ui.js` (task edit flyout) — urgent checkbox is placed between slug and context fields; as a high-salience action it would be more discoverable near the top of the flyout or grouped with status metadata.
  - Why deferred: nit; functional but not optimally placed
  - Resolve when: a flyout field-order audit or UX polish pass
