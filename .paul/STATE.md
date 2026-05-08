# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-07)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.1 MCP Integration — Phase 1 COMPLETE. Walking-skeleton MCP sidecar shipped and smoke-tested end-to-end. Ready for Phase 2 (Full Tool Surface).

## Current Position

Milestone: v1.1 MCP Integration
Phase: 1 of 3 — Complete; Phase 2 next (MCP Server — Full Tool Surface)
Plan: All Phase 1 plans closed; ready to plan 02-01
Status: Phase 1 COMPLETE. Awaiting decision on commit + branch strategy, then `/paul:plan` for Phase 2.
Last activity: 2026-05-08 — UNIFY complete on 01-02. Phase 1 closed; ROADMAP + PROJECT.md + paul.json synced.

Progress:
- Milestone: [███░░░░░░░] 33% (1 of 3 phases shipped)
- Phase 1: [██████████] 100% — both plans shipped
- Phase 2: [░░░░░░░░░░] 0% — ready to plan
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
Phase 1 (CLOSED):
  01-01 (research):  PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed — verdict GO]
  01-02 (PoC):       PLAN ──▶ APPLY ──▶ UNIFY    [✓ closed — sidecar live]

═════════════════════════════════════════════════════════════
PHASE 1 COMPLETE — 2026-05-08
═════════════════════════════════════════════════════════════

Phase 2 (next):
  02-01:             not yet planned
```

## Accumulated Context

### Decisions (carried forward from v1.0 — still active)

- **Optimistic locking is the only write path.** All state mutations route through `PUT /state` with `If-Match: <rev>`. The MCP server, like every other client, must respect this. This is the single largest architectural constraint on v1.1.
- **No new persistence machinery in v1.1.** MCP-created entities use existing task/project fields (`_fieldTimestamps`, `_tombstones`, `peopleTags`, `contexts`, etc.). LLM-author tagging is at most one new field (e.g. `_source: "mcp"`).
- **Self-hosted ethos preserved** — sidecar in same compose stack, LAN-accessible only by default, no cloud dependency.
- **GTD field semantics are subtle** — `status`, `contexts`, `areaOfFocus`, `peopleTags`, `effortLevel`, `timeRequired` need rich `description` strings on MCP tool schemas, otherwise LLM-generated tasks will be structurally valid but semantically off.
- **ES-module scope trap** (carried from v1.0 Phase 6): when `panels/<name>.js` modules need a helper from `ui.js`, IMPORT it (or duplicate the pure body locally) — never reference `ui.js`'s top-level functions as free identifiers. The `Object.assign(UIController.prototype, ...)` mixin pattern makes methods callable on the controller but does NOT bridge ES module scope.
- **JS file restructure is adjacent, not committed.** `ui.js` and `data.js` are long; if Phase 1 surfaces a clean alignment with MCP tool schemas (e.g., shared GTD constants), escalate. Otherwise leave structure alone.

### Decisions (v1.1-specific — locked in 01-01)

- **MCP SDK: official `mcp` Python SDK v1.27.0** (MIT, ~10 transitive deps incl. starlette/uvicorn/pydantic v2). Pinned in a new sidecar-scoped `requirements.txt`. The first hard Python dependency in the project.
- **Sidecar shape: HTTP-only docker-network access; NO `./data` bind-mount.** New `mcp` service in `docker-compose.yml`, port 8003 host / 8001 container, talks to `web` via `http://web:8000` on the docker bridge network.
- **Sync path: direct port of `flushRemoteQueue`'s 3-retry loop** (`data.js:744-787`). Full-state PUT body (no deltas), `If-Match: <_rev>` header, on 409 re-apply mutation to server-state body and retry, cap 3.
- **Phase 1 PoC auth: localhost-only bind, no token.** Feasibility gate, not deploy.
- **Phase 3 production auth: bearer token + LAN-bind**, `MCP_AUTH_TOKEN` in `.env`. Internet exposure stays out of scope; Phase 3 ships a "do not expose without TLS reverse proxy" warning in README + in-app docs.

