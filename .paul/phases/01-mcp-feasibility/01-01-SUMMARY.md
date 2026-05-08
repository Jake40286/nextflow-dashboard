---
phase: 01-mcp-feasibility
plan: 01
subsystem: research/architecture
tags: [mcp, model-context-protocol, optimistic-locking, sidecar, docker-compose, feasibility]

requires:
  - phase: v1.0 closure
    provides: optimistic-locking write path (PUT /state with If-Match), proven 409-retry pattern in data.js
provides:
  - DECISIONS.md (architectural anchor for all of v1.1)
  - SDK choice — official `mcp` Python SDK v1.27.0
  - Sidecar shape — HTTP-only access via docker network, no ./data bind-mount
  - Sync path strategy — direct port of flushRemoteQueue's retry loop
  - Auth posture — Phase 1 localhost-only, Phase 3 bearer + LAN-bind
  - GO verdict for v1.1 Phase 1 PoC
affects: 01-02 (walking-skeleton PoC), 02-01 (full tool surface), 03-01 (security hardening)

tech-stack:
  added: []           # research-only; no dependencies installed
  patterns:
    - "Sidecar talks to main app via docker network HTTP (never bind-mounts state.json) — preserves single STATE_LOCK ownership"
    - "MCP write path = direct port of flushRemoteQueue's 3-retry loop — 409 body is full server state, re-apply mutation, retry"

key-files:
  created:
    - .paul/phases/01-mcp-feasibility/DECISIONS.md
  modified: []        # research-only; no source files modified

key-decisions:
  - "Use official `mcp` Python SDK v1.27.0 (MIT, ~10 deps) — accepts the dependency-footprint trade-off in exchange for spec-tracking"
  - "Sidecar in compose stack uses HTTP-only access (no ./data volume) — only safe path under existing optimistic-locking contract"
  - "Phase 1 PoC binds localhost-only — feasibility gate, not deploy. Phase 3 elevates to bearer-token + LAN-bind"
  - "v1.1 ships as LAN-only; internet exposure is a Phase 3 docs warning, not a feature"
  - "PUT /state requires full state body (not deltas) — same constraint as JS client; affects atomic-decomposition design in Phase 2"

patterns-established:
  - "DECISIONS.md is the v1.1 architectural anchor — future plans reference it; revisions open new rows, never silently rewrite"
  - "Research plans use type: research, files_modified: [<single doc>], no production source touched, exit via human-verify checkpoint"

duration: ~25min
started: 2026-05-08T00:00:00Z
completed: 2026-05-08T00:25:00Z
---

# Phase 1 Plan 01: MCP Feasibility Research Summary

**Verdict: GO. Use the official `mcp` Python SDK v1.27.0 in a docker-compose sidecar that accesses the main app via HTTP-only (no shared volume), replicating the JS client's 409-retry pattern verbatim.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 minutes |
| Started | 2026-05-08T00:00:00Z |
| Completed | 2026-05-08T00:25:00Z |
| Tasks | 3 auto + 1 human-verify checkpoint, all complete |
| Files modified | 1 (DECISIONS.md, new) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Decision Record exists with all four sections | Pass | 5 `##` sections present in DECISIONS.md (SDK / Sidecar / Sync / Auth / Go-No-Go) |
| AC-2: SDK survey is honest and current | Pass | 3 candidates: official `mcp` 1.27.0 (Apr 2026), FastMCP 3.2.4, hand-rolled stdlib. All with sourced URLs, license, last-release date, transport modes, ≥2 pros, ≥2 cons. Recommendation paragraph included. |
| AC-3: Sync path is provably correct | Pass | 5-step round trip documented (GET state → mutate → If-Match PUT → 409-retry-merge → success). 4-row race-condition table identifies cross-process serialization (in-process asyncio lock around GET-PUT pair, beyond what the existing in-process STATE_LOCK provides). |
| AC-4: Go/No-Go recommendation is decision-ready | Pass | Verdict line uses verbatim "GO" format. Top-3-risks list has exactly 3 items (SDK churn, dependency footprint, 409 storms). Blast radius: sidecar-only, fully reversible. Rollback: one sentence. Effort estimate: 1 working session, ~80 LoC for 01-02. |

## Accomplishments

- **DECISIONS.md (185 lines, 5 sections)** — the architectural anchor for all of v1.1. Every later plan (01-02 PoC, 02-01 full server, 03-01 hardening) references it.
- **SDK landscape de-risked** — official `mcp` v1.27.0 is mature, MIT-licensed, supports streamable-HTTP for LAN access. No surprises uncovered.
- **Existing write path validated as MCP-compatible** — code review of `app/server.py` (lines 720-829) and `app/web_ui/js/data.js` (lines 716-808) confirmed the optimistic-locking contract is well-defined and replication is mechanical.
- **GO verdict locked** — Plan 01-02 (walking-skeleton PoC) is unblocked. No re-scoping needed.

