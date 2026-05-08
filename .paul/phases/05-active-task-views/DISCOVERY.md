---
phase: 05-active-task-views
topic: Bulk-edit interaction redesign + scope clarification for "carry backlog UX to other pages"
depth: standard
confidence: HIGH (bulk-edit) / N/A (bb343993 needs user input)
created: 2026-05-07
---

# Discovery: Phase 5 Unknowns — Bulk-Edit Pattern & Vague-Scope Clarification

**Recommendation:**
1. **Bulk-edit redesign** — switch the multi-edit bar from "change a dropdown → instant commit → clear selection" to **"build a draft of changes, then click Apply."** Selection is preserved across edits inside one bulk-edit session; only Apply commits and clears.
2. **`bb343993` ("apply backlog UX to other pages")** — defer until you tell us which specific Backlog elements you want carried over and to which pages. This isn't a discoverable question; it needs a sentence or two from you. Suggest holding it out of the immediate planning batch.
3. **Plan-split adjustment** — the ROADMAP listed `fb700fcc` as one item under 05-03. In reality it's three sub-items, and only one (the redesign) belongs in 05-03. Reshuffle so 05-01 picks up the cosmetic + missing-fields parts.

**Confidence:** HIGH on the bulk-edit recommendation — your feedback (`fb700fcc` item 3) describes the desired pattern in plain words. Codebase change is well-scoped (one file, one bar, draft state instead of immediate commit). N/A on bb343993 — not enough information to make a recommendation; needs your input.

## Objective

Phase 5 has 7 feedback items in scope. Before planning, we needed to know:
- Which items have actual unknowns vs. which are clear UI tweaks?
- For the bulk-edit complaint (`fb700fcc` item 3), what's the right interaction model to switch to?
- For the vague backlog-UX-elsewhere item (`bb343993`), can we plan it without further input?
- Does the ROADMAP's 3-plan grouping still make sense after reading the actual feedback text?

## Scope

**Include:**
- Per-feedback-item triage (clear vs. needs-discovery)
- Bulk-edit interaction model — concrete options compared
- Plan-split sanity check against ROADMAP

**Exclude:**
- Detailed UI mockups — those belong in plan-level discussion
- The simple items (Area filter, flyout headers, missing fields, resolve-all button, context buttons, review copy) — clear from feedback text, no design questions to resolve before planning

## Findings

### Per-item triage

| ID | Description (paraphrased) | Plain or unknown? | Notes |
|----|---------------------------|-------------------|-------|
| `059f0a1e` | Add "Area of Focus" to the association filters | Plain | Mirror existing filter additions in the association flyout |
| `f3d948ce` | Make notes/lists header clickable to expand (not just the tiny button) | Plain | Expand the click target; one or two CSS/JS lines per header |
| `fb700fcc` (1) | Multi-select box covers task text — cosmetic | Plain | Positioning/CSS fix |
| `fb700fcc` (2) | Bulk-edit missing fields: Contexts, Effort, Time Required | Plain | Add three more select fields to the multi-edit bar; mirror existing project/area pattern |
| `fb700fcc` (3) | Bulk-edit auto-commits on each dropdown — wants "click Apply" | **Unknown** | This discovery's main subject |
| `bb343993` | "Apply backlog UX elements to other pages" | **Vague** | Needs your input on what + where; flagged for `/paul:discuss` |
| `8dac310e` | Weekly Review Next Actions — explanation copy on when to send to Someday | Plain | Copy change |
| `1f7139ee` | Backlog page needs a "resolve all" button | Plain | Add button + bulk-resolve handler |
| `2dc7c45a` | Edit/delete buttons missing on contexts | Plain | Bug — buttons existed and went missing somewhere; locate and restore |

**5 of 7 are plain UI work.** Only the bulk-edit redesign needs a design call before planning, and `bb343993` needs your clarification.

### Current bulk-edit behavior (codebase reconnaissance)

- `ui.js:3899-3964` — `updateMultiEditBar()` builds a bottom bar with three select fields (status, project, area). Bar slides up when ≥1 task is selected; slides out when selection is cleared.
- `ui.js:3966-3975` — `applyBulkField(field, value)` runs immediately on any select-change event. It loops the selected task ids, calls `updateTask` for each, **then calls `clearSelection()`**. The selection is wiped after one field change.
- Net effect: changing the status dropdown commits the status change AND clears the selection. To also change the project, the user has to re-select the same tasks. This is exactly what `fb700fcc` item 3 calls out.

### Option A — Local draft + explicit Apply (RECOMMENDED)

**Source:** matches the user's own description in `fb700fcc` item 3.

**Summary:** Select fields write to a local `_bulkDraft` object on `UIController` instead of running `updateTask` immediately. The multi-edit bar grows two new buttons: **"Apply" (commits all draft fields)** and **"Cancel" (discards the draft)**. Selection is preserved through the editing session; only Apply (or Cancel) clears it.

**What changes in code:**
- New instance state: `this._bulkDraft = {}` initialised on selection start, cleared on Apply/Cancel
- `applyBulkField` is renamed/replaced with `setBulkDraftField(field, value)` — writes to the draft, doesn't commit
- New `commitBulkDraft()` method — loops `this.selectedTaskIds` and applies the draft fields in one pass, then clears selection + draft
- New `cancelBulkDraft()` — clears the draft, leaves selection intact (or clears, depending on UX call)
- Multi-edit bar markup gains Apply/Cancel buttons + a "pending changes" count chip
- The Apply button is enabled only when at least one field is set in the draft