### Decisions (v1.1-specific — still to be made)

- _Phase 2 will design: full tool surface (`create_task`, `create_project`, `create_project_with_tasks`, list/get/update tools), GTD-field-aware schema descriptions, LLM-author tagging field name (`_source: "mcp"` is the working assumption)._
- _Phase 3 will finalize: rate-limit / batch-cap policies, audit-trail UI shape, and the canonical "do not expose to internet" doc copy._

### Deferred Issues

- 2026-05-08: Feedback panel removal (in-app `/feedback` superseded by GitHub Issues #28–#73) — eligible to bolt on as a final phase if v1.1 finishes early; otherwise its own future milestone.
- v1.0 Process-session auto-flyout case (`0bf1bf88`): when batch-clarifying, the project flyout is not opened after convert routing to avoid conflict with the next queued task. Leave as-is unless it surfaces during v1.1.
- v1.0 deferreds remaining in ROADMAP "Deferred (Someday)": `64227659` (guided tour), `a87a75af` (pop-out doing timers), `1f7139ee` (Backlog "resolve all"), `bb343993` (Apply Backlog UX elements), `483a286b` (rename "Move to waiting" + delegate-to-person), `8daaf79a` (complete-with-options + chaining + graph view), plus the original Someday list (`943c01b8` mobile, `346ac587` multi-user, `fc822ad6` trash bin, `3ad1d3e3` snooze, `00b83571` shopping list, `5953b8c8` email digests, `21377c43` chaining).

### Blockers/Concerns

None at milestone creation. Phase 1 may surface an MCP-Python feasibility blocker; if so, the milestone re-scopes per its exit-criterion design.

### Git State

- Branch: `main` (in sync with origin/main as of 2026-05-08).
- Working tree: clean.
- v1.0 fully merged and pushed; closing commit `05d1fb1`.
- Most recent commits (2026-05-08): `927e5ed` (README un-archive) and `2f33ffa` (post-v1.0 bookkeeping + Next→Pending pill rename).

## Session Continuity

Last session: 2026-05-08
Stopped at: Phase 1 closed (both plans shipped). MCP sidecar live in docker stack, registered with Claude Code, smoke-tested. Phase 1's work is uncommitted on `main`.
Next action: Decide commit strategy (single phase commit on main vs. feature branch + merge), then `/paul:plan` for 02-01.
Resume context:
- Branch: `main` (currently dirty with all Phase 1 work — DECISIONS, both PLANs, both SUMMARIES, Dockerfile.mcp, requirements-mcp.txt, app/mcp_server.py, docker-compose.yml)
- Stack state: `nextflow-web-1` and `nextflow-mcp-1` both running. MCP sidecar reachable at http://127.0.0.1:8003/mcp; `claude mcp add nextflow ...` already done.
- npm test baseline: 179/179 passing (no test-relevant code changes in Phase 1; main app unchanged)
- Smoke-test artifact: task `b572e53a1edc42e3ade95a17a86a1cff` titled "PAUL 01-02 smoke test — sidecar walking skeleton" is in user's inbox with `_source: "mcp"`. Safe to delete via UI; was a marker only.
- **Phase 2 scope (not yet planned):** full tool surface — add `create_project`, `create_project_with_tasks` (atomic decomposition), `list_tasks`, `list_projects`, `get_task`, `get_project`, `update_task_status`, `set_task_project`. Rich GTD-aware schema descriptions for status/contexts/areaOfFocus/peopleTags/effortLevel/timeRequired. 409-retry already done in 01-02; just register more `@mcp.tool()` functions.
- **Deferred to Phase 2 from 01-02:** add automated tests for the MCP server (especially the 409 retry path); pin `starlette<2` in requirements-mcp.txt; consider drive-by removal of the obsolete `version: "3.8"` declaration in docker-compose.yml.

---
*STATE.md — Updated after every significant action*
