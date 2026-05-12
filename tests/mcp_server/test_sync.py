"""Wire-contract tests for `mcp_server.sync._write_state_with_retry`.

Covers AC-1 (409 retry path end-to-end) and the request-side of AC-2
(optimistic-locking headers, body strip of `_rev`/completion fields).

`pytest-httpx` fails the test if any HTTP request goes unmocked, which
is what enforces "zero network calls" (AC-5) at the sync layer.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from mcp_server.config import MAX_RETRIES, NEXTFLOW_API_URL
from mcp_server.sync import _write_state_with_retry

pytestmark = pytest.mark.asyncio

STATE_URL = f"{NEXTFLOW_API_URL}/state"


def _state(rev: int, **extra: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "_rev": rev,
        "tasks": [],
        "projects": [],
        "settings": {},
        "completionLog": [],
        "reference": [],
        "completedProjects": [],
        "projectActivityLog": [],
    }
    base.update(extra)
    return base


async def test_write_state_with_retry_happy_path(httpx_mock):
    """First-try success: GET → 200, PUT → 200, mutator runs once,
    If-Match carries fetched _rev, response body propagated."""
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(42))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 43}
    )

    calls: list[int] = []

    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        calls.append(state["_rev"])
        new_state = dict(state)
        new_state["tasks"] = [{"id": "task-x", "title": "demo"}]
        return new_state

    result = await _write_state_with_retry(mutator)

    assert result == {"status": "ok", "_rev": 43}
    assert calls == [42], "mutator must run exactly once on the happy path"

    requests = httpx_mock.get_requests()
    put_request = next(r for r in requests if r.method == "PUT")
    assert put_request.headers["If-Match"] == "42"


async def test_write_state_with_retry_409_then_200(httpx_mock):
    """409 on first PUT → re-fetch (which now returns rev=43) → second
    PUT carries `If-Match: 43` and succeeds. Mutator runs twice."""
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(42))
    httpx_mock.add_response(
        method="PUT",
        url=STATE_URL,
        status_code=409,
        json=_state(43),
    )
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(43))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 44}
    )

    seen_revs: list[int] = []

    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        seen_revs.append(state["_rev"])
        return dict(state)

    result = await _write_state_with_retry(mutator)

    assert result == {"status": "ok", "_rev": 44}
    assert seen_revs == [42, 43], "mutator must re-run with fresh state on 409"

    puts = [r for r in httpx_mock.get_requests() if r.method == "PUT"]
    assert [p.headers["If-Match"] for p in puts] == ["42", "43"]


async def test_write_state_with_retry_max_retries_exhausted(httpx_mock):
    """Persistent 409s exhaust MAX_RETRIES and raise RuntimeError.

    Asserts exactly MAX_RETRIES PUT attempts (not MAX_RETRIES+1).
    """
    for _ in range(MAX_RETRIES):
        httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(42))
        httpx_mock.add_response(
            method="PUT", url=STATE_URL, status_code=409, json=_state(42)
        )

    with pytest.raises((RuntimeError, httpx.HTTPStatusError)):
        await _write_state_with_retry(lambda state: dict(state))

    puts = [r for r in httpx_mock.get_requests() if r.method == "PUT"]
    assert len(puts) == MAX_RETRIES, (
        f"expected exactly MAX_RETRIES={MAX_RETRIES} PUT attempts; got {len(puts)}"
    )


async def test_put_body_strips_completion_and_rev_fields(httpx_mock):
    """Even if the mutator returns a body containing `_rev`/completion
    fields, the PUT body must have them stripped (AC-2 strip clause).
    """
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(7))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 8}
    )

    def noisy_mutator(state: dict[str, Any]) -> dict[str, Any]:
        out = dict(state)
        out["_rev"] = 999
        out["completionLog"] = [{"id": "leak"}]
        out["reference"] = [{"id": "leak"}]
        out["completedProjects"] = [{"id": "leak"}]
        out["projectActivityLog"] = [{"id": "leak"}]
        return out

    await _write_state_with_retry(noisy_mutator)

    put_request = next(r for r in httpx_mock.get_requests() if r.method == "PUT")
    body = json.loads(put_request.content)
    for forbidden in ("_rev", "completionLog", "reference", "completedProjects", "projectActivityLog"):
        assert forbidden not in body, (
            f"{forbidden!r} must be stripped from PUT body before write"
        )
    assert put_request.headers["If-Match"] == "7"
