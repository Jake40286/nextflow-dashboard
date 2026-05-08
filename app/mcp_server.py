"""MCP sidecar server for nextflow.

Exposes a minimal walking-skeleton tool surface — currently just `create_task` —
that mutates state through the main app's `PUT /state` endpoint, replicating the
optimistic-locking + 409-retry pattern from `app/web_ui/js/data.js:716-808`.

This server NEVER touches `state.json` directly. It is a client of the main
`web` service over the docker network. See:
  .paul/phases/01-mcp-feasibility/DECISIONS.md
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import os
import sys
import uuid as _uuid
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

NEXTFLOW_API_URL = os.getenv("NEXTFLOW_API_URL", "http://web:8000").rstrip("/")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))
MAX_RETRIES = 3
HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

_state_lock = asyncio.Lock()


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


async def _fetch_state(client: httpx.AsyncClient) -> dict[str, Any]:
    """GET the current state from the main app. Returns the parsed JSON body
    including `_rev`."""
    response = await client.get(f"{NEXTFLOW_API_URL}/state")
    response.raise_for_status()
    return response.json()


async def _write_state_with_retry(mutate_fn) -> dict[str, Any]:
    """Apply `mutate_fn(state) -> new_state` to the latest server state and
    PUT it back, handling 409 conflicts by re-fetching and retrying.

    `mutate_fn` is called once per attempt; it must be deterministic-on-input
    and produce the full new-state dict to PUT. Up to MAX_RETRIES attempts.

    Returns the response body from the successful PUT (`{"status": "ok",
    "_rev": <int>}`).
    """
    async with _state_lock, httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        for attempt in range(MAX_RETRIES):
            state = await _fetch_state(client)
            current_rev = state.get("_rev", 0)
            new_state = mutate_fn(state)
            # The server strips client-supplied _rev (server.py:813), but we
            # remove it here too to be explicit.
            new_state.pop("_rev", None)
            # Strip completion fields — the new-protocol path leaves
            # `completed.json` untouched (mirrors data.js:738-743).
            for k in ("completionLog", "reference", "completedProjects", "projectActivityLog"):
                new_state.pop(k, None)

            response = await client.put(
                f"{NEXTFLOW_API_URL}/state",
                headers={
                    "Content-Type": "application/json",
                    "If-Match": str(current_rev),
                },
                json=new_state,
            )
            if response.status_code == 200:
                return response.json()
            if response.status_code == 409 and attempt < MAX_RETRIES - 1:
                # Conflict — server's body is the current state; loop will
                # re-fetch and re-mutate.
                continue
            response.raise_for_status()
        raise RuntimeError(
            f"Max retries ({MAX_RETRIES}) exceeded resolving 409 conflicts on PUT /state"
        )


mcp = FastMCP("nextflow")


@mcp.tool()
async def create_task(title: str, status: str = "inbox") -> dict[str, Any]:
    """Create a new nextflow task. The task lands in the user's Inbox by default.

    Args:
        title: The task title shown in the inbox/list. Required, non-empty.
        status: One of nextflow's task statuses — `inbox` (default), `next`,
            `doing`, `waiting`, or `someday`. Use `inbox` unless the user has
            already clarified where the task belongs.

    Returns:
        A dict with the new task's `id` and the server's new `_rev`.
    """
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required and cannot be empty")
    valid_statuses = ("inbox", "next", "doing", "waiting", "someday")
    if status not in valid_statuses:
        raise ValueError(
            f"status must be one of {valid_statuses}; got {status!r}"
        )

    new_task = {
        "id": _uuid.uuid4().hex,
        "title": title,
        "status": status,
        "description": "",
        "notes": [],
        "contexts": [],
        "peopleTags": [],
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "_fieldTimestamps": {},
        "_source": "mcp",
    }

    def _append_task(state: dict[str, Any]) -> dict[str, Any]:
        tasks = list(state.get("tasks") or [])
        tasks.append(new_task)
        return {**state, "tasks": tasks}

    result = await _write_state_with_retry(_append_task)
    return {"id": new_task["id"], "_rev": result.get("_rev")}


def main() -> None:
    print(
        f"MCP server listening on {MCP_HOST}:{MCP_PORT} "
        f"(NEXTFLOW_API_URL={NEXTFLOW_API_URL})",
        flush=True,
    )
    mcp.settings.host = MCP_HOST
    mcp.settings.port = MCP_PORT
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Shutting down MCP server", file=sys.stderr)
