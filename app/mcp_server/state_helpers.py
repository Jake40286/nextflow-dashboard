"""Pure synchronous transformers over state/task/project dicts.

No I/O — these helpers run inside `mutate_fn` callbacks passed to
`sync._write_state_with_retry` (and in read-only tools that build
public-facing summaries).
"""
from __future__ import annotations

import uuid as _uuid
from typing import Any

from .config import (
    PROJECT_AREAS,
    _TASK_INTERNAL_FIELDS,
    _TASK_SUMMARY_FIELDS,
)
from .sync import _now_iso


def _new_project_id() -> str:
    """Match data.js's generateId('project') -> 'project-<uuid4>' format."""
    return f"project-{_uuid.uuid4()}"


def _new_note_id() -> str:
    """Match data.js's generateId('note') -> 'note-<uuid4>' format."""
    return f"note-{_uuid.uuid4()}"


def _build_project_record(
    *,
    name: str,
    vision: str,
    areaOfFocus: str,
    themeTag: str,
    statusTag: str,
    deadline: str,
) -> dict[str, Any]:
    """Build a project dict matching data.js's addProject shape (data.js:2266-2280),
    plus `_source: "mcp"` for audit. Caller is responsible for prior validation."""
    now = _now_iso()
    return {
        "id": _new_project_id(),
        "name": name,
        "vision": vision,
        "status": "active",          # lifecycle field — JS uses lowercase
        "owner": "",
        "tags": [],
        "tasks": [],                  # vestigial; tasks link via task.projectId
        "isExpanded": True,
        "someday": False,
        "areaOfFocus": areaOfFocus or PROJECT_AREAS[0],
        "themeTag": themeTag or None,
        "statusTag": statusTag,       # GTD enum: Active | OnHold | Completed
        "deadline": deadline or None,
        "updatedAt": now,
        "_source": "mcp",
    }


def _build_task_record(
    *,
    title: str,
    status: str,
    description: str,
    contexts: list[str],
    peopleTags: list[str],
    project_id: str | None = None,
) -> dict[str, Any]:
    """Build a task dict in the minimal-but-complete shape — JS merge will
    fill any missing default fields on the next browser sync (proven in
    01-02). Always sets `_source: "mcp"`. Task ID format is `task-<uuid>`
    matching `data.js generateId('task')` (consistency cleanup from 02-01)."""
    now = _now_iso()
    return {
        "id": f"task-{_uuid.uuid4()}",
        "title": title,
        "status": status,
        "description": description,
        "notes": [],
        "contexts": list(contexts or []),
        "peopleTags": list(peopleTags or []),
        "projectId": project_id,
        "createdAt": now,
        "updatedAt": now,
        "_fieldTimestamps": {},
        "_source": "mcp",
    }


def _project_summary(project: dict[str, Any], tasks: list[dict[str, Any]]) -> dict[str, Any]:
    """Public-facing project summary for list_projects. Hides internal fields
    (`_fieldTimestamps`, `_source`, `tasks`-vestigial-array, `isExpanded`).
    `taskCount` reflects the number of NOT-YET-COMPLETED tasks linked via
    task.projectId — completed tasks live in the separate completionLog,
    not in state.tasks, so a simple match is correct."""
    pid = project.get("id")
    return {
        "id": pid,
        "name": project.get("name"),
        "statusTag": project.get("statusTag"),
        "areaOfFocus": project.get("areaOfFocus"),
        "themeTag": project.get("themeTag"),
        "deadline": project.get("deadline"),
        "vision": project.get("vision"),
        "taskCount": sum(1 for t in tasks if t.get("projectId") == pid),
    }


def _task_summary(task: dict[str, Any]) -> dict[str, Any]:
    """Public-facing task summary for list_tasks. Drops internal sync fields
    and any null/empty values to keep LLM context tight."""
    summary: dict[str, Any] = {}
    for field in _TASK_SUMMARY_FIELDS:
        value = task.get(field)
        if value in (None, "", [], {}):
            continue
        summary[field] = value
    # `id` and `title` always present even if empty (shouldn't happen, but
    # we don't want a malformed task to vanish from results silently).
    summary.setdefault("id", task.get("id"))
    summary.setdefault("title", task.get("title"))
    return summary


def _public_task(task: dict[str, Any]) -> dict[str, Any]:
    """Full task record minus internal sync fields. Used by get_task."""
    return {k: v for k, v in task.items() if k not in _TASK_INTERNAL_FIELDS}


def _update_task_in_state(
    state: dict[str, Any],
    task_id: str,
    mutator,
) -> dict[str, Any]:
    """Find task `task_id` in `state["tasks"]`, run `mutator(task) -> task`,
    bump `task.updatedAt`, and return a new state dict with the updated
    task list. Raises ValueError if the task is not found.

    `mutator` MUST return the updated task dict (it can mutate in place
    and return it; the helper rebuilds the tasks list around the result)."""
    tasks = list(state.get("tasks") or [])
    idx = next((i for i, t in enumerate(tasks) if t.get("id") == task_id), -1)
    if idx == -1:
        raise ValueError(f"Task {task_id!r} not found")
    # Shallow-copy the target task so the mutator's in-place writes don't
    # leak back into the original `state` dict the caller fetched.
    task = dict(tasks[idx])
    updated = mutator(task)
    updated["updatedAt"] = _now_iso()
    tasks[idx] = updated
    return {**state, "tasks": tasks}
