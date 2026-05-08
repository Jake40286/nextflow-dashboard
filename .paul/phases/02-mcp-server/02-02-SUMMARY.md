---
phase: 02-mcp-server
plan: 02
subsystem: mcp/sidecar
tags: [mcp, mcp-tools, task-entity, gtd-status, fieldtimestamps, merge-field-groups, fastmcp]

requires:
  - phase: 02-mcp-server (plan 01)
    provides: app/mcp_server.py with project tools, _write_state_with_retry, _now_iso, _build_task_record, TASK_STATUSES, _project_summary helper pattern
provides:
  - Task entity read surface (list_tasks with 4 filters, get_task with full record + notes/listItems)
  - Task entity light-update surface (update_task_status, set_task_project)
  - Task notes append (add_task_note) with `note-<uuid>` IDs matching JS `generateId('note')`
  - Per-group LWW timestamp pattern for MCP-side mutations (`_fieldTimestamps.<group>` bumped on writes that touch a field tracked in `MERGE_FIELD_GROUPS`)
  - `_update_task_in_state(state, task_id, mutator)` shared helper for any future single-task mutation tool
affects: 02-03 (tests, refactor decision now strongly biased toward split), Phase 3 (auth+LAN-bind, complete-task tool, edit/delete-note tools, arbitrary-field updates)

tech-stack:
  added: []                       # zero new deps; only sidecar code grew
  patterns:
    - "Single-task mutations go through `_update_task_in_state(state, task_id, mutator)` — the helper finds the task by id, runs the mutator (which may set fields and bump per-group `_fieldTimestamps`), bumps `task.updatedAt`, and rebuilds the tasks list. Future single-task tools (edit_task_title, set_task_due_date, etc.) should reuse this rather than re-implementing the find+rebuild pattern."
    - "Per-group LWW awareness is required for any field tracked in MERGE_FIELD_GROUPS (data.js:32-39). When writing such a field, also write `task._fieldTimestamps[<group>] = _now_iso()`. Without this bump, a stale browser PUT can silently overwrite the MCP-side change at merge time. `update_task_status` is the first tool to enforce this; the same rule applies to any future tool that touches `myDayDate`, `calendarDate`, `calendarTime`, `dueDate`, `followUpDate`, `urgent`, or `prerequisiteTaskIds`."
    - "Read tools strip internal sync fields and drop empty/null/None values from the public summary. `_task_summary` (drops empties, exposes only the 9 documented fields) is for `list_tasks`; `_public_task` (full record minus the 5 internal sync fields) is for `get_task`. Mirrors the project-side `_project_summary` pattern from 02-01."
    - "Notes are append-only from MCP. The new note carries a fresh `note-<uuid>` id; the existing array is preserved via `[*existing, new_note]`. Editing or deleting an existing note would compete with `mergeSubcollection` per-item LWW and is deferred to Phase 3."

key-files:
  created: []                     # no new source files
  modified:
    - app/mcp_server.py (494 lines → 789 lines; +295 net, +60%)
    - .paul/STATE.md, .paul/paul.json, .paul/ROADMAP.md (bookkeeping)

key-decisions:
  - "Status changes go through `_fieldTimestamps.status` per MERGE_FIELD_GROUPS (data.js:32-39). Confirmed by direct read; no surprises."
  - "`projectId` is NOT in MERGE_FIELD_GROUPS — `set_task_project` bumps only `task.updatedAt`, relying on whole-task LWW for merge resolution. Read of data.js:32-39 verified this; the plan's pre-write hypothesis turned out correct."
  - "`set_task_project` pre-validates the target project exists via a read-only `_fetch_state` BEFORE entering the write loop. Cost: one extra GET on success. Benefit: clear error message instead of silently linking to a nonexistent project. Trade-off accepted — this is an LLM-facing tool and 'project not found, here are your existing projects' is much more useful than 'no error, but the link points nowhere'."
  - "`add_task_note` writes notes with `id, text, createdAt, updatedAt, _source: 'mcp'`. AC-5 explicitly requires this shape. KNOWN DIVERGENCE from JS: `normalizeTaskNotes` (data.js:4514-4543) keeps `id, text, createdAt, updatedAt` and DROPS `_source`. The audit field survives initial PUT and is visible in `get_task` until the next browser-side normalize pass. Decision: keep `_source: 'mcp'` per the AC; mark as a Phase 3 candidate to either (a) extend `normalizeTaskNotes` to preserve `_source` or (b) remove the field from MCP writes if the audit value isn't worth the divergence. See Deferred Items."
  - "Status enum excludes 'completed'. Completing a task moves the record from `state.tasks` to `completionLog` — a different lifecycle event. Out of Phase 2 scope; deferred to Phase 3 with its own plan because it touches the completion-log path that other panels (Stats, Reports) read separately."
  - "`mcp_server.py` final size: 789 LoC, beyond the plan's 700-LoC projection. Refactor to `app/mcp/` package is now the recommended call for 02-03 (file roughly doubles again if Phase 3 adds 5+ more tools — auth wrapper, complete-task, edit-note, etc.). Decision deferred to 02-03 plan; recorded here as the recommended path."

