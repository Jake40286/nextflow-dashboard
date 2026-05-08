---
phase: 01-mcp-feasibility
plan: 02
subsystem: mcp/sidecar
tags: [mcp, mcp-sdk, fastmcp, docker-compose, sidecar, optimistic-locking, walking-skeleton]

requires:
  - phase: 01-mcp-feasibility
    provides: DECISIONS.md (SDK choice, sidecar shape, sync path, auth posture, GO verdict)
provides:
  - Working MCP sidecar in docker-compose stack
  - One tool exposed end-to-end: `create_task(title, status="inbox")`
  - Ported 409-retry loop matching JS client's flushRemoteQueue pattern
  - Localhost-only port binding (127.0.0.1:8003) — Phase 1 auth posture
  - Proof that minimal task shape is sufficient — JS merge logic fills missing fields
affects: 02-01 (Phase 2 full tool surface — can build on this scaffold), 03-01 (Phase 3 hardening — will add auth/audit on top)

tech-stack:
  added:
    - mcp==1.27.0 (Python MCP SDK; first hard Python dep in project; sidecar-scoped)
    - httpx>=0.27,<0.29 (already a transitive dep of mcp; pinned for direct use)
  patterns:
    - "Sidecar Pattern: separate Dockerfile.mcp + requirements-mcp.txt + compose service block. Main app's Dockerfile/requirements unchanged."
    - "Localhost-only port mapping via `127.0.0.1:<host>:<container>` syntax — container listens on 0.0.0.0 (docker convention) but only loopback routes to it"
    - "MCP tool functions return Python dicts; httpx.AsyncClient performs GET-PUT-with-retry under a single asyncio.Lock"
    - "Minimal task shape (11 fields) is sufficient — JS data.js merge logic on next browser sync extends to full 30-field shape automatically"

key-files:
  created:
    - Dockerfile.mcp (6 lines)
    - requirements-mcp.txt (2 lines)
    - app/mcp_server.py (~140 lines)
    - .paul/phases/01-mcp-feasibility/01-02-PLAN.md
    - .paul/phases/01-mcp-feasibility/01-02-SUMMARY.md
  modified:
    - docker-compose.yml (+18 lines — appended `mcp:` block; `web:` block byte-for-byte unchanged)

key-decisions:
  - "Use FastMCP (mcp.server.fastmcp) instead of low-level mcp.server.Server — high-level decorator API is the SDK's recommended path for streamable-HTTP and worked first try"
  - "Endpoint path is `/mcp` (FastMCP default) — confirmed via curl probe before user smoke test"
  - "Minimal task shape on creation; let JS merge fill defaults — eliminates need for shared GTD constants between Python and JS in Phase 2 (potentially)"
  - "Image size 173MB — acceptable for a sidecar; Phase 3 may shrink with `python:3.11-alpine` if needed but not blocking"

patterns-established:
  - "Future MCP tools: register via `@mcp.tool()` decorator; reuse `_write_state_with_retry(mutate_fn)` helper for any state mutation; ALWAYS strip `_rev` and completion-collection fields from PUT body"
  - "Concern-flagging convention: when implementation has plausible runtime risks unverifiable at code-review time, report DONE_WITH_CONCERNS with a numbered list — qualify retires each by name"

duration: ~30min
started: 2026-05-08T17:00:00Z
completed: 2026-05-08T17:30:00Z
---

# Phase 1 Plan 02: Walking-Skeleton MCP Sidecar — Summary

**Working MCP sidecar shipped in the docker-compose stack: one tool (`create_task`), 173MB image, localhost-only bind, 409-retry loop verbatim from `flushRemoteQueue`. Proven end-to-end with a real task creation by Claude Code itself (id `b572e53a1edc42e3ade95a17a86a1cff`, `_source: "mcp"`).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 minutes |
| Started | 2026-05-08T17:00:00Z |
| Completed | 2026-05-08T17:30:00Z |
| Tasks | 2 auto + 1 human-verify checkpoint, all complete |
| Files created | 5 (3 source + 2 PAUL artifacts) |
| Files modified | 1 (docker-compose.yml) |
| Image size | 173MB (`python:3.11-slim` base + `mcp` SDK + transitive deps) |
| Transitive deps installed | 29 (vs DECISIONS.md prediction of ~10) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Both containers come up cleanly | Pass | `docker compose up --build -d` brought both services up; mcp logs show banner + uvicorn listening on `0.0.0.0:8001` + StreamableHTTP session manager started; no Python tracebacks. `web` was already running and didn't restart. |
| AC-2: `create_task` tool is discoverable from an MCP client | Pass | User registered the sidecar with Claude Code via `claude mcp add nextflow --transport http http://127.0.0.1:8003/mcp`. The deferred-tool list showed `mcp__nextflow__create_task` with the documented schema (`title` required string, `status` optional default `"inbox"`). |
| AC-3: Calling `create_task` creates a real task end-to-end | Pass | Tool call returned `{"id": "b572e53a1edc42e3ade95a17a86a1cff", "_rev": 1428}`. State on disk shows the task with `_source: "mcp"`, `status: "inbox"`, ISO timestamps. JS merge logic on next browser sync extended the 11-field MCP shape to a 30-field full task by adding defaults (slug, originDevice, peopleTag, effortLevel, etc.) — proves minimal task shape is sufficient. |
| AC-4: Sidecar is localhost-only by default | Pass | `docker compose ps` shows `127.0.0.1:8003->8001/tcp`. `docker compose config` resolves to `host_ip: 127.0.0.1`. Container listens on `0.0.0.0:8001` per docker convention but only loopback routes to it; LAN hosts cannot reach it. |

