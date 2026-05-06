# Phase 2 — Inbox & Clarify: Discussion Context

**Created:** 2026-05-06
**Source:** /paul:discuss 2

---

## Goals

Polish the capture and clarification flow. Two active items from the feedback backlog.

### 0bf1bf88 — Fix "New Project" path in clarify

**Problem:** The "New project" button in the clarify modal's Project section is broken in two ways:
1. `handleClarifyConvertToProject()` shows a blank name input — the task title is never pre-filled, so the user types the project name from scratch. The flyout path (`convertTaskToProject`, line 8049) pre-fills from `task.title`; the clarify path should do the same from `clarifyState.previewText`.
2. After routing completes, the modal closes and the project disappears with a toast. The user never gets a chance to add a description, area, or notes — no flyout, no continuation.

**Fix:**
- When "New project" is clicked, pre-populate the name input from `clarifyState.previewText` (the working title the user may have edited during clarify)
- After `finalizeClarifyRouting` completes for a "convert to project" path, auto-open the project flyout (`openProjectFlyout(projectId)`) for the newly created project — same flyout the user gets by clicking a project card, no navigation away from inbox

**Constraint:** Must not navigate away from inbox. Project flyout opens inline (it already overlays the current panel).

### 160e0923 — Description editable during clarification

**Problem:** The clarify modal shows no description field during processing. `clarifyDescSummary` (in the post-Yes area) is permanently `hidden` and never un-hidden. The `clarifyPreviewDescription` (preview header area) shows it read-only and clamped, but the user can't add or edit description during clarify steps.

**Fix:**
- Un-hide `clarifyDescSummary` after the user clicks Yes (actionable)
- Populate it from `task.description` on modal open (via `populateClarifyPreview`)
- Edits already wire to `task.description` via the existing `clarifyDescSummary` input listener (line 431) — just needs the element to be visible
- The description entered here should carry forward when "New project" is used (it becomes the project's seed description)

---

## Resolved Items

- **bb6a0dba** — "Add My Day option to date section": Already implemented (`clarifyDateOptionMyDay` in HTML). Mark resolved in feedback log.
- **c4c05706** — "Completion notes for quick tasks": Already implemented (textarea + handler wired). Mark resolved in feedback log.

---

## Files Likely Touched

- `app/web_ui/js/ui.js` — `handleClarifyConvertToProject()`, `populateClarifyPreview()`, `finalizeClarifyRouting()`, `bindClarifyModal()`
- `app/web_ui/index.html` — possibly minor label/attribute change on `clarifyDescSummary`

---

## Approach Notes

- No new modals, no new elements needed — both fixes use existing DOM elements and existing methods
- The project flyout is already panel-agnostic; `openProjectFlyout(id)` can be called from any context
- The description `clarifyDescSummary` listener is already wired (line 431) — visibility is the only gap
- Track `clarifyState.convertedProjectId` (new field) so `finalizeClarifyRouting` knows whether to open the flyout post-close

---

*Handoff to /paul:plan*