patterns-established:
  - "Single-task mutator pattern: `def mutator(task) -> task` callbacks composed with `_update_task_in_state` and `_write_state_with_retry`. Encapsulates the find-by-id, mutate, bump-updatedAt, and rebuild-tasks-list steps so each new tool only writes the field-set logic specific to its purpose."
  - "MERGE_FIELD_GROUPS audit BEFORE writing a field: every plan touching a task field must include 'READ data.js MERGE_FIELD_GROUPS first' in its action. Field-name fidelity (from 02-01) covers names; this covers timestamp semantics."

duration: ~30min
started: 2026-05-08T18:30:00Z
completed: 2026-05-08T19:00:00Z
---

# Phase 2 Plan 02: Task Entity Tools — Summary

**Five new MCP tools live: `list_tasks`, `get_task`, `update_task_status`, `set_task_project`, `add_task_note`. Combined with 02-01's project tools, MCP can now do nearly any common nextflow operation that doesn't involve task completion or destructive deletion. The headline correctness invariant — `_fieldTimestamps.status` is bumped on `update_task_status` so MCP-side status changes survive concurrent browser writes via the per-group LWW merge layer — is enforced at the code level via the `_update_task_in_state` mutator pattern.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 minutes |
| Started | 2026-05-08T18:30:00Z |
| Completed | 2026-05-08T19:00:00Z |
| Tasks | 3 auto + 1 human-verify checkpoint, all complete |
| Files modified | 1 production (`app/mcp_server.py`) + 3 PAUL bookkeeping |
| Source LoC delta | `app/mcp_server.py` 494 → 789 (+295 lines, +60%) |
| Tools registered (running total) | 10 (5 from 02-01 + 5 from this plan) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: `list_tasks` filters work; response is LLM-friendly | Pass | Four filters (status, project_id, context, areaOfFocus) combined with logical AND. Empty string = no constraint. `status` validated against TASK_STATUSES; invalid status raises ValueError. `_task_summary` exposes only the 9 documented fields and drops empty values; internal sync fields (`_fieldTimestamps`, `_source`, `slug`, `originDevice*`) stripped. Completed tasks excluded by construction (live in `completionLog`, not in `state.tasks`). |
| AC-2: `get_task` returns full task with notes | Pass | Full task record minus the 5 internal sync fields, with `notes` and `listItems` arrays included verbatim. Missing id raises ValueError → FastMCP surfaces as tool error to the LLM. Read uses raw `_fetch_state` (no `_state_lock` per the read-decision locked in 02-01). |
| AC-3: `update_task_status` mutates correctly with `_fieldTimestamps` bump | Pass | Status validated against TASK_STATUSES; invalid raises ValueError without writing. Mutator sets `task.status`, then writes `task._fieldTimestamps.status = _now_iso()` (per-group LWW key for the `status` group in MERGE_FIELD_GROUPS). `_update_task_in_state` bumps `task.updatedAt`. Single PUT through `_write_state_with_retry` → `_rev` advances by exactly one. Browser refresh confirmed the task moves between Pending/Doing panels. |
| AC-4: `set_task_project` re-links a task | Pass | Empty-string `project_id` → `task.projectId = None` (unlink). Non-empty → pre-validates project exists in `state.projects` via read-only fetch; missing project raises ValueError with a helpful pointer to `list_projects`/`create_project`. `projectId` is not in MERGE_FIELD_GROUPS, so only `task.updatedAt` is bumped — confirmed correct against data.js:32-39. Browser refresh confirmed the task moves between project task lists. |
| AC-5: `add_task_note` appends without disturbing existing notes | Pass | Empty/whitespace-only `text` raises ValueError. Note built as `{id: 'note-<uuid>', text, createdAt, updatedAt, _source: 'mcp'}` (id format matches `data.js generateId('note')`). Append uses `[*existing, new_note]` — never replaces the array. `_rev` advances by exactly one. Browser refresh shows the note in the task; existing notes unchanged. **Caveat:** `_source: 'mcp'` is dropped by `normalizeTaskNotes` on the next browser-side normalize pass — see Deferred Items. |
| AC-6: Boundaries respected | Pass | `git diff main -- app/server.py app/web_ui/ tests/ docker-compose.yml Dockerfile.mcp requirements-mcp.txt` is empty. Existing 5 tools untouched (verified by reading byte ranges in mcp_server.py). Zero new dependencies. |

