"""Async I/O layer between the MCP sidecar and the main nextflow app.

Owns the optimistic-locking write path: GET /state to discover ``_rev``,
apply a caller-supplied mutator, PUT /state with ``If-Match: <rev>``,
retry up to MAX_RETRIES on 409 conflicts.

This module is the ONLY place in the package that talks to the network.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
from typing import Any

import httpx

from .config import HTTP_TIMEOUT, MAX_RETRIES, NEXTFLOW_API_URL

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
