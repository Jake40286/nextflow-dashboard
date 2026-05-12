# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-05-07)

**Core value:** Users can track tasks, projects, and calendar events across any browser on their network — self-hosted, zero cloud dependency, real-time sync.
**Current focus:** v1.1 MCP Integration — Phase 2 plan 04 PLAN created (Python test suite, pytest + pytest-httpx; hybrid mock-`web` for unit tests + opt-in live integration test). Awaiting APPLY approval.

## Current Position

Milestone: v1.1 MCP Integration
Phase: 2 of 3 — MCP Server / Full Tool Surface (Planning 02-04)
Plan: 02-04 created at `.paul/phases/02-mcp-server/02-04-PLAN.md`, awaiting approval.
Status: PLAN created, ready for APPLY.
Last activity: 2026-05-09 — Created 02-04 PLAN. Standard track, 3 tasks: (1) scaffold pytest harness + sync.py wire-contract tests, (2) state_helpers + tools unit tests locking in codified invariants, (3) opt-in live integration test against docker compose. New dev-only `requirements-mcp-dev.txt` (pytest, pytest-asyncio, pytest-httpx); production image and `requirements-mcp.txt` untouched.

Progress:
- Milestone: [██████░░░░] 60% (Phase 1 shipped; Phase 2: 3 of 4 plans closed; 02-04 ahead)
- Phase 1: [██████████] 100%
- Phase 2: [████████░░] 75% — 02-01 closed, 02-02 closed, 02-03 closed, 02-04 ahead (Python test suite)
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
Phase 1 (CLOSED — published):
  01-01, 01-02:      [✓✓ closed]

Phase 2 (active):
  02-01:             [✓ closed — projects + atomic decomposition published]
  02-02:             [✓ closed — task entity tools published]
  02-03:             [✓ closed — refactor + cleanups published]
  02-04:             not yet planned — Python test suite (split from 02-03 by user direction)
```

PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [02-04 plan created, awaiting approval]

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

### Decisions (v1.1-specific — locked in 02-03)

- **Package name is `app/mcp_server/`, NOT `app/mcp/`.** Naming the package `mcp` would shadow the installed `mcp` SDK because `/app` (the bind-mount root) is on `sys.path`. Naming rule for future packages: when bind-mount root is on `sys.path`, never name a local package the same as an installed top-level dependency.
- **02-03 scope split: refactor + cleanups only; tests deferred to 02-04.** User direction. Refactor-first meant the test harness in 02-04 targets the final API surface.
- **Package layout established as strict DAG:** `config (constants) ← sync (I/O) ← state_helpers (pure transforms) ← tools/* (decorators) ← server (entry)`. Tool registration via import-as-side-effect inside `server.main()` keeps test/REPL imports side-effect-free. `__main__.py` enables `python -m mcp_server`.
- **`task-<uuid>` ID format applied to ALL `_build_task_record` callers**, not only `create_task` — including `create_project_with_tasks`. Forward-only; legacy bare-hex IDs continue to work. Matches `data.js generateId('task')`.

### Decisions (v1.1-specific — still to be made)

- _02-04 will decide: Python test framework (pytest vs unittest), test layout under `tests/mcp/`, whether to mock the `web` service or run integration tests against a live compose stack._
- _Phase 3 will finalize: bearer-token auth + LAN-bind, rate-limit / batch-cap policies, audit-trail UI shape, complete-task tool over `completionLog`, edit-note / delete-note tools, arbitrary task-field updates (title/description/dueDate/contexts/peopleTags), note `_source` durability decision, canonical "do not expose to internet" doc copy._

### Deferred Issues

- 2026-05-09: **02-03 smoke entities live in state** — `task-bd4b5e1b-3606-4754-a597-aba2a4375bb9` and `project-988dab8d-89a4-45a8-961a-fffa4e97cecb` ("02-03 refactor smoke (delete me)"). Self-cleanup via UI; not blocking.
- 2026-05-09: **`starlette<2` lower bound unspecified** — pinned `<2` only; 1.0.0 resolved cleanly today, but if mcp 1.27.0's transitive resolver later prefers <0.40, request flow may break. 02-04 should add a "sidecar handshakes" regression assertion.
- 2026-05-09: **`tools/tasks.py` at 301 LoC** — right at the comfortable threshold. If Phase 3 introduces `complete_task` or arbitrary field updates, plan to split by entity-action rather than entity-type at that point.
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

Last session: 2026-05-09
Stopped at: 02-04 PLAN created, awaiting approval. Phase 2 progress: 3 of 4 plans closed; 02-04 plan staged.
Next action: Review `.paul/phases/02-mcp-server/02-04-PLAN.md`, then run `/paul:apply .paul/phases/02-mcp-server/02-04-PLAN.md`.
Resume context:
- Branch: `main` — working tree dirty: 1 deleted (`app/mcp_server.py`), 9 new (`app/mcp_server/**/*.py`), 3 modified (`Dockerfile.mcp`, `docker-compose.yml`, `requirements-mcp.txt`), plus PAUL bookkeeping (`STATE.md`, `ROADMAP.md`, `paul.json`, `.paul/phases/02-mcp-server/02-03-PLAN.md`, `02-03-SUMMARY.md`). **Recommended commit:** `refactor(mcp): split mcp_server.py into app/mcp_server/ package + cleanups (Phase 2 plan 03)`. Note 02-02's recommended commit (`feat(mcp): task entity tools …`) is still pending — bundle if uncommitted, or commit 02-02 first then 02-03.
- Stack state: **10 MCP tools** registered, sidecar healthy at http://127.0.0.1:8003/mcp via the new `app/mcp_server/` package. Module DAG: config ← sync ← state_helpers ← tools/* ← server. Bind is loopback-only per Phase 1 PoC decision.
- 02-04 scope (next plan): Python test suite. Anticipated layout `tests/mcp_server/{test_sync,test_state_helpers,test_tools_projects,test_tools_tasks}.py`. Coverage targets: 409 retry path, per-group LWW status-bump correctness, append-only note semantics, `task-<uuid>` ID format regression, `_rev` Δ = +1 atomicity for `create_project_with_tasks`. Open decisions: pytest vs unittest, mock-`web` vs integration-against-live-compose. Add a "sidecar handshakes" assertion as a guard against future starlette resolution drift.
- Carried-forward deferreds: smoke entities `task-bd4b5e1b...` + `project-988dab8d...` (02-03 SUMMARY); `tools/tasks.py` LoC budget at 301; synthetic `projectActivityLog` row; areaOfFocus/themeTag validation; complete-task flow (Phase 3); arbitrary field updates (Phase 3); note `_source` durability (Phase 3).

---
*STATE.md — Updated after every significant action*
