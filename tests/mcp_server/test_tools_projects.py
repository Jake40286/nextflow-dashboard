"""Wire-contract + invariant lock-in for `mcp_server.tools.projects`.

Most important here: `create_project_with_tasks` must issue EXACTLY ONE
PUT regardless of task count (`_rev` Δ = +1 atomicity guarantee from
02-01) and every task it creates must carry the canonical `task-<uuid>`
ID format (02-03 cleanup that propagated to ALL `_build_task_record`
callers).
"""
from __future__ import annotations

import json
import re
from typing import Any

import pytest

from mcp_server.config import MAX_TASKS_PER_DECOMPOSITION, NEXTFLOW_API_URL
from mcp_server.tools.projects import (
    create_project,
    create_project_with_tasks,
    get_project,
    list_projects,
)

pytestmark = pytest.mark.asyncio

STATE_URL = f"{NEXTFLOW_API_URL}/state"
TASK_ID_RE = re.compile(r"^task-[0-9a-f-]{36}$")
PROJECT_ID_RE = re.compile(r"^project-[0-9a-f-]{36}$")
STRIPPED_FIELDS = (
    "_rev", "completionLog", "reference", "completedProjects", "projectActivityLog"
)


def _state(rev: int, *, projects=None, tasks=None) -> dict[str, Any]:
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


def _puts(httpx_mock):
    return [r for r in httpx_mock.get_requests() if r.method == "PUT"]


# ---------------------------------------------------------------------------
# create_project
# ---------------------------------------------------------------------------

async def test_create_project_wire_contract_and_id_format(httpx_mock):
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(80))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 81}
    )

    result = await create_project(name="Sabbatical")

    assert PROJECT_ID_RE.match(result["id"])
    puts = _puts(httpx_mock)
    assert len(puts) == 1
    assert puts[0].headers["If-Match"] == "80"
    body = json.loads(puts[0].content)
    for forbidden in STRIPPED_FIELDS:
        assert forbidden not in body
    assert any(p["name"] == "Sabbatical" for p in body["projects"])


async def test_create_project_rejects_invalid_status_tag():
    with pytest.raises(ValueError, match="statusTag"):
        await create_project(name="x", statusTag="Done")


# ---------------------------------------------------------------------------
# create_project_with_tasks — locks 02-01 atomicity + 02-03 ID propagation
# ---------------------------------------------------------------------------

async def test_create_project_with_tasks_single_put(httpx_mock):
    """Atomicity guarantee: N child tasks + 1 project = exactly ONE
    PUT (not N+1). Without this, `_rev` would advance more than once
    and concurrent browser writes could interleave mid-decomposition."""
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(90))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 91}
    )

    result = await create_project_with_tasks(
        project={"name": "Move apartments"},
        tasks=[
            {"title": "Hire movers"},
            {"title": "Forward mail"},
            {"title": "Cancel utilities"},
        ],
    )

    puts = _puts(httpx_mock)
    assert len(puts) == 1, (
        f"atomic decomposition must issue exactly ONE PUT; got {len(puts)}"
    )
    assert PROJECT_ID_RE.match(result["project_id"])
    assert len(result["task_ids"]) == 3

    body = json.loads(puts[0].content)
    assert len(body["projects"]) == 1
    assert len(body["tasks"]) == 3


async def test_create_project_with_tasks_all_task_ids_canonical(httpx_mock):
    """02-03 cleanup propagated `task-<uuid>` to ALL _build_task_record
    callers, not just create_task. Regress on bare-hex IDs here."""
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(90))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 91}
    )

    await create_project_with_tasks(
        project={"name": "X"},
        tasks=[{"title": "a"}, {"title": "b"}, {"title": "c"}],
    )

    body = json.loads(_puts(httpx_mock)[0].content)
    for t in body["tasks"]:
        assert TASK_ID_RE.match(t["id"]), f"non-canonical task id: {t['id']!r}"
        assert t["projectId"] == body["projects"][0]["id"]


async def test_create_project_with_tasks_atomic_decomposition_cap():
    """50-task hardcap from 02-01. No HTTP traffic — validation runs
    before any I/O, so no httpx_mock fixture is needed."""
    overflow = [{"title": f"t{i}"} for i in range(MAX_TASKS_PER_DECOMPOSITION + 1)]
    with pytest.raises(ValueError, match="max 50 tasks"):
        await create_project_with_tasks(project={"name": "X"}, tasks=overflow)


async def test_create_project_with_tasks_at_cap_succeeds(httpx_mock):
    """Boundary: exactly 50 tasks should be accepted."""
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(90))
    httpx_mock.add_response(
        method="PUT", url=STATE_URL, json={"status": "ok", "_rev": 91}
    )
    cap = [{"title": f"t{i}"} for i in range(MAX_TASKS_PER_DECOMPOSITION)]
    result = await create_project_with_tasks(project={"name": "X"}, tasks=cap)
    assert len(result["task_ids"]) == MAX_TASKS_PER_DECOMPOSITION


async def test_create_project_with_tasks_rejects_empty_task_list():
    with pytest.raises(ValueError, match="at least one task"):
        await create_project_with_tasks(project={"name": "X"}, tasks=[])


async def test_create_project_with_tasks_rejects_empty_task_title():
    with pytest.raises(ValueError, match=r"tasks\[1\].title"):
        await create_project_with_tasks(
            project={"name": "X"},
            tasks=[{"title": "ok"}, {"title": "  "}],
        )


# ---------------------------------------------------------------------------
# list_projects / get_project
# ---------------------------------------------------------------------------

async def test_list_projects_excludes_completed_by_default(httpx_mock):
    state = _state(10, projects=[
        {"id": "project-a", "name": "Active", "statusTag": "Active",
         "areaOfFocus": "Work", "themeTag": None, "deadline": None, "vision": ""},
        {"id": "project-b", "name": "Done", "statusTag": "Completed",
         "areaOfFocus": "Work", "themeTag": None, "deadline": None, "vision": ""},
    ])
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)
    result = await list_projects()
    assert [p["id"] for p in result] == ["project-a"]


async def test_list_projects_include_completed(httpx_mock):
    state = _state(10, projects=[
        {"id": "project-a", "name": "Active", "statusTag": "Active",
         "areaOfFocus": "Work", "themeTag": None, "deadline": None, "vision": ""},
        {"id": "project-b", "name": "Done", "statusTag": "Completed",
         "areaOfFocus": "Work", "themeTag": None, "deadline": None, "vision": ""},
    ])
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)
    result = await list_projects(include_completed=True)
    assert sorted(p["id"] for p in result) == ["project-a", "project-b"]


async def test_get_project_includes_linked_active_tasks(httpx_mock):
    state = _state(10,
        projects=[{"id": "project-a", "name": "X", "statusTag": "Active"}],
        tasks=[
            {"id": "task-1", "title": "linked", "status": "next", "projectId": "project-a"},
            {"id": "task-2", "title": "other", "status": "next", "projectId": "project-other"},
        ],
    )
    httpx_mock.add_response(method="GET", url=STATE_URL, json=state)
    result = await get_project(id="project-a")
    assert result["id"] == "project-a"
    assert [t["id"] for t in result["tasks"]] == ["task-1"]


async def test_get_project_raises_on_missing(httpx_mock):
    httpx_mock.add_response(method="GET", url=STATE_URL, json=_state(10))
    with pytest.raises(ValueError, match="not found"):
        await get_project(id="project-ghost")
