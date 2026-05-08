# MCP Feasibility — Decision Record

**Phase:** 01-mcp-feasibility
**Plan:** 01-01 (research)
**Date:** 2026-05-08
**Author:** Claude Opus 4.7 (research subagent + code review of `app/server.py`, `app/web_ui/js/data.js`, `docker-compose.yml`)

---

## MCP SDK Choice

*Research date: 2026-05-08. Evaluated for a Python 3.11 sidecar in a docker-compose stack, LAN-accessible via HTTP/SSE, minimal-dependency preference.*

| | [Official `mcp` SDK](https://pypi.org/project/mcp/) | [FastMCP](https://pypi.org/project/fastmcp/) | Hand-rolled JSON-RPC (stdlib) |
|---|---|---|---|
| **Source** | [github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) | [github.com/jlowin/fastmcp](https://github.com/jlowin/fastmcp) | n/a |
| **License** | MIT | Apache-2.0 | n/a |
| **Latest release** | 1.27.0 (Apr 2, 2026) | 3.2.4 (early 2026) | n/a |
| **Transport modes** | stdio, SSE, streamable-HTTP (recommended), WebSocket (optional) | stdio, SSE, streamable-HTTP | Whatever you implement |
| **Key dependencies** | anyio, pydantic ≥2, starlette, uvicorn, httpx, sse-starlette, pyjwt, jsonschema, python-multipart (~10 packages) | `mcp` ≥1.24 + authlib, cyclopts, uvicorn, websockets, pydantic ≥2 (~15+ packages, wraps the official SDK) | None — pure stdlib |
| **Pro 1 (nextflow)** | Official spec support; streamable-HTTP works LAN-accessible with `uvicorn` out of the box — no extra glue | Decorator-based tool registration is the most concise authoring experience; fewer boilerplate lines per tool | Zero new dependencies; no footprint risk; full control over the wire format |
| **Pro 2 (nextflow)** | Starlette/uvicorn are well-understood; HTTP server can bind `0.0.0.0` cleanly for LAN access from Claude Desktop/Code | Active, high-adoption project (claimed 70% of MCP servers); good real-world examples for `@tool` decorated functions that call an internal HTTP endpoint | Trivially auditable; no upstream breakage risk from a fast-moving SDK ecosystem |
| **Con 1 (nextflow)** | Heavy footprint: starlette + uvicorn + pydantic v2 + pyjwt is a significant pull for a sidecar that makes a few HTTP calls | Depends on the official `mcp` SDK as a hard dependency, so you get *all* of that footprint plus FastMCP's own extras (authlib, websockets) | Full MCP spec compliance is non-trivial to maintain — spec is still evolving; capability negotiation, lifecycle messages, and error codes all need hand-implementation |
| **Con 2 (nextflow)** | Pydantic v2 + starlette is a notably larger install than "vanilla Python + minimal deps"; needs its own uvicorn process or subprocess | FastMCP 3.x now includes Prefect-ecosystem features (tasks, OpenTelemetry, provider types) that are entirely irrelevant here and add install noise | No community tooling, no typed schema generation, and any spec change (e.g. new transport or auth requirements) requires manual rework |

### Recommendation

The **official `mcp` SDK (v1.27.0)** is the best fit for nextflow. It ships spec-compliant stdio, SSE, and streamable-HTTP transports out of the box — streamable-HTTP in particular is the current recommended path for LAN-accessible deployments and works cleanly with a bound uvicorn instance in a docker-compose sidecar. FastMCP's authoring ergonomics are appealing but it wraps the official SDK rather than replacing it, so you inherit the same dependency footprint *plus* FastMCP's own extras (authlib, websockets, cyclopts) with no transport benefit for this use case. Hand-rolling JSON-RPC is viable given the project's vanilla-Python preference, but the MCP spec's lifecycle and capability-negotiation requirements make full compliance a meaningful maintenance burden for a sidecar whose only job is proxying a handful of task CRUD calls. The official SDK's starlette/uvicorn pull is the main cost; accept it in exchange for a correctly-versioned, maintained implementation that will track spec changes without rework.

---

## Sidecar Shape

**Recommendation:** new `mcp` service in the existing `docker-compose.yml`, **HTTP-only access** to the main `web` service via the docker network. **Do not** bind-mount `./data` into the sidecar.

### Rationale

The main app (`app/server.py`) owns `state.json` exclusively under `STATE_LOCK` (`server.py:70`). A bind-mounted sidecar that wrote `state.json` directly would race with the in-process `STATE_LOCK` and corrupt the optimistic-locking contract. Routing every write through `PUT /state` is the only safe path — and it has zero new persistence machinery to design or test.

This also means the sidecar's volume needs are zero: no `./data`, no `./secrets`. It only needs the docker network and the main `web` service hostname.

### Draft compose block

```yaml
services:
  web:
    # ... existing definition unchanged ...

  mcp:
    build:
      context: .
      dockerfile: Dockerfile.mcp        # new — minimal python:3.11-slim + `mcp` SDK
    user: "1000:1000"
    env_file:
      - .env
    environment:
      - NEXTFLOW_API_URL=http://web:8000   # internal docker network — never localhost:8002
    ports:
      - "8003:8001"                        # 8003 on host, 8001 in container; sibling of 8002
    working_dir: /app
    command: python mcp_server.py
    volumes:
      - ./app:/app                         # bind-mount source so iteration matches `web`'s pattern
    depends_on:
      - web
```

### Port choice

- **8003 host / 8001 container.** 8002 is taken by `web`. 8003 keeps the "8002-ish" mental model and won't collide with common dev ports (3000, 5000, 8000-8002, 8080).
- The container-internal port (8001) doesn't matter externally; `mcp` and `web` talk via service names on the docker bridge network (e.g. `http://web:8000` from the sidecar).

### Files added

- `Dockerfile.mcp` — minimal: `python:3.11-slim`, `pip install mcp`, copy `app/`, `CMD python mcp_server.py`.
- `app/mcp_server.py` — entry point.
- `app/mcp/` — module directory for tool implementations (one tool per file, mirroring `panels/` convention from `web_ui/js/`).
- `requirements.txt` (new — currently the project has no Python deps file because the main app uses only stdlib + optional Google libs). The `mcp` SDK is the first hard Python dependency; flag this to the user before installing.

### What this does NOT do

- Does **not** write `state.json` directly.
- Does **not** require modifying the main `web` service's compose entry.
- Does **not** add a new volume.
- Does **not** expose the sidecar to the public internet (no reverse proxy, no host networking).

---

## Sync Path Strategy

The MCP server replicates the proven retry pattern from `app/web_ui/js/data.js:716-808` (`flushRemoteQueue`). Every mutation is a five-step round trip against the main app:

### Steps

1. **Obtain current state.** GET `http://web:8000/state` (internal docker network). Response includes `_rev` (server-owned revision) and `_serverVersion`. Cache `_rev` as `last_known_rev`.

2. **Construct write payload.** Apply the mutation to the *full* state object (e.g. append a new task to `state.tasks`). The `PUT /state` handler at `server.py:720-829` accepts only full-state writes — partial/delta payloads would erase fields not included. This is true of the JS client too.

3. **Send `If-Match: <rev>`.** PUT `http://web:8000/state` with `Content-Type: application/json` and `If-Match: <last_known_rev>`. Body: full state JSON (no `_rev` field — server strips and re-assigns at `server.py:813`).

4. **Handle 409.** A 409 response body is the *complete* current server state (`server.py:757-759`), exactly mirroring the JS client's contract (`data.js:339-347`). On 409:
    a. Parse server state from body.
    b. Re-apply the mutation to the new server state (idempotent in our case — append new task with fresh UUID).
    c. Update `last_known_rev` from `serverState._rev`.
    d. Retry from step 3.
    Cap at **3 retries** (matches `MAX_RETRIES = 3` at `data.js:745`). On exhaustion, raise an error to the LLM tool caller — they'll see "conflict could not be resolved, please retry the tool call."

5. **Success.** 200 response body contains new `_rev`. Update `last_known_rev` and return success to the LLM.

### Race conditions

| Scenario | Behavior | New work needed? |
|---|---|---|
| MCP write while no other client is active | Single `If-Match` succeeds | No |
| MCP write while a browser is mid-write | One wins; loser gets 409 with the winner's state, re-applies its mutation, retries | No — same as browser↔browser races already handled today |
| Two MCP writes in flight from same sidecar process | Sidecar serializes via per-process asyncio lock around the GET-PUT pair (`mcp_state_lock`) | **Yes** — must implement, but trivial (1 lock) |
| MCP write of a 50-task atomic decomposition, repeated 409s | After 3 retries, surface error to LLM. LLM can re-call. **No partial state lands** because each retry sends the full payload. | No |

### Note on completion-data merging

The server-side merge logic at `server.py:768-805` for `completionLog`/`reference`/`completedProjects`/`projectActivityLog` is accumulator-style (LWW per id). The MCP server should **not** include these fields in its PUT bodies for v1.1 — task creation doesn't touch completion data. Stripping them mirrors the JS client's behavior at `data.js:738-743` when `_completionsDirty` is false.

---

## Auth Posture

### Phase 1 (PoC, plan 01-02)

**localhost-only bind by default.** The PoC binds the sidecar to `127.0.0.1` (or the docker bridge network only), not `0.0.0.0`. This means:

- Connecting from a Claude Desktop on the **same host** as the docker stack works.
- Connecting from another LAN host does **not** work (intentional — feasibility gate, not a deploy).
- No auth tokens, no shared secrets in Phase 1. The sidecar is reachable only by processes on the host.

This is the simplest defensible posture for a feasibility test. If the PoC succeeds and the user wants LAN-accessible MCP, Phase 3 elevates to a real auth model.

### Phase 3 (production hardening)

**LAN-bind + bearer token (recommended Phase 3 default).** The user sets `MCP_AUTH_TOKEN` in `.env`; every MCP request must present it as `Authorization: Bearer <token>`. Tokens are static, user-rotated, never auto-generated.

Other options considered:
- **Shared-secret header (custom name).** Equivalent security, less convention-aligned. Reject in favor of bearer.
- **mTLS.** Overkill for a single-user LAN tool. Rejected.
- **OAuth.** Out of scope for v1.x (no multi-user need).

### Internet exposure: out of scope, must be documented

Phase 3 must add to README and/or in-app docs an explicit warning:

> **Do not expose the nextflow MCP server to the public internet.** It is designed for LAN use behind your firewall. If you need remote access, place it behind a reverse proxy (Caddy, nginx, Traefik) that terminates TLS and adds an auth layer (basic auth, OAuth proxy, IP allowlist). The bearer-token mechanism is **not** sufficient for direct internet exposure — token sniffing, replay attacks, and rate-limiting concerns are unaddressed in v1.x.

This warning is the one Phase 3 deliverable that does NOT depend on any feasibility outcome.

---

## Go / No-Go Recommendation

**Verdict: GO**

The official `mcp` SDK is mature (v1.27.0, MIT, monthly releases), supports streamable-HTTP for LAN access, and the integration path is a clean replication of the existing JS sync pattern. The code review of `app/server.py` and `app/web_ui/js/data.js` confirms there are no architectural surprises — the optimistic-locking contract is well-defined and proven under multi-client load already.

### Top 3 risks

1. **`mcp` SDK API churn.** The SDK is on a fast release cadence (1.27.0 in early April 2026). A breaking change between Phase 1 and Phase 2 could force a rewrite of tool registration code. *Mitigation:* pin the version in `requirements.txt`; reassess at the start of Phase 2.
2. **Dependency footprint vs. project ethos.** The SDK pulls ~10 packages (starlette, uvicorn, pydantic v2, etc.) into a project that currently has zero hard Python dependencies. This is the largest single deviation from "vanilla Python preferred." *Mitigation:* the sidecar is its own image (`Dockerfile.mcp`); the main `web` service is unaffected. The user must explicitly approve the dependency set before Plan 01-02 installs anything (per global `CLAUDE.md`).
3. **LLM-induced 409 storms.** A 50-task atomic decomposition that retries 3× on conflict consumes meaningful server time on a busy state. *Mitigation:* Phase 3's batch-cap addresses this; Phase 1 PoC only creates one task per call so the risk doesn't materialize until later.

### Blast radius if Phase 1 PoC fails

- **Recoverable:** all PoC code lives in `app/mcp/`, `app/mcp_server.py`, `Dockerfile.mcp`, and a new `mcp` service in `docker-compose.yml`. None of this touches the main `web` service or `state.json`.
- **Recoverable:** the new `requirements.txt` is sidecar-scoped (loaded by `Dockerfile.mcp` only).
- **Not affected:** existing browser sync, optimistic locking, Google Calendar sync, backups, all 179 existing tests.
- **Worst case:** delete the new files, remove the `mcp:` block from `docker-compose.yml`, `docker compose down && up --build -d`. Total rollback cost: <5 minutes, no data risk.

### Rollback path

`git revert <plan-01-02-merge-commit> && docker compose up --build -d` removes the sidecar entirely; main app is unchanged.

### Estimated effort for Plan 01-02

**Small** — 1 working session. Scope: `Dockerfile.mcp` (~10 lines), `app/mcp_server.py` with one `create_task` tool (~80 lines), compose entry, smoke-test against Claude Desktop on the same host. The retry/locking logic is the only non-trivial code; it's a direct port of `flushRemoteQueue`'s loop, ~30 lines.

---

*DECISIONS.md — Created during Plan 01-01. Locked once user approves the human-verify checkpoint. Subsequent plans (01-02, 02-01, 03-01) reference these decisions; do not silently revise them — open a new decision row instead.*
