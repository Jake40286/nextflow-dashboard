"""Task entity MCP tools.

Tools: create_task, list_tasks, get_task, update_task_status,
set_task_project, add_task_note.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..config import HTTP_TIMEOUT, TASK_STATUSES
from ..server import mcp
from ..state_helpers import (
    _build_task_record,
    _new_note_id,
    _public_task,
    _task_summary,
    _update_task_in_state,
)
from ..sync import _fetch_state, _now_iso, _write_state_with_retry


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
    if status not in TASK_STATUSES:
        raise ValueError(
            f"status must be one of {TASK_STATUSES}; got {status!r}"
        )

    new_task = _build_task_record(
        title=title,
        status=status,
        description="",
        contexts=[],
        peopleTags=[],
        project_id=None,
    )
    # create_task historically does not set projectId at all (vs leaving
    # it None); drop the key to preserve the prior on-disk shape.
    new_task.pop("projectId", None)

    def _append_task(state: dict[str, Any]) -> dict[str, Any]:
        tasks = list(state.get("tasks") or [])
        tasks.append(new_task)
        return {**state, "tasks": tasks}

    result = await _write_state_with_retry(_append_task)
    return {"id": new_task["id"], "_rev": result.get("_rev")}


@mcp.tool()
async def list_tasks(
    status: str = "",
    project_id: str = "",
    context: str = "",
    areaOfFocus: str = "",
) -> list[dict[str, Any]]:
    """List active nextflow tasks. Use this BEFORE creating a task to avoid
    duplicates, or to find tasks that match a current GTD context (e.g.
    "show me everything I can do at the office").

    Completed tasks are NOT returned — they live in `completionLog`, which
    is queried separately. Only currently-active tasks (those still in
    `state.tasks`) appear here.

    Args:
        status: Filter by task status. One of "inbox", "next", "doing",
            "waiting", "someday". Empty string (default) means no
            constraint on status.
        project_id: Filter to tasks linked to a specific project. Use
            list_projects to discover project ids. Empty string means
            no constraint.
        context: Filter to tasks tagged with a physical/situational
            context like "@Phone", "@Home", "@Errands", "@Office".
            Match is membership in `task.contexts`. Empty string means
            no constraint.
        areaOfFocus: Filter by life-domain (e.g. "Work", "Personal",
            "Home", "Finance", "Health" — or any custom area the user
            has configured). Empty string means no constraint.

    All non-empty filters combine with logical AND.

    Returns:
        Array of task summaries. Each entry includes (when non-empty):
        `id`, `title`, `status`, `projectId`, `contexts`, `peopleTags`,
        `areaOfFocus`, `dueDate`, `followUpDate`. Internal sync fields
        (`_fieldTimestamps`, `_source`, etc.) are stripped. For full
        details including notes and listItems, call `get_task(id)`.
    """
    if status and status not in TASK_STATUSES:
        raise ValueError(
            f"status must be one of {TASK_STATUSES} or empty; got {status!r}"
        )

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        state = await _fetch_state(client)
    tasks = state.get("tasks") or []

    def matches(t: dict[str, Any]) -> bool:
        if status and t.get("status") != status:
            return False
        if project_id and t.get("projectId") != project_id:
            return False
        if context and context not in (t.get("contexts") or []):
            return False
        if areaOfFocus and t.get("areaOfFocus") != areaOfFocus:
            return False
        return True

    return [_task_summary(t) for t in tasks if matches(t)]


@mcp.tool()
async def get_task(id: str) -> dict[str, Any]:
    """Get full details for one task, including all notes and listItems.

    Args:
        id: The task id. Get this from list_tasks or from a previous
            create_task / create_project_with_tasks call.

    Returns:
        The full task record (excluding internal sync fields), with
        `notes` and `listItems` arrays included verbatim.

    Raises:
        ValueError if no task with that id exists.
    """
    if not id:
        raise ValueError("id is required")
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        state = await _fetch_state(client)
    tasks = state.get("tasks") or []
    task = next((t for t in tasks if t.get("id") == id), None)
    if task is None:
        raise ValueError(f"Task {id!r} not found")
    public = _public_task(task)
    # Ensure notes/listItems are always arrays in the response, even if
    # absent on the source record.
    public.setdefault("notes", [])
    public.setdefault("listItems", [])
    return public


@mcp.tool()
async def update_task_status(id: str, status: str) -> dict[str, Any]:
    """Change a task's status — e.g. promote an inbox item to "next",
    start "doing" a task, or move it to "waiting"/"someday".

    Note: "completed" is NOT a valid status here. Completing a task is
    a different lifecycle event that moves the record from `state.tasks`
    into `completionLog`; it requires a future tool that doesn't exist
    yet. For now, status changes stay within the active enum.

    Args:
        id: The task id (use list_tasks or get_task to find it).
        status: One of "inbox", "next", "doing", "waiting", "someday".

    Returns:
        `{"id": <task_id>, "status": <new status>, "_rev": <int>}`.

    Raises:
        ValueError if status is invalid or the task is not found.
    """
    if not id:
        raise ValueError("id is required")
    if status not in TASK_STATUSES:
        raise ValueError(
            f"status must be one of {TASK_STATUSES}; got {status!r}"
        )

    def _set_status(task: dict[str, Any]) -> dict[str, Any]:
        task["status"] = status
        # Per MERGE_FIELD_GROUPS in data.js, "status" lives in the "status"
        # field-group. Bumping its timestamp is what makes this MCP-side
        # change survive a concurrent browser PUT during merge.
        ts = dict(task.get("_fieldTimestamps") or {})
        ts["status"] = _now_iso()
        task["_fieldTimestamps"] = ts
        return task

    def _mutate(state: dict[str, Any]) -> dict[str, Any]:
        return _update_task_in_state(state, id, _set_status)

    result = await _write_state_with_retry(_mutate)
    return {"id": id, "status": status, "_rev": result.get("_rev")}


@mcp.tool()
async def set_task_project(id: str, project_id: str = "") -> dict[str, Any]:
    """Link or unlink a task from a project.

    Args:
        id: The task id.
        project_id: The target project id (e.g. "project-<uuid>"). Pass
            an empty string to unlink the task (set projectId to null).
            If a non-empty project_id is given, it must reference an
            existing project; otherwise a ValueError is raised. Use
            list_projects to discover existing project ids, or
            create_project to add a new one first.

    Returns:
        `{"id": <task_id>, "projectId": <new value or null>,
          "_rev": <int>}`.

    Raises:
        ValueError if the task is not found or the target project does
        not exist.
    """
    if not id:
        raise ValueError("id is required")
    target = (project_id or "").strip() or None

    # Validate target project exists (read-only fetch; mutation will
    # re-fetch under the lock when actually writing).
    if target is not None:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            preview_state = await _fetch_state(client)
        projects = preview_state.get("projects") or []
        if not any(p.get("id") == target for p in projects):
            raise ValueError(
                f"Project {target!r} not found; use list_projects to see "
                f"existing projects, or create_project to add a new one"
            )

    def _set_project(task: dict[str, Any]) -> dict[str, Any]:
        task["projectId"] = target
        # projectId is not in MERGE_FIELD_GROUPS — only `updatedAt` is
        # bumped (handled by _update_task_in_state) so the whole-task
        # LWW path picks up the change.
        return task

    def _mutate(state: dict[str, Any]) -> dict[str, Any]:
        return _update_task_in_state(state, id, _set_project)

    result = await _write_state_with_retry(_mutate)
    return {"id": id, "projectId": target, "_rev": result.get("_rev")}


@mcp.tool()
async def add_task_note(id: str, text: str) -> dict[str, Any]:
    """Append a note to a task. Use this to record context the user
    mentioned ("tried calling at 3pm — voicemail"), reference links,
    decisions, or any free-form annotation.

    This APPENDS only — it never edits or deletes existing notes. The
    new note carries its own id and is merged via per-item LWW on the
    browser side, so concurrent additions from multiple devices all
    survive.

    Args:
        id: The task id.
        text: The note body. Must be non-empty after stripping
            whitespace.

    Returns:
        `{"id": <task_id>, "note_id": <new note id>, "_rev": <int>}`.

    Raises:
        ValueError if `text` is empty/whitespace-only or the task is
        not found.
    """
    if not id:
        raise ValueError("id is required")
    trimmed = (text or "").strip()
    if not trimmed:
        raise ValueError("text is required and cannot be empty or whitespace-only")

    now = _now_iso()
    new_note = {
        "id": _new_note_id(),
        "text": trimmed,
        "createdAt": now,
        "updatedAt": now,
        "_source": "mcp",
    }

    def _append_note(task: dict[str, Any]) -> dict[str, Any]:
        existing = list(task.get("notes") or [])
        task["notes"] = [*existing, new_note]
        return task

    def _mutate(state: dict[str, Any]) -> dict[str, Any]:
        return _update_task_in_state(state, id, _append_note)

    result = await _write_state_with_retry(_mutate)
    return {"id": id, "note_id": new_note["id"], "_rev": result.get("_rev")}