**Pros:**
- Matches the user's stated expectation literally
- Standard bulk-edit pattern (matches Gmail-style label editors, GitHub bulk-issue actions, etc.)
- Lets the user change multiple fields in one selection cycle — the core complaint
- Reversible until Apply (Cancel = no harm done)

**Cons:**
- More code than the smallest possible fix
- Slight extra UI weight (two new buttons + maybe a count chip)
- Need to decide: does Cancel clear selection or just the draft? (Recommend: Cancel clears just the draft; the user keeps their selection)

**For our use case:** Best fit. Resolves the complaint cleanly and fits the user's mental model.

### Option B — Keep instant commit, just don't clear selection (NOT RECOMMENDED)

**Summary:** Smallest change — remove the `clearSelection()` call at the end of `applyBulkField`. Each dropdown still commits immediately, but the selection survives so the user can change another field.

**Pros:**
- Tiny change (one line)
- Lets the user chain multiple field changes on the same selection

**Cons:**
- Still no Apply step — the user explicitly asked for one ("I should be able to change what I need, then click apply")
- No undo / no cancel — every dropdown change is a real edit, with no buffering
- Doesn't match the user's stated preference

**For our use case:** Does NOT match the feedback. Skip.

### Option C — Hybrid (REJECTED — same as Option A in practice)

A "pending edits" panel separate from the multi-edit bar with a more elaborate two-step UI. Rejected because Option A's existing bar with Apply/Cancel covers the intent at lower visual weight.

## Comparison

| Criterion | Option A (draft + Apply) | Option B (just don't clear) |
|---|---|---|
| Matches user's words | Yes | No |
| Fixes the multi-field selection cycle | Yes | Partial |
| Code volume | Medium | Tiny |
| Reversible / undoable | Yes (Cancel before Apply) | No (each change commits) |
| Standard bulk-edit pattern | Yes | No |

## Recommendation

**Bulk-edit (`fb700fcc` item 3): choose Option A — local draft + Apply/Cancel.**

**Rationale:** The user explicitly described this pattern. It's also the standard expectation in similar tools, and it gives them back the undo affordance they're effectively asking for ("change what I need, then click apply" implies "and if I changed my mind, I can back out").

**Plan-split adjustment:**

Original ROADMAP grouping:
- 05-01: Association filters and flyout improvements
- 05-02: Backlog panel improvements
- 05-03: Bulk edit UX

Recommend reshuffle:
- **05-01:** Pending Tasks ("next") panel polish — `059f0a1e` (Area filter), `f3d948ce` (flyout header click-target), `fb700fcc` items 1+2 (cosmetic + missing fields)
- **05-02:** Backlog panel improvements — `8dac310e` (review copy), `1f7139ee` (resolve-all), `2dc7c45a` (context buttons). **Hold `bb343993` out of this plan until clarified.**
- **05-03:** Bulk-edit interaction redesign — `fb700fcc` item 3 only (the draft-then-apply pattern). Possibly also fold in `bb343993` if your clarification points there.

This keeps each plan around 2-3 tasks and groups by interaction surface (the "next" panel, the backlog panel, the bulk-edit bar) rather than by feedback ID.

**Caveats:**
- `bb343993` cannot be planned without your input — the feedback text says "consider elements we can transfer over" but doesn't list the elements. A 2-minute back-and-forth via `/paul:discuss` would unlock it.
- Cancel-clears-draft-but-not-selection is one of two possible Cancel behaviors. If you prefer Cancel to also wipe the selection, say so during the 05-03 plan review. Default recommendation is to keep selection.
- Adding `Contexts` to bulk-edit is a multi-select problem (a task has an array of contexts, not a single value). Plan 05-01 will need to decide between "add/remove contexts" (additive) and "set contexts to exactly this list" (replacing). I'll flag this at plan time; not a discovery-blocker.

## Open Questions (for you)

- **`bb343993` clarification:** Which specific elements of the Backlog page UX do you want carried over, and which pages should receive them? — Impact: medium. Without this, 05-02 ships short by one item; 05-03 may absorb it later.
- **Cancel behavior:** When the user clicks Cancel on a bulk-edit draft, should we clear the draft only (default) or also clear the selection? — Impact: low. Decided in 05-03 plan review.
- **Bulk-set Contexts semantics:** add/remove vs. replace? — Impact: low. Decided in 05-01 plan review.

## Quality Report

**Sources consulted:**
- `data/feedback.json` — read each of the 7 in-scope items verbatim, 2026-05-07
- `app/web_ui/js/ui.js:229, 3899-3975, 4016` — current bulk-edit implementation, 2026-05-07
- `.paul/ROADMAP.md` Phase 5 entry — confirms 3-plan groupings, 2026-05-07

**Verification:**
- Bulk-edit instant-commit + clear-selection: Verified at `ui.js:3974` (`this.clearSelection()` inside `applyBulkField`)
- Multi-edit bar field set (status/project/area only): Verified at `ui.js:3900` element destructuring
- bb343993 vagueness: Verified by reading `data/feedback.json` description text directly

**Assumptions (not verified):**
- The Apply/Cancel button additions will fit visually in the existing multi-edit bar — assumes layout has room; confirmed at plan time
- "Contexts" in the multi-edit context could be a complex multi-select; flagged for 05-01 plan review

---
*Discovery completed: 2026-05-07*
*Confidence: HIGH (bulk-edit pattern); N/A (bb343993 — needs user input)*
*Ready for: `/paul:plan` for 05-01 (no blockers); 05-02 needs `bb343993` clarified or held aside*
