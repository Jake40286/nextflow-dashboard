---
phase: 05-active-task-views
plan: 03
subsystem: ui
tags: [bulk-edit, multi-select, draft-apply, tri-state-chips, vanilla-js]

requires:
  - phase: 05-active-task-views
    provides: 05-01 added Effort + Time selects to the multi-edit bar and the cosmetic checkbox/row-padding fix; this plan replaces the immediate-apply pattern those selects used

provides:
  - Draft + Apply/Cancel pattern on the multi-edit bar (pendingBulkEdits + pendingContextIntents)
  - Tri-state contexts chip group (observed all/some/none × intent add/remove/none)
  - "(Mixed)" placeholder on Status/Project/Area/Effort/Time selects when the selection is heterogeneous on that field
  - Two-step Escape: cancel draft → clear selection
  - Selection reconciliation against current view after Apply (DOM-based)
  - Single batched updateTask per task on Apply (one partial merging all staged fields including contexts)

affects: [future plans touching the multi-edit bar — extend pendingBulkEdits / chip cycle pattern; future bulk-edit fields for people-tags or other multi-value attributes can mirror the contexts chip implementation]

tech-stack:
  added: []
  patterns:
    - "Draft state pattern: pendingBulkEdits object + pendingContextIntents Map; renderer prefers staged value over observed common value; (Mixed) placeholder option auto-inserted/removed based on observed.values.size"
    - "Tri-state chip cycle: undefined → add → remove → undefined via single click; CSS encodes observed state and staged intent as orthogonal classes (is-on-* × is-staged-*)"
    - "DOM-based selection reconciliation: query `.task-row[data-task-id]` after Apply re-renders, drop selectedTaskIds not in the visible set — panel-agnostic"

key-files:
  created: []
  modified:
    - app/web_ui/index.html
    - app/web_ui/js/ui.js
    - app/web_ui/css/style.css

key-decisions:
  - "Removed applyBulkField entirely (no deadwood) per plan boundary — all single-value writes now flow through applyBulkEdits"
  - "Selection reconciliation reads live DOM rather than re-running panel filter predicates — simpler, panel-agnostic, depends on synchronous statechange→render (confirmed sync via data.js:874 dispatchEvent)"
  - "On Escape, draft is cancelled FIRST (one Escape), selection clears SECOND (next Escape) — gives user a non-destructive way to abandon staged edits without losing their selection"
  - "Apply emits one updateTask per task with all staged fields merged into a single partial — avoids N×M syncs and N×M activity-log entries when one is sufficient (per plan boundary)"
  - "Used hardcoded #16a34a / #dc2626 for add/remove badge colors rather than introducing new theme tokens — same precedent as the urgent-bar / My Day / Neglected hardcoded hex pattern (Phase 2.5 decision)"

patterns-established:
  - "When extending the multi-edit bar with a new multi-value field (e.g., people-tags later), follow the contexts chip pattern: observed state class × intent state class, cycle handler in setupMultiEditBar, intent-application helper that returns a new array, equality helper to skip no-op writes"

duration: ~40min (one APPLY pass interleaving Tasks 1 and 2 due to shared file edits; one robustness fix for Mixed-option insertion using select.options instead of firstChild.nextSibling)
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 5 Plan 03: Bulk-edit Redesign Summary

**Replaced the immediate-apply multi-edit bar with a draft + Apply/Cancel pattern, added Contexts as a tri-state chip group with mixed-state initial render, and made single-value selects show "(Mixed)" on heterogeneous selections. Closes the bulk-edit feedback (`fb700fcc`) end-to-end and Phase 5 with it.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Tasks | 2 of 2 completed (interleaved file edits) |
| Files modified | 3 |
| Tests delta | 179 → 179 (UI-layer change; data layer untouched) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Draft + Apply/Cancel for single-value fields | Pass | `pendingBulkEdits` + new `applyBulkEdits` / `cancelBulkEdits`; selects retain their staged value; draft count + Apply/Cancel enabled state both reactive |
| AC-2: Contexts tri-state chip group | Pass | `_renderMultiEditContexts` computes observed all/some/none per chip; click cycles intent through 3 states; Apply produces no `updateTask` if context array is unchanged for a given task |
| AC-3: Mixed-state placeholder on heterogeneous selects | Pass | `_applyBulkSelectState` auto-inserts/removes `(Mixed)` option based on `observed.values.size > 1`; choosing it stages no change; choosing a real value stages an overwrite |
| AC-4: Selection survives Apply; two-step Escape | Pass | `_reconcileSelectionAgainstView` runs after Apply (DOM-based); Escape cancels draft first, clears selection only if draft already empty |