## Accomplishments

- **Round-trip ergonomics complete.** Combined with 02-01, the LLM can answer "what's on my pending list?", "mark the dentist task as doing", "move this task to the Tokyo trip project", and "add a note that I tried calling them at 3pm" — each as a single tool call. The four most natural follow-ups to project/task creation are now first-class.
- **Per-group LWW correctness enforced at the code level.** `update_task_status` bumps `_fieldTimestamps.status` via the `_set_status` mutator. This is the first MCP tool that mutates a field tracked in `MERGE_FIELD_GROUPS`, and the pattern (read MERGE_FIELD_GROUPS first, bump the right group key in the mutator) is now the canon for any future tool that touches `myDayDate`, `calendarDate`, `calendarTime`, `dueDate`, `followUpDate`, `urgent`, or `prerequisiteTaskIds`.
- **`_update_task_in_state` shared helper introduced.** All three light-update tools route through one find+mutate+bump+rebuild helper. Saves repetition now and is the right shape for Phase 3's edit-existing-note, complete-task, and arbitrary-field-update tools.
- **`set_task_project` validates target project early.** Pre-write `_fetch_state` confirms the target project exists; the LLM gets "project X not found; use list_projects" instead of a silent no-op link. One extra GET on success; well worth it for an LLM-facing tool.

## Task Commits

This plan has not yet been committed. Following the per-plan commit cadence visible in `git log` (e.g. `ca96c41 feat(mcp): project tools + atomic decomposition (Phase 2 plan 01)`), the recommended close-out commit is:

```
feat(mcp): task entity tools — list/get/update_status/set_project/add_note (Phase 2 plan 02)
```

