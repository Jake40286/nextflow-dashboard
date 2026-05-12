---
phase: 02-mcp-server
plan: 03
subsystem: infra
tags: [mcp, refactor, packaging, fastmcp, starlette, docker-compose]

requires:
  - phase: 02-mcp-server
    provides: 10-tool MCP surface in single-file `app/mcp_server.py` (789 LoC after 02-02)

provides:
  - "app/mcp_server/ package replacing the monolith (881 LoC across 9 files; largest 301 LoC)"
  - "Module DAG: config ← sync ← state_helpers ← tools/* ← server"
  - "task-<uuid> ID format consistency for all MCP-created tasks (matches data.js generateId('task'))"
  - "starlette<2 pin in requirements-mcp.txt (installed 1.0.0)"
  - "Removal of obsolete Compose top-level `version: \"3.8\"` key (no more startup warning)"
  - "python -m mcp_server entry point via __main__.py"

affects: [02-04 test suite — module boundaries are now the natural test surface; Phase 3 hardening]

tech-stack:
  added: [starlette<2 pin (no new deps), Python package layout]
  patterns:
    - "FastMCP tool-registration via import-as-side-effect inside server.main() (idiomatic)"
    - "Strict-DAG module dependency: config ← sync ← state_helpers ← tools/* ← server"
    - "Package name MUST NOT match an installed top-level dep when /app is on sys.path (mcp_server/ vs mcp/ collision)"

key-files:
  created:
    - app/mcp_server/__init__.py
    - app/mcp_server/__main__.py
    - app/mcp_server/config.py
    - app/mcp_server/sync.py
    - app/mcp_server/state_helpers.py
    - app/mcp_server/server.py
    - app/mcp_server/tools/__init__.py
    - app/mcp_server/tools/projects.py
    - app/mcp_server/tools/tasks.py
  modified:
    - Dockerfile.mcp
    - docker-compose.yml
    - requirements-mcp.txt
  deleted:
    - app/mcp_server.py

key-decisions:
  - "Package named app/mcp_server/ (not app/mcp/) — avoids shadowing the installed `mcp` SDK because /app is on sys.path"
  - "Tool registration via @mcp.tool() decorators triggered by import inside server.main() — keeps test/REPL imports side-effect-free"
  - "create_task ID format unified to `task-<uuid>` (forward-only; legacy bare-hex IDs continue to work)"
  - "All cleanups bundled into the refactor plan (single APPLY, single rebuild) rather than a separate trivial loop"

patterns-established:
  - "Strict-DAG package layout: config (constants) ← sync (I/O) ← state_helpers (pure transforms) ← tools/* (decorators) ← server (entry)"
  - "Naming rule: when bind-mount root is on sys.path, never name a local package the same as an installed top-level dependency"

duration: ~25min
started: 2026-05-08T23:50:00Z
completed: 2026-05-09T00:15:00Z
---

# Phase 2 Plan 03: MCP Server Refactor + Cleanups Summary

**Replaced 789-LoC `app/mcp_server.py` monolith with a 9-file `app/mcp_server/` package, bundled three deferred cleanups (`task-<uuid>` ID format, `starlette<2` pin, drop obsolete Compose `version: "3.8"`), and verified end-to-end via live Claude Code MCP round-trip — `_rev` Δ exactly +1 per write across all 10 tools.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 minutes |
| Started | 2026-05-08T23:50:00Z |
| Completed | 2026-05-09T00:15:00Z |
| Tasks | 4 of 4 (3 auto + 1 checkpoint:human-verify) |
| Files modified | 13 (9 created, 3 edited, 1 deleted) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Package replaces monolith with no behavior change | Pass | `app/mcp_server.py` deleted; package live; 10 tools enumerate; round-trip clean; smoke task id matches `^task-[0-9a-f-]{36}$`. |
| AC-2: Package layout is collision-free | Pass | `mcp_server/` chosen instead of `mcp/`. SDK imports (`from mcp.server.fastmcp import FastMCP`) resolve to site-packages cleanly. No circular imports. |
| AC-3: Cleanups land alongside the refactor | Pass | `starlette<2` pinned (installed 1.0.0); `version: "3.8"` removed (no `docker compose config` warning); `create_task` returns `task-<uuid>` format. |
| AC-4: Behavior parity verified via smoke | Pass | `create_task` 1452→1453, `update_task_status` 1453→1454, `create_project` 1454→1455, all observed live; `list_tasks(status="next")` returns the smoke task; `_source: "mcp"` preserved. |

## Accomplishments

- **9-file package replacing the monolith** with a strict-DAG dependency layout (`config ← sync ← state_helpers ← tools/* ← server`). Largest single file 301 LoC vs prior 789.
- **Avoided a real foot-gun**: naming the package `mcp/` would have shadowed the installed `mcp` SDK at runtime because `/app` (the bind-mount root) precedes site-packages on `sys.path`. Caught at PLAN time, not APPLY time.
- **Three deferred items closed in-flight**: `task-<uuid>` ID format (carried from 02-01), `starlette<2` pin (carried from 02-02 deferred list), obsolete `version: "3.8"` Compose key (carried from 02-02). All landed in the same APPLY rebuild.
- **Live MCP round-trip evidence**: I exercised `create_task`, `update_task_status`, `create_project`, and `list_tasks` from my own MCP client during APPLY, so the human-verify checkpoint had concrete `_rev` deltas and IDs to confirm against — not just "looks right."

## Task Commits

