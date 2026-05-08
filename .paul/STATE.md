# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-07)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.1 MCP Integration — Phase 1 COMPLETE. Walking-skeleton MCP sidecar shipped and smoke-tested end-to-end. Ready for Phase 2 (Full Tool Surface).

## Current Position

Milestone: v1.1 MCP Integration
Phase: 2 of 3 — MCP Server / Full Tool Surface (2 of 3 plans closed; 02-03 ahead)
Plan: 02-02 closed — SUMMARY published at `.paul/phases/02-mcp-server/02-02-SUMMARY.md`.
Status: Loop closed; ready for 02-03 PLAN.
Last activity: 2026-05-08 — UNIFY complete for 02-02. `app/mcp_server.py` 494 → 789 LoC; 5 new task-entity tools shipped (total 10). Per-group LWW timestamp pattern established for MCP-side mutations.

Progress:
- Milestone: [█████░░░░░] 55% (Phase 1 shipped; Phase 2: 02-01 + 02-02 closed; 02-03 ahead)
- Phase 1: [██████████] 100%
- Phase 2: [██████░░░░] 67% — 02-01 closed, 02-02 closed, 02-03 ahead (tests + cleanup + likely refactor)
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
Phase 1 (CLOSED — published):
  01-01, 01-02:      [✓✓ closed]

Phase 2 (active):
  02-01:             [✓ closed — projects + atomic decomposition published]
  02-02:             [✓ closed — task entity tools published]
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

### Decisions (v1.1-specific — locked in 02-02)

- **Per-group LWW timestamp bumps are required for any MCP-side write of a tracked field.** When mutating a field listed in `MERGE_FIELD_GROUPS` (data.js:32-39 — `status`, `myDayDate`, `calendarDate`, `calendarTime`, `dueDate`, `followUpDate`, `urgent`, `urgentSince`, `prerequisiteTaskIds`), also write `task._fieldTimestamps[<group>] = _now_iso()` in the same mutation. Without this, a stale browser PUT can silently overwrite the MCP-side change at merge time. Codified in `update_task_status`'s `_set_status` mutator; applies to every future tool that touches a tracked field.
- **`projectId` is whole-task LWW, not field-group LWW.** `set_task_project` only bumps `task.updatedAt`. Confirmed via direct read of MERGE_FIELD_GROUPS — `projectId` is intentionally not tracked at field-group granularity.
- **Single-task mutations route through `_update_task_in_state(state, task_id, mutator)`.** The helper centralizes find-by-id + apply-mutator + bump-updatedAt + rebuild-tasks-list. New single-task tools should reuse it.
- **`mcp_server.py` refactor to `app/mcp/` package is now the recommended call for 02-03.** File grew 494 → 789 LoC after 02-02 (60% larger; past the comfortable monolith threshold). 02-03 plan will weigh tests-first vs refactor-first up front.
- **Note `_source: 'mcp'` is a transient audit field.** Survives initial MCP PUT; dropped by JS `normalizeTaskNotes` (data.js:4514-4543) on the next browser-side normalize pass. Kept per AC-5; flagged as a Phase 3 candidate to either preserve in JS or remove from MCP writes.

### Decisions (v1.1-specific — still to be made)

- _02-03 will decide: test surface (especially 409 retry path + per-group LWW correctness), whether to refactor `mcp_server.py` into `app/mcp/` package up front, `create_task` ID format consistency (`task-<uuid>` vs bare hex), pin `starlette<2`, drop obsolete `version: "3.8"` from `docker-compose.yml`._
- _Phase 3 will finalize: bearer-token auth + LAN-bind, rate-limit / batch-cap policies, audit-trail UI shape, complete-task tool over `completionLog`, edit-note / delete-note tools, arbitrary task-field updates (title/description/dueDate/contexts/peopleTags), note `_source` durability decision, canonical "do not expose to internet" doc copy._

### Deferred Issues

- 2026-05-08: **Note `_source: 'mcp'` durability** — `normalizeTaskNotes` (data.js:4514-4543) drops `_source` on browser-side normalize. Phase 3 candidate: extend the JS normalizer to preserve it OR remove `_source` from MCP-written notes. Discovered in 02-02 Task 3.
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
Stopped at: 02-02 closed (UNIFY done; SUMMARY published). Phase 2 progress: 2 of 3 plans closed.
Next action: `/paul:plan` for 02-03 (tests + cleanup + likely refactor of `mcp_server.py`).
Resume context:
- Branch: `main` — working tree dirty: `app/mcp_server.py` (+295 LoC), `.paul/STATE.md`, `.paul/paul.json`, `.paul/ROADMAP.md`, plus new `.paul/phases/02-mcp-server/02-02-PLAN.md` and `02-02-SUMMARY.md`. **Recommended commit:** `feat(mcp): task entity tools — list/get/update_status/set_project/add_note (Phase 2 plan 02)`.
- Stack state: **10 MCP tools** registered. Project tools (5): `create_project`, `list_projects`, `get_project`, `create_project_with_tasks`, plus `create_task` from 01-02. Task tools (5, NEW in 02-02): `list_tasks`, `get_task`, `update_task_status`, `set_task_project`, `add_task_note`. Sidecar healthy at http://127.0.0.1:8003/mcp; bind is loopback-only per Phase 1 PoC decision (Claude Desktop on the LAN must SSH-tunnel until Phase 3 ships the bearer token + LAN-bind).
- 02-03 scope (next plan): **(1)** test suite — at minimum 409 retry path, per-group LWW status-bump correctness, append-only note semantics. **(2)** Refactor `mcp_server.py` (789 LoC) into `app/mcp/` package — recommended in 02-02 SUMMARY; needs explicit 02-03 plan call. **(3)** `create_task` ID format consistency (currently bare uuid hex; should be `task-<uuid>` to match `data.js generateId('task')`). **(4)** Pin `starlette<2` in `requirements-mcp.txt`. **(5)** Drop obsolete `version: "3.8"` from `docker-compose.yml` (warning fires on every compose run).
- Carried-forward deferreds: synthetic `projectActivityLog` row for MCP-created entities; areaOfFocus/themeTag validation against `state.settings.areaOptions`; complete-task flow over `completionLog` (Phase 3); arbitrary field updates beyond status/project/notes (Phase 3); note `_source` durability (Phase 3).

---
*STATE.md — Updated after every significant action*
