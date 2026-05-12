"""Live round-trip integration test for the MCP sidecar.

Skipped by default. Run with `--integration` against `docker compose up -d`.

Exercises the real plumbing — FastMCP streamable-HTTP transport, the
sidecar's tool registration, the `web` service's optimistic-locking
write path, and post-write state visibility — to guard against regressions
that unit tests can't catch (e.g. starlette resolution drift flagged in
STATE Deferred Issues).

Self-cleanup: tombstones its smoke task before exiting so we don't leak
test entities into `data/state.json` (we got bitten in 02-03).
"""
from __future__ import annotations

import datetime as _dt
import re

import httpx
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

SIDECAR_URL = "http://127.0.0.1:8003/mcp"
WEB_URL = "http://localhost:8002"
TASK_ID_RE = re.compile(r"^task-[0-9a-f-]{36}$")


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _preflight() -> None:
    """Fail fast with an actionable message if compose isn't running."""
    try:
        httpx.get(f"{WEB_URL}/state", timeout=2)
    except (httpx.ConnectError, httpx.ReadError, httpx.TimeoutException) as e:
        pytest.fail(
            f"`web` unreachable at {WEB_URL} ({e}). "
            "Run `docker compose up -d` and retry."
        )
    try:
        # Sidecar streamable-HTTP returns 4xx on plain GET (expects POST/SSE),
        # but reaching the port at all is enough to prove it's up.
        httpx.get(SIDECAR_URL, timeout=2)
    except (httpx.ConnectError, httpx.ReadError, httpx.TimeoutException) as e:
        pytest.fail(
            f"Sidecar unreachable at {SIDECAR_URL} ({e}). "
            "Run `docker compose up -d` and retry."
        )


async def _tombstone_task(task_id: str) -> None:
    """Remove the smoke task from `state.tasks` and add a tombstone so a
    later browser merge won't resurrect it. Uses optimistic locking."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{WEB_URL}/state")
        resp.raise_for_status()
        state = resp.json()
        rev = state.get("_rev", 0)
        state["tasks"] = [t for t in state.get("tasks") or [] if t.get("id") != task_id]
        tombstones = dict(state.get("_tombstones") or {})
        tombstones[task_id] = _now_iso()
        state["_tombstones"] = tombstones
        # Strip the same fields the sidecar strips so we don't disturb
        # completion data.
        for k in ("_rev", "completionLog", "reference", "completedProjects", "projectActivityLog"):
            state.pop(k, None)
        put = await client.put(
            f"{WEB_URL}/state",
            headers={"Content-Type": "application/json", "If-Match": str(rev)},
            json=state,
        )
        put.raise_for_status()


async def test_create_task_end_to_end_via_live_compose():
    """Create a task via the sidecar's MCP tool, verify it lands in
    `web`'s state with the correct ID format and audit field, then
    tombstone it for cleanup."""
    _preflight()

    # Lazy import: pulling these in at module top would force every
    # collection-time pytest run to load the heavy MCP client deps.
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    pre = httpx.get(f"{WEB_URL}/state", timeout=5).json()
    pre_rev = pre.get("_rev", 0)

    title = f"02-04 integration smoke {_now_iso()}"
    task_id: str | None = None
    try:
        async with streamable_http_client(SIDECAR_URL) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                tool_result = await session.call_tool(
                    "create_task", {"title": title, "status": "inbox"}
                )
                # FastMCP returns structured content; the create_task tool
                # returns {"id": ..., "_rev": ...}.
                payload = getattr(tool_result, "structuredContent", None) or {}
                task_id = payload.get("id")
                assert task_id, f"create_task returned no id: {tool_result!r}"
                assert TASK_ID_RE.match(task_id), f"non-canonical id: {task_id!r}"

        # Verify against `web`.
        post = httpx.get(f"{WEB_URL}/state", timeout=5).json()
        assert post["_rev"] > pre_rev, "rev must advance after a write"
        match = next((t for t in post["tasks"] if t.get("id") == task_id), None)
        assert match is not None, f"smoke task {task_id!r} not in state.tasks"
        assert match["title"] == title
        assert match["_source"] == "mcp"
    finally:
        if task_id:
            await _tombstone_task(task_id)
            final = httpx.get(f"{WEB_URL}/state", timeout=5).json()
            assert all(t.get("id") != task_id for t in final.get("tasks") or []), (
                f"smoke task {task_id!r} still present after tombstone cleanup"
            )
