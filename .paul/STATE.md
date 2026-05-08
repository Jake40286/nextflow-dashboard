# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-07)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.1 MCP Integration — Phase 1 COMPLETE. Walking-skeleton MCP sidecar shipped and smoke-tested end-to-end. Ready for Phase 2 (Full Tool Surface).

## Current Position

Milestone: v1.1 MCP Integration
Phase: 2 of 3 — MCP Server / Full Tool Surface (in progress; 02-01 closed, 02-02 + 02-03 ahead)
Plan: 02-01 closed (Project entity + flagship atomic decomposition shipped); 02-02 ready to plan
Status: Loop closed for 02-01. Awaiting commit decision, then `/paul:plan` for 02-02 (task-side tools).
Last activity: 2026-05-08 — UNIFY complete on 02-01. Atomicity proven (`_rev` Δ = +1 for project + 3 tasks).

Progress:
- Milestone: [████░░░░░░] 40% (Phase 1 shipped; Phase 2 plan 1 of 3 closed)
- Phase 1: [██████████] 100%
- Phase 2: [████░░░░░░] 33% — 02-01 closed; 02-02 + 02-03 ahead
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
Phase 1 (CLOSED — merged to main, pushed to origin):
  01-01:             [✓ closed]
  01-02:             [✓ closed]

Phase 2 (active):
  02-01:             PLAN ──▶ APPLY ──▶ UNIFY
                       ✓        ✓        ✓     [Closed — flagship atomic decomposition shipped]
  02-02:             not yet planned (task-side tools)
  02-03:             not yet planned (tests + cleanup + likely refactor)
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

- **MCP SDK: official `mcp` Python SDK v1.27.0** (MIT). Sidecar-scoped `requirements-mcp.txt`. (Actual deps: 29 packages, not the ~10 estimated.)
- **Sidecar shape: HTTP-only docker-network access; NO `./data` bind-mount.** Port 8003 host / 8001 container; talks to `web` via `http://web:8000`.
- **Sync path: direct port of `flushRemoteQueue`'s 3-retry loop** (`data.js:744-787`). Full-state PUT, `If-Match: <_rev>`, 409 re-apply + retry, cap 3.
- **Phase 1 PoC auth: localhost-only bind, no token.**
- **Phase 3 production auth: bearer token + LAN-bind**, `MCP_AUTH_TOKEN` in `.env`. Internet exposure stays out of scope; Phase 3 ships a "do not expose without TLS reverse proxy" warning in docs.

### Decisions (v1.1-specific — locked in 02-01)

- **Field-name fidelity to JS source.** When MCP tools mutate nextflow entities, READ data.js's create/normalize functions FIRST, then mirror the field names exactly. No mapping layer between LLM-facing parameters and on-disk fields. (Caught 3 Spec drifts in 02-01: `title→name`, `theme→themeTag`, `status→statusTag`.)
- **Project IDs use `project-<uuid>` format** matching `data.js:generateId("project")`. Tasks created in 01-02 used bare uuid hex; consistency cleanup deferred to 02-03.
- **Atomicity guarantee testable via `_rev` Δ.** Every multi-entity write tool MUST include an AC that captures `_rev` before/after and asserts `_rev_after == _rev_before + 1`. Any other delta means the implementation is doing N writes internally — a bug.
- **Read tools don't acquire `_state_lock`.** The lock is for write serialization only; concurrent reads are safe. `_fetch_state` is called directly.
- **Atomic decomposition cap: 50 tasks** (hardcoded). Phase 3 will refine to configurable + rate-limit + dry-run.
- **`mcp_server.py` stays monolithic for now.** 494 LoC after 02-01; refactor to `app/mcp/` package becomes a stronger candidate in 02-03 once 02-02 adds task-side tools (projected ~700+ LoC).

### Decisions (v1.1-specific — still to be made)

- _Phase 2 will still design: task-entity tool schemas, behavior of `add_task_note`, whether to emit synthetic `projectActivityLog` rows for MCP-created entities._
- _Phase 3 will finalize: rate-limit / batch-cap policies, audit-trail UI shape, canonical "do not expose to internet" doc copy._

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
Stopped at: 02-01 closed (PLAN ✓ APPLY ✓ UNIFY ✓). 4 new MCP tools live; flagship atomic decomposition proven correct. Phase 2 work uncommitted on main.
Next action: Decide commit strategy for 02-01 (likely: feature branch + merge, mirror Phase 1 pattern), then `/paul:plan` for 02-02 (task-side tools).
Resume context:
- Branch: `main` (currently dirty with 02-01 work)
- Stack state: `nextflow-mcp-1` running; 5 tools registered with Claude Code: `create_task` + `create_project` + `list_projects` + `get_project` + `create_project_with_tasks`.
- Smoke-test artifact in user data: `project-c7fd2fac-...` "PAUL 02-01 atomicity test" + 3 tasks ("Atomicity check task A/B/C"). Safe to delete via UI.
- `app/mcp_server.py`: 494 LoC. Refactor candidate but not blocking; will revisit in 02-03.
- **02-02 scope (next plan):** Task-entity vertical slice — `list_tasks`, `get_task`, `update_task_status`, `set_task_project`, `add_task_note`. Mirror 02-01's pattern: read data.js task-handling functions FIRST, mirror field names verbatim.
- **02-03 scope:** tests (especially 409 retry path), pin `starlette<2`, remove obsolete `version: "3.8"` from compose, possibly fix `create_task` ID format to `task-<uuid>` for consistency, refactor `mcp_server.py` if file size justifies.
- Carried-forward deferreds: synthetic `projectActivityLog` row for MCP-created projects; `areaOfFocus`/`themeTag` validation against `state.settings.areaOptions`.

---
*STATE.md — Updated after every significant action*
