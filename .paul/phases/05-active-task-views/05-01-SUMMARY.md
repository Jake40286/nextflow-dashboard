---
phase: 05-active-task-views
plan: 01
subsystem: ui
tags: [filters, association-flyout, multi-edit, bulk-edit, vanilla-js, css]

requires:
  - discovery: 05-active-task-views/DISCOVERY.md
    provides: plan-split that put bulk-edit redesign in 05-03 and the polish items here

provides:
  - Area of Focus filter (multi-select) in the association flyout
  - Click-anywhere-on-header expand/collapse for FOUR collapsible sections in the task flyout (Notes, List, Follow-up, Prerequisites) with hover affordance
  - Multi-edit bar: Effort + Time Required selects, checkbox no longer overlapping title, recentered checkmark glyph

affects: [05-03 (will replace applyBulkField with draft+Apply, will add Contexts as a multi-value field)]

tech-stack:
  added: []
  patterns:
    - "Area filter: same shape as Context/Effort/Time filter groups — multi-checkbox in association flyout, predicate via matchesFilterValue against task.areaOfFocus"
    - "Header click target: header.style.cursor=pointer + header click handler that ignores clicks landing on inner buttons; mirrored across 4 sections (notes, list, follow-up, prerequisites)"
    - "Multi-select row layout: every task row reserves 36px left padding so the absolutely-positioned checkbox never overlaps the title — no layout shift on hover, no special-case logic"

key-files:
  created: []
  modified:
    - app/web_ui/index.html
    - app/web_ui/js/ui.js
    - app/web_ui/js/data.js
    - app/web_ui/css/style.css

key-decisions:
  - "Scope expanded mid-checkpoint: user asked for the same click-anywhere treatment on Follow-up and Prerequisites headers; added in-loop and verified"
  - "Cosmetic checkbox fix took two passes: first attempt scoped to .is-selected (didn't catch hover overlap); final fix reserves 36px on every row to eliminate the issue across all states"
  - "Stop-gap for 'bar closes after one change' DECLINED by user: full draft+Apply pattern lands in 05-03 instead"

patterns-established:
  - "When a feedback item describes 'covers/overlaps' a UI element, check ALL states it can appear in (selected, hover, focus) — not just the obvious one"

duration: ~50min including a mid-checkpoint scope expansion and one cosmetic re-fix
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 5 Plan 01: Pending Tasks Panel Polish Summary

**Three feedback items shipped on the active-task surface: a new Area of Focus filter; click-anywhere-on-header for four collapsible flyout sections; and the multi-edit bar's checkbox no longer overlaps task titles, with two extra bulk-set fields. Scope grew slightly during the human-verify checkpoint to cover Follow-up and Prerequisites headers in addition to Notes/List.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 min (1 mid-checkpoint scope expansion, 1 cosmetic re-fix after user catch) |
| Tasks | 3 of 3 + 1 human-verify checkpoint |
| Files modified | 4 |
| Tests delta | 179 → 179 (no test additions; UI-layer change throughout) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Area of Focus filter (`059f0a1e`) | Pass | New section between Contexts and Projects; multi-select; "Clear filters" resets it; predicate plumbed through `matchesTaskFilters` against `task.areaOfFocus` |
| AC-2: Notes/List header click target (`f3d948ce`) | Pass | Behavior was already implemented in code; this plan added hover affordance and **expanded scope to cover Follow-up + Prerequisites headers too** at user request during the checkpoint |
| AC-3: Multi-edit cosmetic + missing fields (`fb700fcc` 1+2) | Pass | First fix attempt only handled `.is-selected`; user caught that hover overlap was still present; final fix reserves left padding on every `.task-row`. Effort + Time Required selects added; Contexts deferred to 05-03 by plan boundary |

## Accomplishments

- Three feedback items closed in one plan with no scope creep beyond the user-approved expansion to two more flyout sections
- Discovery's plan-split held: `fb700fcc` items 1+2 here, item 3 (the redesign) staying in 05-03
- Established a small but reusable pattern for collapsible flyout headers (cursor + click handler + hover background) that's now consistent across 4 sections

## Task Commits

