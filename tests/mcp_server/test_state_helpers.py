"""Pure-function tests for `mcp_server.state_helpers`.

No I/O, no httpx. Locks in 02-03's `task-<uuid>` / `project-<uuid>` ID
format and the audit invariants (`_source: "mcp"`, empty
`_fieldTimestamps`) on freshly built records.
"""
from __future__ import annotations

import re

import pytest

from mcp_server.state_helpers import (
    _build_project_record,
    _build_task_record,
    _new_note_id,
    _project_summary,
    _public_task,
    _task_summary,
    _update_task_in_state,
)

TASK_ID_RE = re.compile(r"^task-[0-9a-f-]{36}$")
PROJECT_ID_RE = re.compile(r"^project-[0-9a-f-]{36}$")
NOTE_ID_RE = re.compile(r"^note-[0-9a-f-]{36}$")


def _minimal_task(**overrides):
    base = dict(
        title="seed",
        status="inbox",
        description="",
        contexts=[],
        peopleTags=[],
    )
    base.update(overrides)
    return _build_task_record(**base)


def test_build_task_record_id_format():
    task = _minimal_task()
    assert TASK_ID_RE.match(task["id"]), task["id"]


def test_build_task_record_audit_fields():
    """Audit invariants: `_source` always "mcp", `_fieldTimestamps` empty
    on creation. Per-group LWW bumps come later, on mutation."""
    task = _minimal_task()
    assert task["_source"] == "mcp"
    assert task["_fieldTimestamps"] == {}


def test_build_project_record_id_format():
    project = _build_project_record(
        name="Plan a sabbatical",
        vision="",
        areaOfFocus="",
        themeTag="",
        statusTag="Active",
        deadline="",
    )
    assert PROJECT_ID_RE.match(project["id"]), project["id"]
    assert project["_source"] == "mcp"


def test_new_note_id_format():
    nid = _new_note_id()
    assert NOTE_ID_RE.match(nid), nid


def test_update_task_in_state_bumps_updatedAt():
    """`_update_task_in_state` must always bump `updatedAt`, even when
    the mutator itself doesn't touch it. This is what carries
    whole-task LWW for non-tracked fields like `projectId`."""
    state = {
        "tasks": [
            {"id": "task-abc", "title": "x", "updatedAt": "2020-01-01T00:00:00.000Z"}
        ]
    }
    new_state = _update_task_in_state(state, "task-abc", lambda t: t)
    new_ts = new_state["tasks"][0]["updatedAt"]
    assert new_ts != "2020-01-01T00:00:00.000Z"
    assert new_ts.endswith("Z")


def test_update_task_in_state_raises_on_missing_id():
    state = {"tasks": [{"id": "task-abc", "title": "x"}]}
    with pytest.raises(ValueError, match="task-missing"):
        _update_task_in_state(state, "task-missing", lambda t: t)


def test_update_task_in_state_does_not_mutate_input():
    """Caller must be safe to reuse the original state dict after a
    failed PUT (409 retry path)."""
    original = {
        "tasks": [
            {"id": "task-abc", "title": "x", "updatedAt": "2020-01-01T00:00:00.000Z"}
        ]
    }
    snapshot_id = id(original["tasks"])
    _update_task_in_state(original, "task-abc", lambda t: {**t, "title": "y"})
    assert original["tasks"][0]["title"] == "x"
    assert original["tasks"][0]["updatedAt"] == "2020-01-01T00:00:00.000Z"
    assert id(original["tasks"]) == snapshot_id


def test_task_summary_drops_empty_fields_but_keeps_id_and_title():
    summary = _task_summary({
        "id": "task-abc",
        "title": "demo",
        "status": "inbox",
        "contexts": [],
        "peopleTags": [],
        "projectId": None,
    })
    assert summary["id"] == "task-abc"
    assert summary["title"] == "demo"
    assert summary["status"] == "inbox"
    assert "contexts" not in summary
    assert "peopleTags" not in summary
    assert "projectId" not in summary


def test_public_task_strips_internal_fields():
    full = {
        "id": "task-abc",
        "title": "demo",
        "_source": "mcp",
        "_fieldTimestamps": {"status": "2026-05-09T00:00:00.000Z"},
        "slug": "demo",
    }
    public = _public_task(full)
    assert public == {"id": "task-abc", "title": "demo"}


def test_project_summary_counts_active_tasks_only():
    project = {
        "id": "project-abc",
        "name": "Sabbatical",
        "statusTag": "Active",
        "areaOfFocus": "Personal",
        "themeTag": None,
        "deadline": None,
        "vision": "",
    }
    tasks = [
        {"id": "task-1", "projectId": "project-abc"},
        {"id": "task-2", "projectId": "project-abc"},
        {"id": "task-3", "projectId": "project-other"},
    ]
    summary = _project_summary(project, tasks)
    assert summary["taskCount"] == 2
