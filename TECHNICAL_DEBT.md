# Technical Debt

_Captured automatically after /simplify and /review. Review before starting related work._

---

## 2026-05-04 — feature/recurring-catch-up-skip

### From /simplify
- [ ] `app/web_ui/js/data.js` (multiple call sites: ~1655, ~1923, ~2158, ~4001, new ~4011) — `archiveType` values (`"reference"`, `"completed"`, `"deleted"`, `"skipped"`) are bare strings; should be promoted to an `ARCHIVE_TYPE` constants object alongside `STATUS`/`RECURRENCE_TYPES`.
  - Why deferred: pre-existing pattern of bare strings — fixing it means touching unrelated call sites; out of scope for the catch-up-skip feature
  - Resolve when: someone touches archive-type filtering logic (e.g. adds a "neglect chart" or new archive type), or as a standalone cleanup PR

- [ ] `app/web_ui/js/data.js` `computeNextRecurrenceDates` (~line 4778) — `step()` closure could be inlined into the three call sites for `dueDateBase` / `calendarBase` / `fallbackDate`.
  - Why deferred: judgment call, kept for the de-dup it provides across three call sites; reviewer flagged as "overcooked" but I disagree
  - Resolve when: TBD — only if a future change makes the closure harder to follow

- [ ] `app/web_ui/js/data.js` `computeNextRecurrenceDates` return shape — `skipped` field could be renamed to `cyclesAdvanced` so the caller's `>= 2` guard reads as intent.
  - Why deferred: would churn the public-ish return shape and tests for cosmetic gain
  - Resolve when: TBD — bundle with any other rename of the recurrence helpers

- [ ] Reports panel (`app/web_ui/js/`) — confirm no UI breakage from the new `archiveType: "skipped"` completionLog entries; consider surfacing skipped/neglect history in Statistics.
  - Why deferred: plan explicitly said "Do not add UI surfacing for skipped entries in this PR; keep scope tight"
  - Resolve when: user requests a "neglect chart" or files a follow-up
