# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-06)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.0 Feedback Clearance & Polish — Phase 5 complete (6 of 7 phases shipped). Phase 6: Settings & Misc next.

## Current Position

Milestone: v1.0 Feedback Clearance & Polish
Phase: 6 of 7 (Settings & Misc) — In progress (06-01 closed; 06-02 next)
Plan: 06-01 closed (PLAN/APPLY/UNIFY all ✓) with auto-fix for latent settings-render bug
Status: 06-01 loop closed
Last activity: 2026-05-07 — UNIFY complete for 06-01. SUMMARY written. Feedback b4faaccd + 981dde72 marked resolved; 2dc7c45a properly fixed and re-resolved. 179/179 tests passing.

Progress:
- Milestone: [████████░░] 86% (6 of 7 phases complete — 1, 2, 2.5, 3, 4, 5)
- Phase 6: [░░░░░░░░░░] 0% — 06-01 planned; 06-02 queued

## Loop Position

Current loop state:
```
Phase 2 (closed):
  02-01 + 02-01-FIX:  PLAN ──▶ APPLY ──▶ UNIFY ──▶ VERIFY    [✓ closed, merged via PRs #26, #27]

Phase 2.5 (closed):
  02.5-01:            PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed, committed addd7a7]

Phase 3 (closed):
  03-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  03-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]

Phase 4 (closed):
  04-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  04-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]

Phase 5 (closed):
  05-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  05-02:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  05-03:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]

Phase 6 (active):
  06-01:              PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed]
  06-02:              ○ ──── ○ ──── ○             [Ready to plan — pop-out doing timers]
```

## Accumulated Context

### Decisions

- Kept MutationObserver as primary signal in review.js `_watchClarifyClose`; statechange is fallback only (preserves visual timing)
- Used `display: none` for association flyout when task flyout is open (not z-index) — hides invisible tap target cleanly
- convertedProjectId captured before _completeClarifyStep (state resets during close) — must capture early in finalizeClarifyRouting
- Auto-open project flyout skipped during process sessions (batch clarify) — would conflict with next queued task
- 2026-05-07: Phase 3 re-scoped from a live `GET /feedback` query rather than the 2026-05-06 stripped scope, after finding the prior audit had over-stripped. Future phase audits should always re-query `/feedback` rather than diff against a static snapshot.
- 2026-05-07: Phase 2.5 inserted ahead of Phase 3 by user request. Mirrors urgent-bar pattern (data.js `getUrgentTasks` + ui.js `renderUrgentBar`) for "My Day" (myDayDate==today OR dueDate==today, uncapped) and "Neglected" (top 5 active tasks past `staleTaskThresholds.stale`, default 14 days).
- 2026-05-07: My Day + Neglected CSS uses hardcoded hex (`#2563eb`, `#b45309`) blended via `color-mix(... var(--surface))` — mirrors the existing urgent-bar at `style.css:6498` (`#dc2626`) instead of introducing new `--myday-accent`/`--neglected-accent` theme variables. If the urgent-bar is ever migrated to variables, migrate all three bars together.
- 2026-05-07: Inbox tasks excluded from `getNeglectedTasks()` (inbox is unprocessed, not stale). My Day kept uncapped, Neglected hard-capped at 5; settings UI to tune both deferred to a future plan.
- 2026-05-07 (03-01): Projects panel section heading uses a fresh `.project-create-heading` class (not the existing `.workspace-tool-title`) — different layout context; reusing would carry implicit cascade from rules meant for the workspace-tool sidebar pattern.
- 2026-05-07 (03-01): "Add a new project" heading sits OUTSIDE the form (not as a `<legend>` inside a `<fieldset>`) to keep the existing `aria-label="Create project"` semantics untouched.
- 2026-05-07 (03-01): In-panel "Active" status group label at `ui.js:7793` deliberately preserved — it's a status filter, not the panel title. Boundaries section caught this; future plans should look for shared-vocabulary traps when renaming.
- 2026-05-07 (05-02): Weekly Review per-section guidance pattern — single `#reviewSectionGuidance` element in shared header, toggled by `section.id` in both `_renderCurrentItem` and `_renderHistoricalItem`. Future Review sections that need scoped guidance can extend this pattern instead of inlining per-card.
- 2026-05-07 (05-02): Default `#settingsAccordionLists` open in `index.html` (matches Appearance accordion). Smallest fix for "I see no tags or contexts at all" — closed `<details>` was the cause, not a code regression. Rename/Delete buttons in `panels/settings.js:684-700` were always wired correctly.
- 2026-05-07 (05-03): Bulk-edit moved from immediate-apply to draft+Apply/Cancel. State held in `this.pendingBulkEdits` (single-value selects) and `this.pendingContextIntents` Map (Contexts chip cycle). Future multi-value bulk fields (people-tags etc.) should mirror the contexts chip pattern: observed-state class × intent-state class, cycle handler in setupMultiEditBar, intent-application helper returning a new array, equality helper to skip no-op writes.
- 2026-05-07 (05-03): Selection-reconciliation reads live DOM (`.task-row[data-task-id]`) after Apply rather than re-running panel filter predicates. Depends on synchronous statechange→render — confirmed sync at `data.js:874-876`. If a future panel renders task rows outside this DOM convention, reconciliation will silently leave stale ids in selectedTaskIds.
- 2026-05-07 (05-03): Two-step Escape on multi-edit bar — draft cancels first, selection clears second. Matches Linear/Notion convention; gives non-destructive abandon path for staged edits.
- 2026-05-07 (06-01): When `panels/<name>.js` modules need a helper from `ui.js`, IMPORT it (or duplicate the pure body locally) — never reference ui.js's top-level functions as free identifiers. The `Object.assign(UIController.prototype, ...)` mixin pattern makes methods callable on the controller but does NOT bridge ES module scope, so free-identifier references throw `ReferenceError` at render time. This bit us on `stripTagPrefix` and `normalizeThemeHexInput`; both are now duplicated locally in `panels/settings.js`. Future audit candidate: a `app/web_ui/js/utils.js` shared module to consolidate these helpers, but only when more than 2 panel modules need them.
- 2026-05-07 (06-01): Misdiagnosed 05-02 "Settings empty" as a closed-accordion issue when the real cause was a render-abort. Lesson saved to memory: when a user reports "X is missing/empty," ASK FOR BROWSER CONSOLE OUTPUT before picking a fix layer. The default-open accordion still ships (separate UX improvement), but the empty-sections symptom was unrelated to it.

