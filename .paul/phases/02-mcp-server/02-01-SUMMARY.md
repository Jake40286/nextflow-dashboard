---
phase: 02-mcp-server
plan: 01
subsystem: mcp/sidecar
tags: [mcp, mcp-tools, project-entity, atomic-decomposition, gtd-schemas, fastmcp]

requires:
  - phase: 01-mcp-feasibility
    provides: app/mcp_server.py walking-skeleton + _write_state_with_retry helper + _now_iso + minimal-task-shape pattern
provides:
  - Project entity end-to-end (create, list, get) accessible from MCP-aware LLMs
  - Atomic project + N tasks decomposition (the headline use case for v1.1)
  - Rich GTD-aware tool schemas with documented enums and free-form values where applicable
  - Project-id format alignment with JS convention (`project-<uuid>`)
affects: 02-02 (task tools — will mirror project pattern), 02-03 (tests + cleanup; refactor candidate now stronger)

tech-stack:
  added: []                       # zero new deps; only sidecar code grew
  patterns:
    - "Tool docstrings ARE the LLM-facing schema. FastMCP derives JSON Schema from type hints + docstring; rich enum/format documentation belongs in docstrings, not separate schema files."
    - "Project IDs use `project-<uuid>` format (matches data.js generateId('project') at data.js:367-371). Task IDs in 01-02 used bare uuid hex; consistency-fix is a deferred cleanup item."
    - "Read-side tools build a public-facing summary that strips internal sync fields (_fieldTimestamps, _source, _rev, _tombstones) and the vestigial project.tasks array. Future read tools should use the same `_project_summary`/`_task_public_view` helper pattern."
    - "Atomic write tools build ALL new entities first, then perform a single `_write_state_with_retry(mutate_fn)` call where `mutate_fn` appends both projects and tasks lists in the same dict — guarantees one PUT, one _rev increment."

key-files:
  created: []                     # no new source files
  modified:
    - app/mcp_server.py (140 lines → 494 lines; +354 net)
    - .paul/STATE.md, .paul/ROADMAP.md, .paul/paul.json (bookkeeping)

key-decisions:
  - "Project field names follow JS convention exactly: name (not title), themeTag (not theme), statusTag (not status). Spec drift caught at code review; implementation uses the actual JS fields verbatim. LLM-facing parameter names in tool schemas also use these names — no internal mapping layer."
  - "Project ID format: `project-<uuid>` (matches data.js). Tasks created in 01-02 used bare uuid hex; deferred consistency cleanup to 02-03."
  - "MCP-created projects do NOT write a `project.created` row to projectActivityLog (a feature the JS UI does at data.js:404-410). Out of scope for 02-01; the project still works fine without it. Phase 2/3 candidate."
  - "Read tools (`list_projects`, `get_project`) make raw `_fetch_state` calls without acquiring `_state_lock`. The lock is for write serialization only; concurrent reads are safe."
  - "Atomic decomposition cap is 50 tasks. Hardcoded; Phase 3 will refine via configurable cap + rate limit."
  - "Stayed monolithic: kept `app/mcp_server.py` as one file (now 494 LoC). Refactor to `app/mcp/` package becomes a stronger candidate in 02-03 since the file doubled."

patterns-established:
  - "Field-name fidelity to JS source: when writing MCP tools that mutate nextflow entities, READ data.js's create/normalize functions FIRST, then mirror the field names exactly. Don't trust the plan's field names without that read."
  - "Atomicity check: every multi-entity write tool must have an AC that captures `_rev` before/after and asserts `_rev_after == _rev_before + 1`. Any other delta means the implementation is doing N writes internally."

duration: ~50min
started: 2026-05-08T17:30:00Z
completed: 2026-05-08T18:20:00Z
---

# Phase 2 Plan 01: Project Entity + Atomic Decomposition — Summary

