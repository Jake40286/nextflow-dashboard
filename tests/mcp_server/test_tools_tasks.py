"""Wire-contract + invariant lock-in for `mcp_server.tools.tasks`.

Every write tool is asserted to:
  - send `If-Match: <fetched_rev>` (AC-2)
  - have `_rev`, `completionLog`, `reference`, `completedProjects`,
    `projectActivityLog` stripped from the PUT body (AC-2)

Plus the codified invariants from 02-02 / 02-03 (AC-3):
  - `update_task_status` bumps `_fieldTimestamps["status"]`
  - `set_task_project` does NOT bump `_fieldTimestamps`
  - `add_task_note` appends preserving existing notes byte-identical
"""
from __future__ import annotations

import datetime as _dt
import json
import re
from typing import Any

import pytest

from mcp_server.config import NEXTFLOW_API_URL
from mcp_server.tools.tasks import (
    add_task_note,
    create_task,
    get_task,
    list_tasks,
    set_task_project,
    update_task_status,
)

pytestmark = pytest.mark.asyncio

STATE_URL = f"{NEXTFLOW_API_URL}/state"
TASK_ID_RE = re.compile(r"^task-[0-9a-f-]{36}$")
NOTE_ID_RE = re.compile(r"^note-[0-9a-f-]{36}$")
STRIPPED_FIELDS = (
    "_rev", "completionLog", "reference", "completedProjects", "projectActivityLog"
)


def _state(rev: int, *, tasks=None, projects=None) -> dict[str, Any]:
    return {
        "_rev": rev,
        "tasks": list(tasks or []),
        "projects": list(projects or []),
        "settings": {},
        "completionLog": [{"id": "leak"}],
        "reference": [],
        "completedProjects": [],
        "projectActivityLog": [],
    }


def _put_body(httpx_mock) -> dict[str, Any]:
    put_req = next(r for r in httpx_mock.get_requests() if r.method == "PUT")
    return json.loads(put_req.content)


def _put_request(httpx_mock):
    return next(r for r in httpx_mock.get_requests() if r.method == "PUT")


def _assert_strip_and_ifmatch(httpx_mock, expected_rev: int) -> dict[str, Any]:
    """Common AC-2 assertions for every write tool. Returns the PUT body
    so the caller can do tool-specific assertions on it."""
    put = _put_request(httpx_mock)
    assert put.headers["If-Match"] == str(expected_rev)
    body = json.loads(put.content)
    for forbidden in STRIPPED_FIELDS:
        assert forbidden not in body, f"{forbidden!r} leaked into PUT body"
    return body


# ---------------------------------------------------------------------------
# create_task
# ---------------------------------------------------------------------------

async def test_create_task_wire_contract_and_id_format(httpx_mock):
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(100))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 101}
    )

    result = await create_task(title="ship 02-04 tests")

    assert TASK_ID_RE.match(result["id"]), result["id"]
    assert result["_rev"] == 101

    body = _assert_strip_and_ifmatch(httpx_mock, expected_rev=100)
    new_tasks = body["tasks"]
    assert len(new_tasks) == 1
    assert new_tasks[0]["title"] == "ship 02-04 tests"
    assert new_tasks[0]["_source"] == "mcp"
    assert TASK_ID_RE.match(new_tasks[0]["id"])


async def test_create_task_rejects_empty_title():
    with pytest.raises(ValueError, match="title is required"):
        await create_task(title="   ")


async def test_create_task_rejects_invalid_status():
    with pytest.raises(ValueError, match="status must be one of"):
        await create_task(title="x", status="completed")


# ---------------------------------------------------------------------------
# update_task_status — locks 02-02 per-group LWW invariant
# ---------------------------------------------------------------------------

async def test_update_task_status_bumps_field_timestamp(httpx_mock):
    """Per data.js MERGE_FIELD_GROUPS, "status" lives in the "status"
    field-group. Mutations must bump `_fieldTimestamps["status"]` so a
    concurrent stale browser PUT doesn't silently overwrite."""
    seed = {
        "id": "task-aaaa1111-2222-3333-4444-555566667777",
        "title": "demo",
        "status": "inbox",
        "_fieldTimestamps": {},
        "updatedAt": "2020-01-01T00:00:00.000Z",
    }
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(50, tasks=[seed]))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 51}
    )

    before = _dt.datetime.now(_dt.timezone.utc)
    await update_task_status(id=seed["id"], status="next")
    after = _dt.datetime.now(_dt.timezone.utc)

    body = _assert_strip_and_ifmatch(httpx_mock, expected_rev=50)
    written = next(t for t in body["tasks"] if t["id"] == seed["id"])
    assert written["status"] == "next"
    assert "status" in written["_fieldTimestamps"], (
        "per-group LWW timestamp must be bumped on a tracked-field write"
    )
    bumped = _dt.datetime.strptime(
        written["_fieldTimestamps"]["status"], "%Y-%m-%dT%H:%M:%S.%fZ"
    ).replace(tzinfo=_dt.timezone.utc)
    # Allow a generous window to absorb scheduler jitter; the assertion
    # we care about is "fresh", not millisecond accuracy.
    assert before - _dt.timedelta(seconds=5) <= bumped <= after + _dt.timedelta(seconds=5)


async def test_update_task_status_raises_on_missing_task(httpx_mock):
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(1))
    with pytest.raises(ValueError, match="not found"):
        await update_task_status(id="task-missing", status="next")


# ---------------------------------------------------------------------------
# set_task_project — locks 02-02 whole-task LWW invariant
# ---------------------------------------------------------------------------

