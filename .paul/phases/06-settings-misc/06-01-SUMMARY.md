---
phase: 06-settings-misc
plan: 01
subsystem: ui
tags: [settings, label-rename, convert-to-project, es-modules, render-bug]

requires:
  - phase: 05-active-task-views
    provides: 05-02 default-open accordion ships separately; 06-01 fixes the actual render-abort that 05-02 misdiagnosed

provides:
  - User-visible "Inactive" → "Completed" terminology on Settings task counts and section heading
  - convertTaskToProject carries task.dueDate → project.deadline and task.notes → project.vision (in addition to the existing areaOfFocus carry-over)
  - Bug fix: settings panel renderSettings() now reaches all 5 render calls (was aborting at renderThemeSettings due to two unimported helpers)

affects: [future panel modules — verify any cross-module helper references through ES module imports, not free identifiers]

tech-stack:
  added: []
  patterns:
    - "Mixin-via-Object.assign caveat: methods mixed into UIController via Object.assign retain their original module's lexical scope. Free-identifier references in panels/*.js to top-level functions in ui.js silently throw ReferenceError at runtime — must be imported or duplicated."

key-files:
  created: []
  modified:
    - app/web_ui/js/panels/settings.js
    - app/web_ui/js/ui.js

key-decisions:
  - "Duplicated stripTagPrefix and normalizeThemeHexInput into panels/settings.js rather than exporting from ui.js — narrowest scope; avoids circular-import risk; ~20 lines of pure-helper duplication"
  - "Internal variable names (inactiveTasks, inactiveList, inactiveTitle) and the usageMap.inactive property left unchanged — not user-visible; mechanical renames create churn without value"
  - "convertTaskToProject themeTag stays null — task has no theme equivalent (project themeTag is a curated taxonomy: Networking / DevOps / Family / etc.)"
  - "64227659 (guided tour) descoped from v1.0 milestone during planning — feature-shaped, not polish; moved to ROADMAP Deferred (Someday)"

patterns-established:
  - "When `panels/<name>.js` modules need a helper from ui.js, IMPORT it (or duplicate it locally if pure). Never reference ui.js's top-level functions as free identifiers — Object.assign mixin doesn't bridge module scope."

duration: ~25min (15min for the two planned tasks, 10min diagnosing + fixing the latent settings-render bug surfaced by user UAT)
started: 2026-05-07T00:00:00Z
completed: 2026-05-07T00:00:00Z
---

# Phase 6 Plan 01: Settings & Convert Polish Summary

**Renamed "Inactive" → "Completed" on Settings, extended Convert-to-Project to carry task.notes and task.dueDate onto the new project, and fixed a latent render-abort bug in `renderSettings` that had silently broken the Features and Tags & Contexts sections (uncovered by user UAT after the 05-02 cosmetic fix turned out to be the wrong layer).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min total (planned tasks + auto-fix during UAT) |
| Tasks | 2 of 2 planned + 1 auto-fix |
| Files modified | 2 |
| Tests delta | 179 → 179 (UI-layer change throughout) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: "Inactive" → "Completed" on Settings | Pass | Three user-visible string replacements in panels/settings.js (lines 679, 758, 827) |
| AC-2: Convert-to-Project carries dueDate + notes | Pass | `addProject(name, vision, metadata)` call in ui.js:8475-8480 now passes trimmed `task.notes` as `vision` and `deadline: task.dueDate || null` in metadata. Defensive `typeof task.notes === "string" ? trim() : ""` handles malformed states |
| AC-3: Feedback + roadmap state | Pass | `b4faaccd` and `981dde72` PATCHed to `resolved: true`. `64227659` remains open and is recorded under ROADMAP Deferred (Someday) for a future milestone |

## Accomplishments