## Task Commits

No git commits made during this plan. Standard practice in this project is to commit at phase boundaries via `/paul:transition-phase` or after a logical unit ships, not per-task. The full Phase 1 work (01-01 + 01-02) will commit together when 01-02 closes — at minimum a `feat(mcp-feasibility):` commit covering DECISIONS.md, the PoC code, and the new compose entry.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Survey SDK landscape | (deferred) | docs | Subagent-driven survey, paste into DECISIONS.md "MCP SDK Choice" section |
| Task 2: Sidecar + sync path | (deferred) | docs | Code review of server.py + data.js + docker-compose.yml; write Sidecar Shape and Sync Path Strategy sections |
| Task 3: Auth + Go/No-Go | (deferred) | docs | Synthesize tasks 1-2; verdict, top-3 risks, blast radius, rollback |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `.paul/phases/01-mcp-feasibility/DECISIONS.md` | Created | Architectural decision record for v1.1: SDK choice, sidecar shape, sync path, auth posture, go/no-go |
| `.paul/phases/01-mcp-feasibility/01-01-PLAN.md` | Created (during PLAN) | The plan being unified |
| `.paul/STATE.md` | Modified | Loop position, session continuity, decisions promotion |
| `.paul/ROADMAP.md` | Modified | Phase status: Not started → Planning → (will become In Progress when 01-02 starts) |
| `.paul/PROJECT.md` | Modified | Active section names v1.1 (done at milestone creation; no further change in 01-01) |
| `.paul/paul.json` | Modified | milestone v1.1.0, phase 1 not_started → in_progress |

No source files in `app/`, `tests/`, `docker-compose.yml`, or `requirements.txt` were modified — boundaries respected.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Adopt official `mcp` SDK v1.27.0 | Spec-tracking, MIT, streamable-HTTP support; alternatives (FastMCP, hand-rolled) carry the same or worse dependency cost | Plan 01-02 will add `mcp` (and its ~10 transitive deps) via a new sidecar-scoped `requirements.txt` — first hard Python deps in the project |
| Sidecar = HTTP-only docker-network access (no ./data bind-mount) | Main app's STATE_LOCK is process-local; bind-mount writers would corrupt the optimistic-locking contract; HTTP routing is free correctness | All MCP writes go through `PUT /state`; no new persistence machinery anywhere in v1.1 |
| Phase 1 PoC binds localhost-only, no auth | Feasibility gate, not deploy. Cheapest defensible posture. | Phase 3 must elevate auth before LAN exposure is offered as a feature |
| Internet exposure is documentation, not feature | Auth + audit not mature enough for direct internet exposure in v1.x | Phase 3 ships an explicit "do not expose without TLS reverse proxy" warning in README and in-app docs |
| PUT /state takes full-state body, not deltas | Constraint inherited from existing server (server.py:829) and JS client (data.js:736) | Phase 2's atomic decomposition (`create_project_with_tasks`) is one PUT with project + N tasks added, not N separate PUTs |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | n/a |
| Scope additions | 0 | n/a |
| Deferred | 0 | None — research executed exactly as scoped |

**Total impact:** Clean APPLY. No qualify retries needed; no boundary near-misses; no scope creep.

### Auto-fixed Issues

None.

### Deferred Items

None — every question listed in the plan got an answer in DECISIONS.md.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Plan 01-02 (walking-skeleton PoC) can begin immediately. Its scope is fully de-risked: ~80 LoC `mcp_server.py` exposing one `create_task` tool, plus a minimal `Dockerfile.mcp` and a new `mcp` service block in `docker-compose.yml`. The retry/locking logic is a direct port of `flushRemoteQueue`'s loop (data.js:744-787).
- The dependency-footprint conversation is queued. Per global CLAUDE.md, the user must explicitly approve adding `mcp` to a new (sidecar-scoped) `requirements.txt` before Plan 01-02 installs anything.
- Tool-schema descriptions for GTD fields can be drafted now; they're a Phase 2 concern but the PoC's `create_task` should already model the pattern (rich `description` per field) so it transfers cleanly.

**Concerns:**
- **`mcp` SDK API churn.** v1.27.0 is on a fast release cadence. Pin the version in `requirements.txt`; reassess at Phase 2 start. (Logged as a top-3 risk in DECISIONS.md.)
- **First hard Python dependency.** The project has historically been stdlib-only for the main app. Sidecar-scoping the dependency keeps `web` clean, but the philosophical boundary now exists; future "let's add a Python lib" requests should be measured against this precedent.
- **JS file restructure remains adjacent.** `data.js` and `ui.js` weren't touched. If Phase 2 surfaces a clean shared-constants alignment with MCP tool schemas, escalate; otherwise the restructure stays in Deferred (Someday).

**Blockers:**
- None.

---
*Phase: 01-mcp-feasibility, Plan: 01*
*Completed: 2026-05-08*