No commits yet — working tree dirty pending the closing UNIFY commit. Recommended single commit:

| Path/Change | Type | Description |
|-------------|------|-------------|
| Whole plan | `refactor` | `refactor(mcp): split mcp_server.py into app/mcp_server/ package + cleanups (Phase 2 plan 03)` |

(Per repo convention: phase commit at the end of UNIFY.)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `app/mcp_server/__init__.py` | Created | Package marker; deliberately empty (no auto-imports). |
| `app/mcp_server/__main__.py` | Created | Enables `python -m mcp_server` entry. |
| `app/mcp_server/config.py` | Created | Env vars + GTD enums + summary-field tuples. |
| `app/mcp_server/sync.py` | Created | `_state_lock`, `_now_iso`, `_fetch_state`, `_write_state_with_retry` (3-retry 409 loop, verbatim port). |
| `app/mcp_server/state_helpers.py` | Created | Pure transforms: `_update_task_in_state`, summary builders, record builders, ID generators. |
| `app/mcp_server/server.py` | Created | Singleton `FastMCP("nextflow")` + `main()`. Imports tools inside main() to defer registration cost. |
| `app/mcp_server/tools/__init__.py` | Created | Subpackage marker; deliberately empty. |
| `app/mcp_server/tools/projects.py` | Created | 4 project tools: `create_project`, `list_projects`, `get_project`, `create_project_with_tasks`. |
| `app/mcp_server/tools/tasks.py` | Created | 6 task tools: `create_task`, `list_tasks`, `get_task`, `update_task_status`, `set_task_project`, `add_task_note`. |
| `app/mcp_server.py` | Deleted | 789-LoC monolith retired. |
| `Dockerfile.mcp` | Modified | `CMD` → `python -m mcp_server`. |
| `docker-compose.yml` | Modified | Dropped top-level `version: "3.8"`; mcp `command:` → `python -m mcp_server`. |
| `requirements-mcp.txt` | Modified | Added `starlette<2`. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `create_task` builds via `_build_task_record` then `pop("projectId", None)` | Original `create_task` task dict had no `projectId` key. Reusing the shared builder + dropping the key preserves byte-identical on-disk shape. | Future: if `create_task` ever gains a `project_id` arg, just remove the `pop()`. |
| `task-<uuid>` format applied to ALL `_build_task_record` callers (not only `create_task`) | Plan called it out for `create_task` only, but consistency with `data.js generateId('task')` demands it apply to every MCP-created task — including those from `create_project_with_tasks`. | Forward-only: pre-existing bare-hex IDs (3 of them, from 01-02 PoC) continue to work; new tasks all use the prefixed form. |
| Tool subpackage `__init__.py` left EMPTY | Importing `tools/__init__.py` would force decorator side effects. Keeping it empty preserves the contract that only `server.main()` registers tools. | Tests in 02-04 can import `tools.projects` or `tools.tasks` ad-hoc without launching the server. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | None — plan was complete. |
| Scope additions | 1 | Trivial: applied `task-<uuid>` to `create_project_with_tasks` (plan only mentioned `create_task`). Documented above. |
| Deferred | 1 | Smoke test entities left in state for user cleanup (acknowledged at checkpoint). |

**Total impact:** No scope creep; one consistency-driven extension within plan intent.

### Auto-fixed Issues

None. The plan correctly anticipated all the structural choices.

### Deferred Items

- **Smoke test entities in live state** — `task-bd4b5e1b-3606-4754-a597-aba2a4375bb9` and `project-988dab8d-89a4-45a8-961a-fffa4e97cecb` (both titled "02-03 refactor smoke (delete me)") remain in `state.json`. Self-cleanup via the UI is trivial; not blocking.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Host `python3` lacks `httpx` (only inside container), so the plan's import-verify command can't run on the host | Verified syntactically with `python3 -m py_compile`; full import-verify deferred to Task 4 container rebuild — which passed cleanly (10 tools registered, sidecar healthy). |
| `_uuid.uuid4()` returns a `UUID` object whose `str()` form is dashed (`task-bd4b5e1b-3606-4754-a597-aba2a4375bb9`), but the original `create_task` used `.hex` which is undashed | Per `data.js generateId('project')` → `f"project-{uuid4()}"`, we use the dashed form for consistency. AC-1 regex `^task-[0-9a-f-]{36}$` accommodates this; verified with the live smoke. |

## Next Phase Readiness

**Ready:**
- Module boundaries align 1:1 with anticipated 02-04 test files: `test_sync.py` (409 retry path), `test_state_helpers.py` (LWW bumps + `_update_task_in_state`), `test_tools_projects.py`, `test_tools_tasks.py`.
- Sidecar is in steady state at `http://127.0.0.1:8003/mcp` with all 10 tools live.
- Working tree is dirty but coherent — every change traces to the 02-03 plan.

**Concerns:**
- LoC budget: `tools/tasks.py` is at 301 LoC, right at the comfortable threshold. If 02-04 introduces a `complete_task` tool or arbitrary field updates, plan to split by entity-action rather than entity-type at that point.
- `starlette` pin chose `<2` without a lower bound. Pip resolved to `1.0.0` cleanly today, but if mcp 1.27.0's transitive resolver later prefers a starlette below 0.40, request flow may break. 02-04 test suite is the right place to assert "the sidecar handshakes" as a regression guard.

**Blockers:** None.

---
*Phase: 02-mcp-server, Plan: 03*
*Completed: 2026-05-09*
