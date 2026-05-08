---
phase: 05-active-task-views
plan: 02
subsystem: ui
tags: [weekly-review, settings, accordion, copy, ux]

requires:
  - phase: 05-active-task-views
    provides: Pending Tasks panel polish (05-01) — established Phase 5 baseline; 05-02 builds on the same branch
provides:
  - Pending Tasks vs Backburner guidance copy on the Weekly Review Pending Tasks step
  - Tags & Contexts accordion expanded by default on Settings — restores user-perceived availability of rename/delete affordances
affects: [05-03 bulk-edit redesign — touches the Settings panel surface, must not regress accordion default state]

tech-stack:
  added: []
  patterns:
    - "Per-section guidance text in the Weekly Review chrome — single shared element toggled by section.id at render time"

key-files:
  created: []
  modified:
    - app/web_ui/index.html
    - app/web_ui/js/review.js
    - app/web_ui/css/style.css

key-decisions:
  - "Guidance copy lives in a dedicated #reviewSectionGuidance element in the shared review header, toggled by section.id rather than inline-rendered per card — keeps the section-description chrome unchanged and avoids per-card render branching"
  - "Used the actual UI labels ('Pending Tasks', 'Backburner') in the guidance text instead of the feedback's 'Next Actions' / 'Someday' wording, so users can match what they see on screen"
  - "Smallest cause for 2dc7c45a was the closed <details> accordion, not a CSS regression or broken handler — added 'open' attribute to #settingsAccordionLists rather than redesigning the accordion-icon affordance"

patterns-established:
  - "When user reports 'X is missing' on a UI surface, inspect the live DOM for collapsed/hidden containers before assuming a code regression — prevents over-engineering parallel affordances that duplicate existing wiring"

duration: ~25min
started: 2026-05-07
completed: 2026-05-07
---

# Phase 5 Plan 02: Backlog Panel Improvements (revised) — Summary

**Added Pending-Tasks-vs-Backburner guidance copy to the Weekly Review and defaulted the Settings → Tags & Contexts accordion open so rename/delete buttons are visible without a click.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Started | 2026-05-07 |
| Completed | 2026-05-07 |
| Tasks | 2 of 2 completed |
| Files modified | 3 |
| Tests | 179/179 passing (baseline maintained — UI-only changes) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Weekly Review Next Actions guidance copy | Pass | Persistent muted block in `#reviewSectionGuidance`; toggled `hidden` by `section.id === "next"` in `_renderCurrentItem`; explicitly cleared in `_renderHistoricalItem`. Uses UI labels ("Pending Tasks", "Backburner"). |
| AC-2: Settings → Tags & Contexts visible and functional | Pass | `#settingsAccordionLists` now has `open` attribute (matches `#settingsAccordionAppearance` pattern). Rename + Delete buttons unchanged at `panels/settings.js:684-700`; click delegation healthy at `ui.js:528`. Pending user UAT confirmation. |
| AC-3: Feedback + roadmap state reflect work | Pass | `8dac310e` and `2dc7c45a` PATCHed to `resolved: true` with implementationNotes. `1f7139ee` left open. ROADMAP.md descope note added during PLAN phase. |

## Accomplishments

- Resolved `8dac310e` — Weekly Review Next Actions guidance copy now shipped, scoped to the Pending Tasks step only (not leaking into Inbox / Delegated / Backburner / Projects sections).
- Resolved `2dc7c45a` — Settings → Tags & Contexts is visible by default; rename and delete affordances surface immediately on opening Settings.
- Diagnosed-before-fixed Task 2: identified the collapsed `<details>` accordion as the smallest cause; avoided redesigning the affordance or duplicating buttons.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/index.html` | Modified | Added `<p id="reviewSectionGuidance">` in the review header chrome; added `open` attribute to `#settingsAccordionLists` |
| `app/web_ui/js/review.js` | Modified | Wired guidance text/visibility in `_renderCurrentItem` (set + show on `next`, clear + hide otherwise) and in `_renderHistoricalItem` (always clear + hide) |
| `app/web_ui/css/style.css` | Modified | Added `.review-section-guidance` rule (subtle left-border, muted, small) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Single shared `#reviewSectionGuidance` element toggled by `section.id` | Cleaner than per-card branching; reuses the existing review header layout grid (`gap: var(--space-1)`); guarantees scoping via JS without extra teardown logic | Future review sections that need their own guidance copy can extend the same toggle pattern |
| Use UI labels ("Pending Tasks", "Backburner") not feedback's wording ("Next Actions", "Someday") | Users match copy against what they see on screen | If section labels change, guidance copy must be updated in lockstep — flagged here |
| Default `#settingsAccordionLists` open rather than redesigning the chevron affordance | Smallest fix that addresses the reported complaint; matches the existing `#settingsAccordionAppearance` pattern | Settings now opens with two large sections expanded — slightly more vertical scroll on first open. Acceptable trade-off |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as written.

### Auto-fixed Issues

None.

### Deferred Items

None new in this plan. (`1f7139ee` Backlog "resolve all" was descoped during PLAN phase, recorded in ROADMAP.md, and remains open in the feedback log for a future plan/milestone.)

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Branch `feature/active-task-views` clean; tests 179/179 still green.
- 05-03 (bulk-edit redesign) can proceed — its scope is bulk-edit affordances on the Pending Tasks panel, distinct from the Settings/Review surfaces touched here.

**Concerns:**
- Manual UAT for AC-2 still pending in browser. If the user opens Settings → Tags & Contexts and the lists *still* appear empty after expansion, the bug lies elsewhere (CSS regression on `.settings-list`, empty data getter, or null cached element); revisit diagnostic Step A in this plan.
- Settings panel now defaults two accordions open (Appearance + Tags & Contexts). If 05-03 or later work adds another section that needs default-open, consider whether more than two open-by-default starts to feel cluttered.

**Blockers:**
- None.

---
*Phase: 05-active-task-views, Plan: 02*
*Completed: 2026-05-07*