async def test_set_task_project_does_not_bump_field_timestamps(httpx_mock):
    """projectId is NOT in MERGE_FIELD_GROUPS, so it rides whole-task
    LWW (updatedAt) only — `_fieldTimestamps` must remain untouched."""
    seed = {
        "id": "task-aaaa1111-2222-3333-4444-555566667777",
        "title": "demo",
        "_fieldTimestamps": {},
        "updatedAt": "2020-01-01T00:00:00.000Z",
        "projectId": None,
    }
    project = {"id": "project-target", "name": "Target", "statusTag": "Active"}
    full_state = _state(60, tasks=[seed], projects=[project])
    # set_task_project does an extra preview-GET to validate target exists,
    # then GET+PUT inside _write_state_with_retry.
    httpx_mock.add_response(method="GET", url=STATE_URL, json=full_state)
    httpx_mock.add_response(method="GET", url=STATE_URL, json=full_state)
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 61}
    )

    await set_task_project(id=seed["id"], project_id="project-target")

    body = _assert_strip_and_ifmatch(httpx_mock, expected_rev=60)
    written = next(t for t in body["tasks"] if t["id"] == seed["id"])
    assert written["projectId"] == "project-target"
    assert written["_fieldTimestamps"] == {}, (
        "projectId is whole-task LWW; _fieldTimestamps must not be bumped"
    )
    assert written["updatedAt"] != "2020-01-01T00:00:00.000Z", (
        "updatedAt must move so whole-task LWW carries the change"
    )


async def test_set_task_project_rejects_unknown_project(httpx_mock):
    seed = {"id": "task-x", "title": "demo"}
    httpx_mock.add_response(
        method="GET", url=STATE_URL, json=_state(60, tasks=[seed], projects=[])
    )
    with pytest.raises(ValueError, match="Project 'project-ghost' not found"):
        await set_task_project(id="task-x", project_id="project-ghost")


# ---------------------------------------------------------------------------
# add_task_note — locks append-only-with-byte-identical-existing invariant
# ---------------------------------------------------------------------------

async def test_add_task_note_appends_preserves_existing(httpx_mock):
    existing_notes = [
        {
            "id": "note-11111111-2222-3333-4444-555555555555",
            "text": "first",
            "createdAt": "2025-01-01T00:00:00.000Z",
            "updatedAt": "2025-01-01T00:00:00.000Z",
            "_source": "browser",
        },
        {
            "id": "note-22222222-3333-4444-5555-666666666666",
            "text": "second",
            "createdAt": "2025-02-01T00:00:00.000Z",
            "updatedAt": "2025-02-01T00:00:00.000Z",
            "_source": "browser",
        },
    ]
    seed = {
        "id": "task-aaaa1111-2222-3333-4444-555566667777",
        "title": "demo",
        "notes": existing_notes,
        "_fieldTimestamps": {},
    }
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(70, tasks=[seed]))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 71}
    )

    result = await add_task_note(id=seed["id"], text="third")

    assert NOTE_ID_RE.match(result["note_id"])

    body = _assert_strip_and_ifmatch(httpx_mock, expected_rev=70)
    written = next(t for t in body["tasks"] if t["id"] == seed["id"])
    assert len(written["notes"]) == 3
    # First two byte-identical to seeds (order stable, no edits).
    assert written["notes"][0] == existing_notes[0]
    assert written["notes"][1] == existing_notes[1]
    new_note = written["notes"][2]
    assert new_note["text"] == "third"
    assert new_note["_source"] == "mcp"
    assert NOTE_ID_RE.match(new_note["id"])


async def test_add_task_note_rejects_empty_text():
    with pytest.raises(ValueError, match="text is required"):
        await add_task_note(id="task-x", text="   ")


# ---------------------------------------------------------------------------
# list_tasks / get_task (read-only)
# ---------------------------------------------------------------------------

async def test_list_tasks_filters_by_status(httpx_mock):
    state = _state(10, tasks=[
        {"id": "task-1", "title": "a", "status": "inbox"},
        {"id": "task-2", "title": "b", "status": "next"},
        {"id": "task-3", "title": "c", "status": "next"},
    ])
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)

    result = await list_tasks(status="next")
    ids = sorted(r["id"] for r in result)
    assert ids == ["task-2", "task-3"]
    for r in result:
        assert r["status"] == "next"


async def test_list_tasks_combines_filters_with_and(httpx_mock):
    state = _state(10, tasks=[
        {"id": "task-1", "title": "a", "status": "next", "contexts": ["@Phone"]},
        {"id": "task-2", "title": "b", "status": "next", "contexts": ["@Home"]},
        {"id": "task-3", "title": "c", "status": "inbox", "contexts": ["@Phone"]},
    ])
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)
    result = await list_tasks(status="next", context="@Phone")
    assert [r["id"] for r in result] == ["task-1"]


async def test_get_task_returns_full_record_minus_internal_fields(httpx_mock):
    state = _state(10, tasks=[{
        "id": "task-z",
        "title": "deep",
        "description": "details",
        "_source": "mcp",
        "_fieldTimestamps": {"status": "2026-05-01T00:00:00.000Z"},
        "notes": [],
    }])
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)
    public = await get_task(id="task-z")
    assert public["id"] == "task-z"
    assert public["description"] == "details"
    assert "_source" not in public
    assert "_fieldTimestamps" not in public
    assert public["notes"] == []
    assert public["listItems"] == []


async def test_get_task_raises_on_missing(httpx_mock):
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(10))
    with pytest.raises(ValueError, match="not found"):
        await get_task(id="task-missing")