## Accomplishments

- **Walking-skeleton MCP sidecar fully operational.** Real LLM (Claude Code) creates real tasks in real nextflow over real HTTP, with the optimistic-locking contract intact.
- **Proof that the minimal task shape is sufficient.** This is the most consequential discovery of 01-02: an 11-field MCP-created task is automatically extended to a 30-field full task by `data.js`'s existing merge logic on the next browser sync. Phase 2's tool-schema design can stay lean — no need to mirror the entire GTD field surface in the MCP server.
- **Zero changes to the main app.** `app/server.py`, `app/web_ui/**`, `tests/**`, the `web:` service block — all untouched. Boundaries held perfectly. Live browsers continued autosyncing throughout the 01-02 session.
- **GO verdict from 01-01 fully validated by working code.** No re-scoping needed; Phase 2 is unblocked.

## Task Commits

No git commits made yet. Per the convention established in 01-01-SUMMARY ("commit at phase boundaries via /paul:transition-phase"), Phase 1 will commit as a single `feat(mcp-feasibility):` commit covering both 01-01 (DECISIONS + PLAN + SUMMARY) and 01-02 (PoC code + PAUL artifacts) when phase-transition runs.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Sidecar scaffolding | (deferred to phase commit) | feat | Dockerfile.mcp + requirements-mcp.txt + docker-compose.yml `mcp:` block |
| Task 2: mcp_server.py | (deferred to phase commit) | feat | FastMCP-based server, `create_task` tool, 409-retry loop |
| Task 3: Smoke-test checkpoint | n/a | n/a | User-verification only |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `Dockerfile.mcp` | Created (6 lines) | Build image for the `mcp` sidecar service — `python:3.11-slim` + `pip install -r requirements-mcp.txt` |
| `requirements-mcp.txt` | Created (2 lines) | Sidecar-scoped Python deps. Pins `mcp==1.27.0` and `httpx>=0.27,<0.29`. Main app's deps unchanged. |
| `app/mcp_server.py` | Created (~140 lines) | FastMCP server. Registers `create_task` tool. Implements `_write_state_with_retry(mutate_fn)` helper that ports `flushRemoteQueue`'s 3-retry 409 pattern. Single `asyncio.Lock` serializes concurrent tool calls within the process. |
| `docker-compose.yml` | Modified (+18 lines) | Appended `mcp:` service block. Localhost-only port mapping `127.0.0.1:8003:8001`. `web:` block byte-for-byte unchanged (verified via `git diff`). |
| `.paul/phases/01-mcp-feasibility/01-02-PLAN.md` | Created (during PLAN) | The plan being unified. |
| `.paul/phases/01-mcp-feasibility/01-02-SUMMARY.md` | Created (this file) | Plan completion record. |
| `.paul/STATE.md` | Modified | Loop position, decisions migration, session continuity. |
| `.paul/ROADMAP.md` | Modified | Phase 1 plans table → both plans complete. |
| `.paul/paul.json` | Modified | phase.status: in_progress → complete. |
| `.paul/PROJECT.md` | Modified (during transition) | Phase 1 shipped → Validated section. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use `mcp.server.fastmcp.FastMCP` (high-level API) instead of low-level `mcp.server.Server` | First-try success in 1.27.0; decorator API mirrors what most published MCP server examples use; less plumbing for the same outcome | Phase 2 inherits this choice — all future tools register via `@mcp.tool()` |
| Endpoint at `/mcp` (FastMCP default), not `/` | FastMCP exposes streamable-http at `/mcp` mount by convention; verified via `curl` probe before smoke test | User MCP clients use `http://127.0.0.1:8003/mcp` URLs going forward |
| Keep MCP-created task shape minimal (11 fields) | JS `data.js` merge logic gracefully extends missing fields with defaults — proven in smoke test (11 → 30 fields after browser sync) | Phase 2 tool schemas can stay lean; no need to mirror the full GTD field surface in Python — but Phase 2 should still expose the *useful* fields (status, contexts, areaOfFocus, peopleTags, effortLevel, timeRequired) for LLM control |
| Print banner to stdout (not stderr) on startup | Easier to grep in `docker compose logs mcp`; matches main `web` service's banner pattern | Future ops debugging is easier |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | n/a |
| Scope additions | 0 | n/a |
| Concerns flagged + retired | 3 | All resolved before checkpoint; documented for Phase 2 reference |
| Footprint estimate drift | 1 | DECISIONS.md said ~10 deps; actual is 29. Image is 173MB anyway. Worth noting; not blocking. |

