# Area of Focus Overhaul — Implementation Plan

**Goal:** Eliminate work/personal task collision by making Area of Focus a scoped workspace lens that filters contexts, people, and projects app-wide.

---

## Decided

### Data model
- `contextOptions` and `peopleOptions` migrate from `string[]` to `object[]`:
  ```js
  { name: "@Office", areas: ["Work"] }
  { name: "@Phone",  areas: [] }          // universal (empty = all areas)
  ```
- Three tiers: Universal (areas=[]), Single (areas=["Work"]), Multi (areas=["Work","Personal"])
- Universal computed at read time: `areas.length === 0` — no sentinel value needed
- Projects keep `areaOfFocus: string` (single area, already correct)
- Tasks keep `areaOfFocus: string` (single area)

### Migration
- On `loadRemoteState()`, wrap any string entry → `{ name: entry, areas: [] }` (universal)
- All existing contexts/people start as universal — no visible behavior change on day one

### Active area lens
- `activeArea` stored in localStorage only (device-local, like theme)
- `null` = no lens = current behavior (all items visible)
- Filter rule: item is visible if `areas.length === 0 OR areas.includes(activeArea)`

### Task area inheritance
```
effectiveArea(task) =
  task.areaOfFocus       // explicitly set → use it
  ?? project.areaOfFocus // has a project → inherit
  ?? null                // no project, no area → universal (appears in all lenses)
```

### Area deletion (Option 3 — merge/reassign dialog)
- Deleting an area prompts: *"Reassign 'Work' references to: [dropdown] or [clear all]"*
- Covers: rename (Work → Professional), merge (Work + Freelance → one), true delete (clear all)
- Implementation: `migrateAreaReferences(fromArea, toArea | null)`
  - Replaces `areaOfFocus` on all tasks and projects
  - Removes `fromArea` from `areas[]` on all contexts and people
  - Resets `localStorage activeArea` if it matches `fromArea`
- No soft-delete / `deletedAreaOptions` needed (area names don't appear in free text)

---

## Open — Needs Decision

### 1. ~~Where does the area lens selector live in the UI?~~ DECIDED: Scope row above filter card

Area of Focus is a *scope*, not a filter — placing it inside the filter card would create a filter that rewrites its own siblings. Instead:
- A dedicated always-visible scope row sits **above** the filter card
- Switching area instantly redraws filter card options (one-directional: area → filters)
- Filter card expand/collapse behavior unchanged — it just renders `visibleInArea()` results

```
[ Work ] [ Personal ] [ Home ] [ All ]   ← scope row (always visible)
──────────────────────────────────────
Filters ▾                                ← dynamically scoped to active area
  Context: @Office  @Lab
  People:  +Manager +Coworker
```

---

## Implementation Phases

### Phase 1 — Data migration (no UX change)
- Migrate `contextOptions`/`peopleOptions` to `object[]` in `loadRemoteState()`
- Update all read sites (dropdowns, Settings list) to use `.name`
- App behavior identical to today

### Phase 2 — Area lens (core feature)
- Add `activeArea` to localStorage
- Add scope row above filter card (always-visible area pills)
- Apply `visibleInArea()` filter to all dropdowns and task-list panels
- Implement `effectiveArea(task)` inheritance (task → project → null/universal)

### Phase 3 — Configuration UI
- Context and people entries in Settings show area pill tags
- Inline area assignment (click item → multiselect areas)

### Phase 4 — Area deletion
- Merge/reassign dialog in Settings when deleting an area from `areaOptions`
- `migrateAreaReferences()` function