scoping `app/mcp_server.py` plus the .paul/* bookkeeping (`STATE.md`, `paul.json`, `ROADMAP.md`, this `02-02-SUMMARY.md`, the `02-02-PLAN.md`). Per the "create NEW commits, never amend" hook discipline.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/mcp_server.py` | Modified (+295 LoC) | Added 5 tools (`list_tasks`, `get_task`, `update_task_status`, `set_task_project`, `add_task_note`) plus helpers (`_task_summary`, `_public_task`, `_update_task_in_state`, `_new_note_id`) and field-list constants (`_TASK_INTERNAL_FIELDS`, `_TASK_SUMMARY_FIELDS`). Existing 5 tools untouched. |
| `.paul/phases/02-mcp-server/02-02-PLAN.md` | Created (already existed pre-APPLY) | The plan executed by this loop. |
| `.paul/phases/02-mcp-server/02-02-SUMMARY.md` | Created (this file) | Loop-close documentation. |
| `.paul/STATE.md` | Modified | Loop position bookkeeping (PLAN ✓ APPLY ✓ UNIFY ✓). |
| `.paul/paul.json` | Modified | Satellite manifest sync (loop position, timestamps). |
| `.paul/ROADMAP.md` | Modified | Phase 2 progress update (2 of 3 plans closed). |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `_fieldTimestamps.status` bumped on every `update_task_status` write | `MERGE_FIELD_GROUPS.status = ["status"]` (data.js:32-39) — without bumping the per-group key, a stale browser PUT carrying an older `_fieldTimestamps.status` would win the merge against the MCP-side change | Establishes the timestamp-bump rule for any future MCP tool that mutates a tracked field |
| `set_task_project` only bumps `task.updatedAt`, not a per-group `_fieldTimestamps` | `projectId` is NOT in any MERGE_FIELD_GROUP — it merges via the whole-task `updatedAt` LWW path | Prevents over-bumping (writing to a field-group key that doesn't exist would just be cruft); confirms the "audit MERGE_FIELD_GROUPS first" pattern works for negative cases too |
| `set_task_project` pre-validates target project exists | LLM-facing tools should produce diagnosable errors, not silent no-ops | One extra GET on success; clear error message ("use list_projects") on miss |
| Notes carry `_source: 'mcp'` despite being stripped by JS `normalizeTaskNotes` | AC-5 explicitly required it; the field is a transient server-side audit hint that survives the initial PUT and disappears on the next browser normalize pass | Documented as a Phase 3 candidate (extend `normalizeTaskNotes` to preserve `_source`, OR remove `_source` from MCP writes); not a defect against the AC |
| `mcp_server.py` stays monolithic for 02-02; refactor to `app/mcp/` package recommended for 02-03 | File grew 494 → 789 LoC; another phase of additions (auth, complete-task, etc.) doubles it again | Strong recommendation in 02-03 PLAN.md; not pre-locked here — let 02-03 weigh tests-first vs refactor-first |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 1 | Logged below |

**Total impact:** Plan executed exactly as written. The single deferred item is a downstream-JS interaction surfaced by AC-5 as written, not a plan defect.

### Auto-fixed Issues

None. The MERGE_FIELD_GROUPS read confirmed both hypotheses in the plan (status tracked, projectId not), so no spec drift like the 3 caught in 02-01.

### Deferred Items

- **Note `_source: 'mcp'` is dropped by JS `normalizeTaskNotes`** (data.js:4514-4543). The field survives the initial MCP PUT and is visible to subsequent `get_task` calls until the browser next normalizes notes for that task (any note edit/delete or a fresh load against migrated state). Phase 3 candidate: either (a) extend `normalizeTaskNotes` to preserve `_source` like the project shape does for projects, or (b) remove `_source` from MCP-written notes if the audit value isn't worth the JS-side change. Discovered during qualify of Task 3.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Network reachability question raised at the human-verify checkpoint (Claude Desktop on the LAN can't reach the sidecar — 127.0.0.1 bind only) | Confirmed the bind is the deliberate Phase 1 PoC decision (no auth → loopback only); Phase 3 will flip to `0.0.0.0:8003:8001` once the bearer-token gate ships. Documented LAN-access options for the user (run Claude Desktop on the host, SSH tunnel, or wait for Phase 3). No code change. |

## Next Phase Readiness

**Ready:**
- Phase 2 surface area for v1.1 is mostly complete: 10 tools cover create/read/light-update for both project and task entities.
- Smoke-test path proven via the 02-01 atomicity-test artifacts (the project + 3 tasks created in 02-01 are the natural fixtures for 02-03's regression tests).
- Pattern bank for 02-03: `_update_task_in_state` + per-group `_fieldTimestamps` audit + read-only pre-validation. These should also seed the conformance-test suite.

**Concerns:**
- `app/mcp_server.py` at 789 LoC is past the comfortable single-file threshold. 02-03 should make a decisive refactor-vs-defer call up front rather than adding tests on top of an unwieldy monolith.
- Note `_source` divergence (above) is small now but compounds if more entities adopt MCP-only audit fields without a corresponding JS-side preserve.
- The `create_task` tool from 01-02 still uses bare uuid hex IDs (not `task-<uuid>`) — consistency cleanup is a 02-03 deferred from 02-01; with task tools shipping in 02-02 the inconsistency is now LLM-visible (mixed-format IDs in `list_tasks`/`get_task` results vs. project-side `project-<uuid>`).

**Blockers:** None. 02-03 can plan immediately.

---
*Phase: 02-mcp-server, Plan: 02*
*Completed: 2026-05-08*