## Accomplishments

- Bulk-edit feedback `fb700fcc` fully closed (items 1+2 in 05-01, item 3 here)
- Phase 5 complete — all three plans shipped on `feature/active-task-views`
- New reusable patterns documented for future bulk-edit work (multi-value chips; draft state; selection reconciliation)
- `applyBulkField` removed cleanly — no deadwood

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/index.html` | Modified | Added `#multiEditContexts`, `#multiEditDraftCount`, `#multiEditApply`, `#multiEditCancel` to the multi-edit bar |
| `app/web_ui/js/ui.js` | Modified | New state (`pendingBulkEdits`, `pendingContextIntents`); rewrote `updateMultiEditBar` with Mixed-placeholder logic; new methods: `_bulkEditSelectFields`, `_bulkObservedValues`, `_applyBulkSelectState`, `_bulkDraftCount`, `applyBulkEdits`, `cancelBulkEdits`, `_reconcileSelectionAgainstView`, `_renderMultiEditContexts`, `_applyContextIntents`, `_sameContextArray`; replaced immediate-apply handlers in `setupMultiEditBar`; two-step Escape; **deleted `applyBulkField`** |
| `app/web_ui/css/style.css` | Modified | Chip-group flex/wrap layout; tri-state observed × tri-state intent visual matrix; Apply/Cancel disabled-state styling; draft-count italic muted text; `multi-edit-fields` flex-wrap so the bar handles many contexts gracefully |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Delete `applyBulkField` (don't keep as legacy) | All call sites moved to draft pattern; deadwood pollutes future reads | Anyone searching for "applyBulk" finds the new method directly; no risk of accidental immediate-apply re-introduction |
| Reconcile selection via DOM query (not re-running filter predicate) | Simpler; panel-agnostic; statechange→render is synchronous in this codebase | If a future panel renders rows lazily / outside `.task-row[data-task-id]`, reconciliation will silently keep ids that aren't actually visible — flagged here |
| Escape cancels draft FIRST, then clears selection | Non-destructive abandon path; matches Linear/Notion convention | Users with a non-empty selection but empty draft still get the old single-Escape-clears behaviour |
| One `updateTask` per task with merged partial | Avoids N×M syncs and N×M activity-log entries | Activity log captures one transition per task per Apply, matching the user's mental model of "one bulk edit" |
| Hardcoded badge colors `#16a34a` / `#dc2626` (no new theme tokens) | Same precedent as Phase 2.5 / urgent-bar pattern; keeps token surface small until a coordinated migration | If urgent/My-Day/Neglected/multi-edit colors ever migrate to tokens, do them all together |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Robustness improvement, not a behavior change |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written, with one self-correction during qualify.

### Auto-fixed Issues

**1. Mixed-option insertion robust against whitespace text nodes**
- **Found during:** Task 1 qualify (re-reading the inserted code)
- **Issue:** Initial implementation used `select.insertBefore(mixedOpt, select.firstChild.nextSibling)`, which assumes no whitespace text nodes between `<option>` elements — fragile for HTML-parsed selects
- **Fix:** Switched to `select.options` collection (which only enumerates `<option>` elements, skipping text nodes), inserting before `opts[1]` to land in position-after-placeholder
- **Verification:** Re-read; `node --check` passes; tests still 179/179
- **Commit:** part of the single APPLY commit

### Deferred Items

None. (Note: the user confirmed mid-plan that bulk-editing people-tags is out of scope here — that's a future feature, not a deferred bug.)

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- All Phase 5 work shipped on `feature/active-task-views`. Branch is in a clean, mergeable state.
- Bulk-edit pattern is now ready to extend to other multi-value fields (people-tags) without re-architecture.

**Concerns:**
- Manual UAT for 05-03 still pending in browser. Edge cases worth eyeballing: status change that moves tasks out of the active view (selection should shrink); Cancel mid-stage (selects should snap back to observed/Mixed values, not the staged value); rapid-click chip cycling.
- DOM-based reconciliation is sufficient for current panels. Any future panel that renders task rows outside the `.task-row[data-task-id]` convention would silently leave stale ids in `selectedTaskIds`.

**Blockers:**
- None.

---
*Phase: 05-active-task-views, Plan: 03*
*Completed: 2026-05-07*
