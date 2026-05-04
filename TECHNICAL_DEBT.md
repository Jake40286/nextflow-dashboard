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
