---
phase: 03-projects-panel-ux
plan: 01
subsystem: ui
tags: [vanilla-js, html, css, projects-panel, labels, a11y]

requires:
  - phase: 02.5-top-bar-status
    provides: stable index.html / ui.js / style.css after Phase 2.5 top-bar changes (boundary respected — no top-bar code touched)

provides:
  - Projects panel renamed: "Active Projects" → "Projects" (summary tab + panel header)
  - Visible "Add a new project" heading above #newProjectForm
  - New CSS class .project-create-heading for scoped heading styling

affects: [03-02 (no-next-action warning), future task-flyout polish, any plan that surfaces project-panel labels]

tech-stack:
  added: []
  patterns:
    - "Section-heading addition pattern: <h3 class='<context>-heading'> directly above the form, scoped CSS class to avoid h3-cascade collisions"

key-files:
  created: []
  modified:
    - app/web_ui/index.html
    - app/web_ui/js/ui.js
    - app/web_ui/css/style.css

key-decisions:
  - "Used new .project-create-heading class instead of reusing .workspace-tool-title — different layout context"
  - "Heading placed OUTSIDE the form (not as a <legend>) to keep aria-label='Create project' semantics intact"
  - "In-panel 'Active' status group label at ui.js:7793 deliberately preserved — it's a status filter, not the panel title"

patterns-established:
  - "When a panel title and an in-panel filter share a word, the boundary section must explicitly call out the filter as protected — otherwise it's easy to over-rename"

duration: ~10min
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 3 Plan 01: Projects Panel Renames + Add-Project Affordance Summary

**The Projects panel is no longer mislabeled as "Active Projects" (it always showed all status groups), and the new-project form now has a visible "Add a new project" heading so users immediately understand what that section is for. Resolves feedback `1448576c`.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Started | 2026-05-07 |
| Completed | 2026-05-07 |
| Tasks | 3 of 3 (2 auto + 1 checkpoint) |
| Files modified | 3 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Panel title reads "Projects" | Pass | `index.html:184` summary tab + `ui.js:989` panel header function both updated; `grep -rn "Active Projects" app/web_ui/` returns zero matches |
| AC-2: Add-project form has visible heading | Pass | `<h3 class="project-create-heading">Add a new project</h3>` at `index.html:344`, sits directly above the form, outside the form element; `aria-label="Create project"` preserved |
| AC-3: No regressions | Pass | 160/160 tests passing; in-panel "Active" status group at `ui.js:7793` deliberately untouched per boundary; user verified end-to-end project creation at the human-verify checkpoint |

## Accomplishments

- Two surface-level UX wins shipped in one tight plan with zero scope creep
- Established a pattern for adding scoped section headings (dedicated class, placed outside the form) that future plans can reuse
- Confirmed boundary discipline: the in-panel "Active" status group label was protected and stayed untouched, despite sharing the word with the panel title

## Task Commits

Will be bundled into a single feature-branch commit at end of phase 3 (after `03-02` ships) or sooner if user prefers per-plan commits. Currently the changes sit uncommitted on `feature/projects-panel-ux`.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Rename "Active Projects" → "Projects" | (pending phase commit) | feat/refactor | Two label sites updated |
| Task 2: Add "Add a new project" heading | (pending phase commit) | feat | New heading + scoped CSS class |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/index.html` | Modified | `:184` summary tab label rename; `:344` new `<h3 class="project-create-heading">` inserted above the form |
| `app/web_ui/js/ui.js` | Modified | `:989` panel header function returns "Projects" instead of "Active Projects" |
| `app/web_ui/css/style.css` | Modified | `:1371` new `.project-create-heading` rule block (font-size, weight, margin, color via theme variables) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Used new `.project-create-heading` class instead of reusing `.workspace-tool-title` | `.workspace-tool-title` is scoped to a different layout region (workspace-tool sidebar pattern); reusing it would carry implicit cascade from rules meant for that region | Future plans adding section headings in different panels should follow the same scoped-class approach |
| Placed heading OUTSIDE the `<form>` element (not as a `<legend>` inside a `<fieldset>`) | A `<legend>` would have implied a `<fieldset>` group and changed the assistive-tech reading order; the form already has `aria-label="Create project"` covering screen-reader semantics | Heading is purely visual; semantics unchanged for screen-reader users |
| Preserved in-panel "Active" status group label at `ui.js:7793` | That label is a status filter (Active vs OnHold vs Completed), not the panel title; renaming it would either remove a useful filter or create three groups all called "Projects" | Boundary documented in PLAN.md prevented this drift; future plans should look for similar shared-vocabulary traps |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as written. No deviations.

### Auto-fixed Issues

None — no in-flight fixes were needed during APPLY.

### Deferred Items

None new. Phase 3 plan `03-02` (suppress "no next action" warning when delegated task exists) is queued as the next plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| STATE.md had a stale duplicate "Resume context" block carried over from the Phase 2.5 session | Will be cleaned up in this UNIFY pass |

## Skill Audit

`.paul/SPECIAL-FLOWS.md` not present — skill audit skipped.

## Next Phase Readiness

**Ready:**
- `03-02` is unblocked and can be planned next; it touches different code (project-card rendering / warning-badge logic) so there's no conflict with `03-01` files
- Plan-creation pattern is now well-rehearsed for Phase 3 — same vanilla-JS / DOM-string-edit shape

**Concerns:**
- None. The renames are visible-string-only changes; if any external doc, screenshot, or feedback record references the old "Active Projects" string it will need a follow-up update, but that's documentation hygiene, not a regression risk.

**Blockers:**
None.

---
*Phase: 03-projects-panel-ux, Plan: 01*
*Completed: 2026-05-07*