**Four new MCP tools live: `create_project`, `list_projects`, `get_project`, `create_project_with_tasks`. The flagship atomic decomposition tool is proven correct — `_rev` advances by exactly +1 for a project + 3 tasks (not +4). v1.1's headline use case "decompose a vague goal into a project plus next-action tasks" is now one tool call away.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~50 minutes |
| Started | 2026-05-08T17:30:00Z |
| Completed | 2026-05-08T18:20:00Z |
| Tasks | 3 auto + 1 human-verify checkpoint, all complete |
| Files modified | 1 production (`app/mcp_server.py`) + 4 PAUL bookkeeping |
| Source LoC delta | `app/mcp_server.py` 140 → 494 (+354 lines, +252%) |
| Tools registered (running total) | 5 (1 from 01-02 + 4 from this plan) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: `create_project` creates a project with full GTD metadata | Pass | The atomic-decomposition project (`project-c7fd2fac-...`) was created via the flagship tool, which uses the same project-builder helper as `create_project`. On disk: `name: "PAUL 02-01 atomicity test"`, `vision`, `areaOfFocus: "Personal"`, `themeTag: "Automations"`, `statusTag: "Active"` (default), `_source: "mcp"`. Same shape as a UI-created project plus the `_source` audit tag. |
| AC-2: `list_projects` and `get_project` return current state | Pass | Code review confirms: list filters out `statusTag == "Completed"` by default; `taskCount` is computed from active tasks only; `get_project` raises `ValueError` on missing id (FastMCP surfaces as tool error). User-driven verification at the checkpoint. |
| AC-3: `create_project_with_tasks` is atomic | **Pass — proven** | _rev BEFORE: 1436. Tool returned `_rev: 1437`. _rev AFTER (re-read from disk): 1437. Exactly +1 for 4 entities (1 project + 3 tasks). Project + all 3 tasks present on disk with `projectId` correctly linking tasks to project, all tagged `_source: "mcp"`. |
| AC-4: Tool schemas are LLM-readable and GTD-aware | Pass | Each tool's docstring documents enums (PROJECT_AREAS / PROJECT_THEMES / PROJECT_STATUSES / TASK_STATUSES) explicitly, notes which are closed vs free-form (areaOfFocus and themeTag accept custom values; statusTag is closed), defines defaults, and explains GTD semantics (e.g., "tasks default to status='next' because they are explicit next actions of a planned project"). Sample loaded via `ToolSearch select:mcp__nextflow__create_project_with_tasks` shows the description renders cleanly to the LLM. |
| AC-5: Boundaries respected | Pass | `git diff main` shows only `app/mcp_server.py` and the .paul/* bookkeeping changed. `app/server.py`, `app/web_ui/`, `tests/`, `docker-compose.yml`, `Dockerfile.mcp`, `requirements-mcp.txt` byte-for-byte unchanged. Zero new dependencies. |

## Accomplishments

- **Flagship use case shipped.** "Decompose this vague project into a project + tasks" is one MCP tool call: `create_project_with_tasks`. AC-3's atomicity check (`_rev` Δ = +1 for 4 entities) closes the loop on the architectural promise from DECISIONS.md.
- **GTD field semantics encoded for LLMs.** Tool docstrings teach the LLM what `areaOfFocus`, `themeTag`, `statusTag`, task `status`, `contexts`, `peopleTags` mean — and which are closed enums vs free-form. Projects/tasks created via MCP come out semantically right, not just structurally valid.
- **Field-name fidelity to JS established as a pattern.** The 02-01 plan's draft used `title`/`theme`/`status`; reading `data.js:2266-2280` revealed the actual JS shape (`name`/`themeTag`/`statusTag`). Implementation matches JS verbatim, no mapping layer. Lesson now captured in patterns-established.
- **Live tool discovery works seamlessly.** Three sidecar restarts during APPLY; each new tool surfaced to Claude Code automatically via `ListToolsRequest`. No manual re-registration needed.

## Task Commits

No git commits made yet during this plan. Per the convention used in Phase 1 (commit on a feature branch, merge to main at logical close), Phase 2 plan-level commits are TBD via the post-UNIFY decision flow.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: `create_project` | (deferred to plan commit) | feat | Project create with rich GTD schema; `name`/`themeTag`/`statusTag` matching JS convention |
| Task 2: `list_projects` + `get_project` | (deferred to plan commit) | feat | Read-side tools with public-summary projection (hides internal sync fields) |
| Task 3: `create_project_with_tasks` | (deferred to plan commit) | feat | Atomic decomposition flagship; single PUT, exactly +1 _rev |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/mcp_server.py` | Modified (+354 lines) | Added: `PROJECT_AREAS`/`PROJECT_THEMES`/`PROJECT_STATUSES`/`TASK_STATUSES` constants; `_new_project_id`, `_build_project_record`, `_build_task_record`, `_project_summary` helpers; tools `create_project`, `list_projects`, `get_project`, `create_project_with_tasks`. Existing `create_task` unchanged. |
| `.paul/STATE.md` | Modified | Loop position, plan progress, session continuity. |
| `.paul/ROADMAP.md` | Modified | 02-01 plan checkbox flipped. |
| `.paul/paul.json` | Modified (during APPLY) | phase.status: not_started → in_progress (set when plan was created). |
| `.paul/phases/02-mcp-server/02-01-SUMMARY.md` | Created (this file) | Plan completion record. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use JS-verbatim field names (`name`, `themeTag`, `statusTag`) for project entity in BOTH internal storage AND the LLM-facing tool parameters | Mapping layer would create indirection that's hard to debug ("why is the tool calling it `title` but the file says `name`?"). LLMs are smart enough to learn `name` is the project's display label. | All future Phase 2 project-related tools should use the same names. Task entity may need similar audit when Plan 02-02 starts. |
| Project ID format: `project-<uuid>` matching `data.js:generateId("project")` | Consistency with the rest of the codebase; makes searches in `state.json` predictable. | Tasks created via `create_task` in 01-02 still use bare uuid hex (a deferred consistency fix). |
| MCP-created projects skip the `projectActivityLog` `project.created` row | Out of scope for 02-01; activity-log emission is a JS concern (data.js:_logActivity). The project still functions correctly without the row — just no "Created on <date>" line in the project's Activity tab. | Phase 2/3 candidate to add: emit a synthetic activity-log row from the MCP write path. |
| Stayed monolithic — `app/mcp_server.py` as one file (now 494 LoC) | "Don't add abstractions beyond what the task requires." Refactor pressure increases as more tools are added. | 02-03 will likely refactor into `app/mcp/{server,sync,schemas,tools_project,tools_task}.py`. Decision deferred until file size or test ergonomics force the issue. |
| 50-task hardcoded cap on atomic decomposition | Sane initial guard against LLM hallucinations producing 200-task lists. | Phase 3 will refine: configurable cap, request rate limit, and possibly a `dry_run` flag to preview before commit. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed (Spec drift) | 3 | Field names corrected mid-task; no PLAN re-write needed |
| Scope additions | 0 | None |
| Concerns flagged + retired | 0 | Implementation proceeded without uncertainty (01-02 SDK pattern was a known good base) |
| File-size estimate drift | 1 | Projected ~250 LoC; actual 494 LoC. Recorded; not blocking. |

**Total impact:** All deviations were Spec corrections discovered by reading `data.js` before writing code, exactly as the patterns-established guidance now codifies. Net behavioral deviation from plan: zero.

### Auto-fixed Spec drift

**1. Project field name `title` → `name`**
- **Found during:** Task 1 EXECUTE (read `data.js:addProject` at line 2260)
- **Plan said:** `title` parameter on `create_project`.
- **Reality:** JS uses `name`. Tasks use `title`; projects use `name`. Different entities, different fields.
- **Fix:** Implementation uses `name` everywhere. Tool docstring documents this.

**2. Project field name `theme` → `themeTag`**
- **Found during:** Task 1 EXECUTE.
- **Plan said:** `theme` parameter.
- **Reality:** JS uses `themeTag`.
- **Fix:** Implementation uses `themeTag`.

**3. Project status enum field name `status` → `statusTag`**
- **Found during:** Task 1 EXECUTE.
- **Plan said:** `status` for the GTD enum (`Active | OnHold | Completed`).
- **Reality:** JS uses `statusTag` for the GTD enum. The field `status` exists on projects too but holds a different value (lowercase `"active"`) — a lifecycle field, not the GTD enum. My implementation now writes BOTH (`status: "active"` for the lifecycle field, `statusTag: <enum>` for GTD), matching JS exactly.
- **Fix:** `_build_project_record` sets both fields correctly; tool docstring uses `statusTag` parameter name.

### File-size estimate drift

`app/mcp_server.py`: planned ~250 LoC; actual 494 LoC. Causes:
- Docstrings are intentionally rich (per the GTD-semantics decision from DECISIONS.md). Each tool's docstring is 20-40 lines.
- `create_project_with_tasks` validation is substantial (project + per-task validation, length cap, enum checks).
- Task-record builder (`_build_task_record`) added for the atomic tool's reuse pattern.

Not blocking. Strengthens the case for the 02-03 refactor to `app/mcp/` package.

### Deferred Items

- **Task ID format consistency** — 01-02's `create_task` uses bare uuid hex; new project tools use `project-<uuid>`. Decide in 02-03 whether to update `create_task` to `task-<uuid>` for consistency or leave as-is.
- **`projectActivityLog` rows for MCP-created projects** — Currently no synthetic "project.created" row. UI's Activity tab won't show a creation entry. Phase 2/3 candidate.
- **`areaOfFocus`/`themeTag` validation against user's custom areas** — The tool accepts free-form strings, which is correct (the user can have custom areas), BUT the LLM may invent areas the user has never used. Phase 3 candidate: validate against `state.settings.areaOptions` and warn (not reject) if a new area is being introduced.
- **Refactor `app/mcp_server.py` into a package** — At 494 LoC and growing, a `app/mcp/` package split is the right move once Plan 02-02 adds task-side tools. Plan 02-03 candidate.
- **`add_task_note` consideration** — User mentioned earlier it might be useful enough to bump from 02-02 to 02-01 if convenient. Did not bump. Defer to 02-02 as planned.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Plan 02-02 (Task entity tools) is fully unblocked. Patterns are established: read data.js's task-create code first, mirror field names verbatim, build minimal-shape records with `_source: "mcp"`, use `_write_state_with_retry`.
- Plan 02-03 (tests + cleanup) has a clear list of items: pin `starlette<2`, remove `version: "3.8"` from compose, add automated tests for the MCP server (especially the 409 retry path), refactor `mcp_server.py` if file size justifies, fix `create_task` ID format if consistency matters.
- Live MCP server is healthy with 5 tools registered. No restart-loop or memory issues observed.

**Concerns:**
- **File size at 494 LoC.** Adding 5 task-side tools in 02-02 will likely push past 700 LoC. The refactor decision can wait until 02-03, but 02-02 should NOT add abstractions speculatively — let 02-03 do the refactor cleanly with all tools in place.
- **No automated tests yet.** The 409 retry path is untested under contention; it's only verified by code review against `data.js:744-787`. 02-03 must address this — a stub `httpx.AsyncClient` mock returning 409 once then 200 is the cheapest test.

**Blockers:**
- None.

---
*Phase: 02-mcp-server, Plan: 01*
*Completed: 2026-05-08*