Will be bundled into the Phase 5 transition commit alongside 05-02 and 05-03 — `feature/active-task-views` is one branch holding the full phase.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/index.html` | Modified | New `<section>` for Area of Focus in association flyout (between Contexts and Projects); two new `<select>` elements (Effort, Time Required) in the multi-edit bar |
| `app/web_ui/js/ui.js` | Modified | `cacheElements`: 3 new ids (`associationAreaOptions`, `multiEditEffort`, `multiEditTime`); `renderAssociationFlyout`: build areas list and render the new group; `this.filters.area = ["all"]` initial state in two places; clear-filters wiring; `buildTaskFilters` passes `area`; `updateMultiEditBar` populates Effort/Time selects; `setupMultiEditBar` change handlers for the two new selects; click-anywhere handlers added to follow-up + prerequisites headers (notes/list already had them) |
| `app/web_ui/js/data.js` | Modified | `getTasks` accepts `area`/`areas` param; `matchesTaskFilters` checks `task.areaOfFocus` against the filter |
| `app/web_ui/css/style.css` | Modified | `.task-row` permanent left padding (36px) to reserve space for the absolutely-positioned checkbox; checkmark glyph recentered via `top:50%/left:50%/translate(-50%,-60%) rotate(45deg)`; hover backgrounds added to four flyout headers (`.task-notes-header`, `.task-list-header`, `.task-followup-header`, `.task-prereq-header`) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Add Area as a new `this.filters.area` array (not reuse `activeArea`) | `activeArea` is the single-value app-level lens; the association filter is per-panel multi-select. Different concepts | Clean separation; no behavior change to existing area-lens UI |
| Reserve 36px left padding on every `.task-row` instead of toggling on selection | First attempt with `.is-selected` selector missed the hover-but-not-selected case the user actually saw. Reserving always means no layout shift on hover and no special-case logic | Every row is ~20px wider on the left, all the time. Acceptable for the cleaner result |
| Expand scope to Follow-up + Prerequisites headers during the checkpoint | User asked explicitly and the change was a 6-line copy of the existing pattern with zero extra risk. Logging the expansion is more useful than insisting on a follow-up plan for a 6-line change | Four flyout sections now consistent; future sections can mirror this pattern |
| Decline the "stop-gap" stay-open-on-bulk-edit fix | Discovery already scoped the proper redesign (draft + Apply/Cancel) for 05-03; user chose to wait for it rather than ship a half-fix | 05-01 holds the boundary as planned; 05-03 will deliver the proper UX |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Cosmetic re-fix after user caught the original was incomplete |
| Scope additions | 1 | Follow-up + Prerequisites headers (user-approved during checkpoint) |
| Deferred | 0 | — |

**Total impact:** Both deviations were good ones — the user catch tightened the cosmetic fix, and the scope expansion delivered consistency for free.

### Auto-fixed Issues

**1. Multi-select checkbox overlap — incomplete first fix**
- **Found during:** Human-verify checkpoint (user reported "still overlapping")
- **Issue:** Initial fix only added `padding-left` to `.task-row.is-selected`. The checkbox is also visible during plain `:hover` so the overlap persisted while the user was deciding which row to select
- **Fix:** Moved the padding to base `.task-row` so it's reserved permanently (no layout shift on hover, no overlap in any state)
- **Files:** `app/web_ui/css/style.css`

**2. Checkmark glyph alignment**
- **Found during:** Same human-verify pass (user nitpick: "the check is in the top-left corner of the box")
- **Issue:** Checkmark `::after` was positioned at `top: 1px; left: 4px` — pinned to top-left rather than centered
- **Fix:** Changed to `top: 50%; left: 50%` with `translate(-50%, -60%)` (the slight upward bias compensates for the rotated checkmark's visual weight)
- **Files:** `app/web_ui/css/style.css`

### Scope Additions

**1. Click-anywhere on Follow-up and Prerequisites headers**
- **Found during:** Human-verify checkpoint
- **Why added:** User asked explicitly and the change was a copy of the existing notes/list pattern. Six lines of JS + matching CSS hover. Adding it in-loop produced consistency across all four collapsible sections; pushing to a follow-up plan would have been extra ceremony for trivial work
- **Files:** `app/web_ui/js/ui.js` (followup + prereq sections), `app/web_ui/css/style.css` (matching hover rules)

### Deferred Items

None new. The known boundary holds: Contexts in multi-edit and the bulk-edit interaction redesign both live in 05-03.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| First cosmetic fix only addressed `.is-selected`, not `:hover` | User caught it at checkpoint; switched to permanent left padding on every `.task-row` |
| Checkmark glyph off-center | Recentered via 50%/50% positioning + translate |

## Next Phase Readiness

**Ready:**
- 05-02 (Backlog improvements: review copy, resolve-all button, context buttons) — independent of 05-01's changes
- 05-03 (bulk-edit redesign + Contexts multi-value) — will replace the now-Effort+Time-equipped multi-edit bar with the draft+Apply pattern

**Concerns:**
- None. The 36px permanent left padding on every task row is a small visual cost worth watching for user reaction over time, but no functional risk.

**Blockers:**
None.

---
*Phase: 05-active-task-views, Plan: 01*
*Completed: 2026-05-07*
