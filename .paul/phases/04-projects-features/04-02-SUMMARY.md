---
phase: 04-projects-features
plan: 02
subsystem: ui
tags: [activity-log, project-flyout, vanilla-js, lazy-load]

requires:
  - phase: 04-projects-features
    provides: 04-01 already shipped data layer + emission + getProjectActivity API; 04-02 makes it visible

provides:
  - Activity section in every project flyout, listing events newest-first
  - formatActivityEntry helper (one event-type → human-readable line)
  - activityMarkerFor helper (one event-type → small unicode glyph)
  - formatActivityRelativeTime helper (just now / 2m / 3h / 4d / 2w / 1mo / 1y)
  - Lazy-load wiring: first flyout open per session triggers ensureCompletedLoaded(); placeholder swaps for real entries when data arrives
  - Empty-state copy for projects with no activity

affects: [future plans that surface activity elsewhere; future "tab strip" promotion if usage justifies it]

tech-stack:
  added: []
  patterns:
    - "Section-at-bottom-of-flyout pattern: lighter-weight than a tab strip; matches existing outcome/notes precedent; promotes to tabs in a future plan if needed"
    - "Stale-render guard: store this._currentProjectFlyoutId at render entry, check it inside the lazy-load .then() so navigating to a different project before /completed returns doesn't render stale entries"

key-files:
  created: []
  modified:
    - app/web_ui/js/ui.js
    - app/web_ui/css/style.css

key-decisions:
  - "Bottom-of-flyout section instead of tab strip — discovery left UI shape open; lighter touch fits scope and matches the existing outcome/notes pattern"
  - "Hide actor on viewports under 480px via @media — keeps event text and timestamp visible on phones without wrapping"
  - "Free-function helpers in ui.js (formatActivityEntry et al.) instead of UIController methods — avoids mixing into the prototype, clean separation of formatting from rendering"

patterns-established:
  - "Read-only consumer of an activity log: render in plain English with relative time + actor; no click-through, no filtering, no drill-down at v1"

duration: ~25min
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 4 Plan 02: Project Activity Log — UI Surface Summary

**The activity log is now visible. Every project flyout has an "Activity" section at the bottom listing what's happened on that project — task moves, completions, project lifecycle events — in plain English, newest first. Resolves feedback `7868b077` end-to-end.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Tasks | 2 of 2 + 1 human-verify checkpoint |
| Files modified | 2 |
| Tests delta | 179 → 179 (no test additions; UI-only plan, behavior verified at the checkpoint) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Activity section renders for any project flyout | Pass | Section + label appears at the bottom; entries newest-first; empty-state copy when no entries |
| AC-2: Plain-English rendering for all 8 event types | Pass | `formatActivityEntry` covers each type; safe fallback "Recorded activity" for unknown types |
| AC-3: Lazy-load on first flyout open per session | Pass | Calls `ensureCompletedLoaded()` (idempotent); shows "Loading activity…" placeholder; re-renders when promise resolves; stale-render guard via `_currentProjectFlyoutId` |
| AC-4: Visual fit with the rest of the flyout | Pass | Mirrors `.project-outcome` block style; uses theme variables; hides actor on narrow viewports; user verified at checkpoint |

## Accomplishments

- Closed feedback `7868b077` end-to-end (data + UI) across two well-staged plans
- Lazy-load pattern proven a second time (after Statistics/Reports), reusable for any future feature that wants completed-state data
- Stale-render guard pattern documented for future async re-renders inside the project flyout

## Task Commits

Bundled into the Phase 4 transition commit alongside 04-01's work — single feature branch (`feature/projects-activity-log`), one commit per plan, then phase-level merge to main.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/js/ui.js` | Modified | `_currentProjectFlyoutId` tracking added to `renderProjectFlyout`; new Activity section build block before the footer; `ensureCompletedLoaded()` lazy-load with stale-render guard; three free-function helpers (`formatActivityEntry`, `activityMarkerFor`, `formatActivityRelativeTime`) added near the other free-function helpers |
| `app/web_ui/css/style.css` | Modified | New `.project-activity` block + sub-elements (`-label`, `-row`, `-marker`, `-text`, `-time`, `-actor`, `-loading`, `-empty`); narrow-viewport @media rule hides the actor |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Bottom-of-flyout section instead of tab strip | Discovery left UI shape open; the existing flyout has no tab infrastructure today, so building proper tabs would balloon scope; matches the existing outcome/notes section precedent | Future plan can promote to tabs if usage justifies; v1 ships with the lighter touch |
| Free-function helpers in `ui.js` (not methods on UIController) | Mirrors the existing pattern at the bottom of the file (`clearCustomThemeVariables`, `applyCustomThemeVariables`, etc.); cleaner separation of pure formatting logic from rendering | Helpers can be moved/extracted later without touching the class |
| Stale-render guard via `_currentProjectFlyoutId` | If user clicks "next project" before `/completed` returns, the lazy-load `.then()` callback would otherwise render stale entries on the wrong project | Robust to fast navigation; cost is one instance variable |
| Hide actor on screens under 480px | Mobile/narrow real estate prioritises event text + timestamp; actor is supplementary information | Cleaner mobile readability without cutting actor on desktop |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Auto-fixed Issues

None.

### Deferred Items

- Click-through on activity rows (drill into the related task) — out of scope for v1 per plan boundary; future plan if requested
- Filtering by event type / search / date pickers — out of scope; the list is short enough at typical use
- "Load more" pagination if a project ever accrues thousands of entries — defer until a real user shows pain; can prune server-side instead
- Promoting to a proper tab strip — only if section becomes too crowded with future flyout sections

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 4 closes with this plan; Phase 5 (Active Task Views) is unblocked
- The activity-log pattern (data + UI) is now end-to-end and can serve as a template if future plans want similar history surfaces

**Concerns:**
- The flyout has gained a section; if more sections accrue (a future plan adds something else), the bottom-of-flyout section pattern starts feeling crowded and a tab strip refactor will become more attractive
- Activity entries accumulate without bound on the server; not yet a problem at typical use, but a server prune would become the right move at sustained heavy use

**Blockers:**
None.

---
*Phase: 04-projects-features, Plan: 02 (final plan in Phase 4)*
*Completed: 2026-05-07*