**Total impact:** Plan executed almost exactly as written. The 3 concerns flagged in Task 2's `DONE_WITH_CONCERNS` status (FastMCP settings API, endpoint path, task-shape compatibility) were all resolved within the qualify step or the smoke test. Net deviation from plan: zero.

### Concerns flagged + retired

**1. FastMCP `mcp.settings.host`/`port` API uncertainty**
- Flagged during Task 2 EXECUTE — wasn't certain the attribute path was correct in 1.27.0.
- Retired by: live container startup. Banner appeared with the configured host/port; no `AttributeError`.

**2. Endpoint path uncertainty**
- Flagged because FastMCP could expose streamable-http at `/`, `/mcp`, or `/sse` depending on configuration.
- Retired by: `curl` probes (`/mcp` returned 406 — "endpoint exists, wrong content type"; `/mcp/` returned 307; `/` returned 404). Confirmed `/mcp` is the canonical mount.

**3. Minimal task shape compatibility with browser merge**
- Flagged because data.js's mergeTask has subtle field-completion logic and an MCP-created task missing fields might be silently dropped.
- Retired by: smoke-test create + disk inspection. Task survived with all defaults filled by JS merge. Field count went 11 (Python) → 30 (post-merge).

### Footprint estimate drift

DECISIONS.md predicted ~10 transitive deps from the `mcp` SDK. Actual is 29:
```
annotated-types, anyio, attrs, certifi, cffi, click, cryptography, h11, httpcore,
httpx, httpx-sse, idna, jsonschema, jsonschema-specifications, mcp, pycparser,
pydantic, pydantic-core, pydantic-settings, pyjwt, python-dotenv,
python-multipart, referencing, rpds-py, sse-starlette, starlette, typing-extensions,
typing-inspection, uvicorn
```

The estimate was too tight. Pydantic v2 brings 4 packages alone; cryptography brings cffi+pycparser. Image size (173MB) is still reasonable; the drift doesn't change the GO verdict.

### Deferred Items

- **Optional 409-stress check (browser-edit-during-tool-call) was not exercised in this session.** The basic happy-path PUT succeeded first try. The retry loop is in place by code review, but live verification of the 3-retry behavior is deferred. Phase 2 should add an automated test that simulates a 409 (e.g., spin up a mock server that returns 409 once then 200 on retry) — this is the cheapest way to lock the retry behavior under regression.
- **`requirements-mcp.txt` does not pin `starlette<2`.** The SDK pulled in `starlette-1.0.0` which is a fresh major release. A breaking change in 1.x → 2.x could surface during a future `docker compose build mcp`. Add a `starlette<2` constraint when convenient. Not urgent.
- **`docker-compose.yml` still has the obsolete `version: "3.8"` declaration.** Pre-existing from v1.0. Causes a warning on every `docker compose` invocation. Drive-by removal in a future cleanup; not in 01-02's scope.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 2 (Full Tool Surface) is fully unblocked. The walking skeleton is proven; the patterns to extend are established (`@mcp.tool()` decorators, `_write_state_with_retry` helper, minimal task shape OK).
- The MCP sidecar is currently running in the user's local docker stack and is reachable from Claude Code via the registered `nextflow` MCP server. Phase 2's first plan can iterate on it live.
- DECISIONS.md remains the architectural anchor — Phase 2 inherits all locked decisions (HTTP-only docker network access, optimistic locking, no completion fields in PUT body, etc.).

**Concerns:**
- **Dependency footprint conversation.** 29 packages is large for "vanilla Python preferred" projects. The user knows this is sidecar-scoped, but if Phase 2 considers absorbing the MCP server back into the main `web` process, the deps would land on the main service. Recommend: keep the sidecar architecture for Phase 2; revisit only if perf/ops concerns surface.
- **No automated tests cover the MCP server.** All verification today was manual + smoke. Phase 2 should add tests for: `_write_state_with_retry` 409 handling, tool schema validation, task-creation happy path. Recommend: a new `tests/mcp_*.py` module using a stub `httpx.AsyncClient` (no live server needed).

**Blockers:**
- None.

---
*Phase: 01-mcp-feasibility, Plan: 02*
*Completed: 2026-05-08*