### Deferred Issues

- Process session case for auto-flyout (0bf1bf88): when batch-clarifying, the project flyout is not opened after convert routing to avoid conflict with the next queued task.
- 57 open feedback items not currently in ROADMAP scope. Decide later whether to bucket more into Phases 3–6, draft new phases, or descope the milestone tagline.
- `483a286b` (rename "Move to waiting" + delegate-to-person) is task-flyout work; sitting outside Phase 3 scope but flagged as a candidate.
- `bb343993` (apply Backlog UX elements to other pages) descoped from v1.0 milestone 2026-05-07 per user. Feedback record stays open for a future milestone; revisit if user clarifies which elements + which pages.
- Phase 2.5 follow-up candidates (out of scope for 02.5-01): settings UI to tune the Neglected cap (currently hardcoded 5) and the My Day cap (currently uncapped); shared "status-bar" base class refactor of urgent + my-day + neglected once the new bars prove stable.

### Blockers/Concerns

None.

### Git State

- Phase 5 merged to main 2026-05-07 (commit `0556ca9`, fast-forward). Branch `feature/active-task-views` deleted post-merge. NOT YET pushed to origin.
- Active branch: `feature/settings-misc` (created from main 2026-05-07; will hold 06-01 + 06-02 before merging).
- Earlier merges: Phase 2.5 (`52abf0b`); Phase 3 (`3c80027`); Phase 4 (`6164484`).

## Session Continuity

Last session: 2026-05-07
Stopped at: 06-01 closed on feature/settings-misc with auto-fix bundled; ready to plan 06-02.
Next action: `/paul:plan` for 06-02 — pop-out doing timers (`a87a75af`). Last plan in Phase 6.
Resume context:
- Branch: `feature/settings-misc` (will hold 06-02 before merging Phase 6 to main)
- npm test baseline: 179/179 passing
- 06-02 scope: `a87a75af` pop-out window for "doing" timers — feature-ish, will need design discussion (one-window or per-task pop-outs? localStorage state? close behavior?)
- 64227659 (guided tour) descoped 2026-05-07 from v1.0 — moved to ROADMAP "Deferred (Someday)" for a future milestone
- 2dc7c45a was re-opened mid-06-01 after user UAT exposed the wrong-layer 05-02 fix; properly resolved during 06-01 with the helper-duplicates fix

---
*STATE.md — Updated after every significant action*