- Resolved `b4faaccd` (Inactive → Completed)
- Resolved `981dde72` (Convert-to-Project verify + extend)
- Fixed a real Settings render bug that 05-02 misdiagnosed; properly resolved `2dc7c45a` end-to-end with the actual root cause
- Saved a diagnostic-discipline lesson to memory: ask for browser console output BEFORE picking a fix layer when user reports "X is missing/empty"

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/web_ui/js/panels/settings.js` | Modified | (Task 1) Three "Inactive" → "Completed" string replacements. (Auto-fix) Added local definitions of `stripTagPrefix` and `normalizeThemeHexInput` at the top of the module to fix a `ReferenceError` that aborted `renderSettings()` at the first render call |
| `app/web_ui/js/ui.js` | Modified | (Task 2) `convertTaskToProject` extended to pass `task.notes.trim()` as `vision` and `deadline: task.dueDate \|\| null` in `addProject` metadata |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Duplicate two helpers in panels/settings.js (rather than export from ui.js) | Narrowest scope; zero circular-import risk; ~20 lines of pure helpers — not worth restructuring exports for | Future panel modules that need cross-module helpers should import them or duplicate; documented in patterns-established above |
| Leave internal `inactiveTasks` / `inactiveList` / `inactiveTitle` variable names alone | Not user-visible; mechanical renames create churn without value | If a future reader is confused by the variable/text mismatch, the boundary in PLAN.md and this summary explain why |
| Defer `64227659` guided tour to a future milestone | Feature-shaped, not polish; doesn't fit v1.0 milestone tagline | Phase 6 plan list trimmed; deferred items in ROADMAP gained one entry |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Fixed a latent production bug surfaced by UAT — strictly a net positive |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written. The auto-fix is large in surface area (re-opens a previously-closed feedback record) but small in code change (~20 lines of helper duplicates).

### Auto-fixed Issues

**1. [render-bug] Settings panel render abort due to two unimported helpers**
- **Found during:** post-Task-2 UAT, after I asked the user to verify Tags & Contexts content. They hard-refreshed and pasted a console error: `Uncaught ReferenceError: normalizeThemeHexInput is not defined` at `panels/settings.js:117`
- **Issue:** `panels/settings.js` referenced two top-level helpers from `ui.js` (`stripTagPrefix` and `normalizeThemeHexInput`) without importing them. ES modules don't share top-level scope, so referencing them as free identifiers threw at runtime. The throw happened inside `renderThemeSettings` (called at line 36 of `renderSettings`) — aborting the entire function before reaching `renderFeatureFlagSettings` (line 37) or the three `renderSettingsList` calls (lines 38–40). Result: Features section AND Tags & Contexts section silently empty in the live DOM despite all data being present server-side.
- **Why this slipped past 05-02:** I diagnosed the empty Tags & Contexts section as a closed-by-default `<details>` accordion and shipped a default-open fix. The accordion change was a real UX improvement but did NOT address the root cause. The `renderSettingsList` calls never executed in the first place, so the rename/delete buttons I'd noted at lines 684-700 had never actually rendered for the user.
- **Fix:** Added local definitions of both helpers at the top of `panels/settings.js`. Pure functions, ~20 lines duplicated. Comment in the source explains the ES-module-scope reasoning so future readers don't strip it.
- **Verification:** Hard refresh; user confirmed Settings populates correctly; tests still 179/179
- **Feedback record `2dc7c45a`:** re-opened (resolved=false with explanation) and then re-resolved with the proper fix's implementationNotes. The 05-02 default-open accordion change still ships as a separate UX improvement, but the user-visible "I see no tags or contexts at all" symptom is now actually fixed.

### Deferred Items

None new. (Note: `64227659` guided tour was descoped during 06-01 planning — that's a planning-phase decision, not an APPLY-phase deferral.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 05-02's "closed accordion" diagnosis was wrong | Re-opened `2dc7c45a`; user provided console paste; identified the actual `ReferenceError`; duplicated helpers; properly resolved. Added a memory entry to ask for console output before guessing fix layers in future. |

## Next Phase Readiness

**Ready:**
- Both planned items resolved + the latent render bug fixed
- Branch `feature/settings-misc` clean and ready to receive 06-02 (pop-out doing timers)

**Concerns:**
- `panels/settings.js` now has duplicates of `stripTagPrefix` and `normalizeThemeHexInput`. If either helper ever changes in `ui.js`, the duplicate must be updated in lockstep — otherwise behavior drifts. A future refactor could extract these into a small `app/web_ui/js/utils.js` shared module, but that's churn for a non-urgent improvement. Flagged here for future awareness.

**Blockers:**
- None.

---
*Phase: 06-settings-misc, Plan: 01*
*Completed: 2026-05-07*
