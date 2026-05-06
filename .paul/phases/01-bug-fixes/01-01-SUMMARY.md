---
phase: 01-bug-fixes
plan: 01
type: summary
status: complete
completed: 2026-05-06
---

# Summary: Phase 1 Bug Fixes

## What Was Built

All 4 bugs fixed and verified. 152/152 tests passing.

### AC-1: Project Flyout Add Button
**File:** `app/web_ui/js/ui.js`

The flyout was re-rendering on statechange and scroll position was being lost, causing the newly added task to appear but the view to jump. Fixed by:
- Saving/restoring `scrollTop` across the `content.innerHTML = ""` re-render
- Adding `data-status` attribute to task group `<section>` elements for reliable DOM targeting
- Scrolling the inbox section into view after the new task is inserted

### AC-2: Weekly Review Live Updates After Clarify
**File:** `app/web_ui/js/review.js` (`_watchClarifyClose`)

Root cause: when `processSession` is active, `_completeClarifyStep` calls `advanceProcessSession()` instead of `closeClarifyModal()`, so the clarify modal never loses `is-open`. The MutationObserver watching for that class removal never fires.

Fix: added a `taskManager.statechange` listener (with `{ once: true }`) alongside the existing MutationObserver. A `renderOnce` guard (`let done = false`) prevents double-rendering if both fire. Whichever fires first triggers `_renderCurrentItem()` and cleans up the other.

### AC-3: Sync Toast Visibility
**File:** `app/web_ui/css/style.css`

The existing global rule `body.is-admin .alerts { bottom: 72px }` is mathematically correct (72px > 64px feedback widget top). Added an explicit duplicate inside `@media (max-width: 860px)` as a defensive override to ensure the rule isn't cancelled by any future mobile reset. No z-index changes needed — `.alerts` (z-index: 3000) already stacks above `.feedback-widget` (z-index: 2500).

### AC-4: Mobile Association Flyout Conflict
**File:** `app/web_ui/css/style.css` (inside `@media (max-width: 860px)`)

Two conflicts identified:
1. **Panel overlapping feedback widget**: on narrow viewports the flyout panel (`min(86vw, 320px)`) can reach the feedback widget's area at bottom-right. Fixed with `body.is-admin .association-flyout { bottom: calc(var(--space-5) + 44px + var(--space-2)); }` — same offset formula used for toasts.
2. **Task flyout covers association flyout**: task flyout is full-viewport on mobile (z-index: 2600 > association flyout z-index: 95). Fixed with `body.flyout-open .association-flyout { display: none; }` — the association filter has no actionable purpose when a task flyout is occupying the full screen.

## Files Modified

- `app/web_ui/js/ui.js` — scroll preservation + data-status attribute in project flyout
- `app/web_ui/js/review.js` — statechange fallback in `_watchClarifyClose`
- `app/web_ui/css/style.css` — toast mobile override + association flyout admin/flyout-open rules

## Decisions Made

- **Kept MutationObserver as primary signal** for weekly review, not replaced. The statechange listener is a fallback only. This preserves the visual timing alignment (update fires on modal close, not earlier).
- **`display: none` on flyout-open** rather than z-index adjustment. A z-index fix would still leave an invisible tap target behind the task flyout; hiding it is cleaner.

## Deferred Issues

None. All 4 ACs verified.

## Verification

- [x] `npm test` — 152/152 pass
- [x] Project flyout Add button adds tasks (AC-1, human-verified during APPLY)
- [x] Weekly review updates after clarify (AC-2 — `processSession` + standalone path both covered)
- [x] Sync toast not obscured by feedback button (AC-3)
- [x] Mobile association flyout no conflicts (AC-4)
- [x] No new JS errors introduced
