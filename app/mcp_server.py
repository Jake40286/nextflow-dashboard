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


PROJECT_AREAS = ("Work", "Personal", "Home", "Finance", "Health")
PROJECT_THEMES = ("Networking", "DevOps", "Automations", "Family", "Admin", "Research")
PROJECT_STATUSES = ("Active", "OnHold", "Completed")


def _new_project_id() -> str:
    """Match data.js's generateId('project') -> 'project-<uuid4>' format."""
    return f"project-{_uuid.uuid4()}"


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


@mcp.tool()
async def create_project(
    name: str,
    vision: str = "",
    areaOfFocus: str = "",
    themeTag: str = "",
    statusTag: str = "Active",
    deadline: str = "",
) -> dict[str, Any]:
    """Create a new nextflow project. Use this BEFORE creating tasks under
    the project — unless you're using create_project_with_tasks to do it
    atomically.

    Args:
        name: The project name (required, non-empty). Shown in the Projects
            panel and elsewhere in the UI.
        vision: The "why" / outcome statement for the project — what does
            "done" look like, or what does success enable? Optional but
            strongly encouraged for any non-trivial project. Lands in the
            project's `vision` field.
        areaOfFocus: One of the user's life-domains. Canonical values:
            "Work", "Personal", "Home", "Finance", "Health". The user can
            also have custom areas configured (free-form strings are
            accepted). Defaults to "Work" if omitted.
        themeTag: Work-style or category tag. Canonical values:
            "Networking", "DevOps", "Automations", "Family", "Admin",
            "Research". Custom values accepted. Defaults to None.
        statusTag: GTD project lifecycle. Closed enum, one of:
            "Active" (default — being worked on), "OnHold" (paused; will
            resume later), "Completed" (done; archived).
        deadline: Optional target date for the project, ISO 8601 format
            "YYYY-MM-DD". Defaults to None.

    Returns:
        `{"id": "<project-id>", "_rev": <new server rev>}`.
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("name is required and cannot be empty")
    if statusTag not in PROJECT_STATUSES:
        raise ValueError(
            f"statusTag must be one of {PROJECT_STATUSES}; got {statusTag!r}"
        )

    new_project = _build_project_record(
        name=name,
        vision=vision.strip(),
        areaOfFocus=areaOfFocus.strip(),
        themeTag=themeTag.strip(),
        statusTag=statusTag,
        deadline=deadline.strip(),
    )

    def _append_project(state: dict[str, Any]) -> dict[str, Any]:
        projects = list(state.get("projects") or [])
        projects.append(new_project)
        return {**state, "projects": projects}

    result = await _write_state_with_retry(_append_project)
    return {"id": new_project["id"], "_rev": result.get("_rev")}


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


@mcp.tool()
async def list_projects(include_completed: bool = False) -> list[dict[str, Any]]:
    """List nextflow projects. Use this BEFORE creating a project to avoid
    duplicates — the user may have a project with a similar name already.

    Args:
        include_completed: When False (default), projects with
            `statusTag == "Completed"` are excluded. Set to True to see
            completed projects too.

    Returns:
        Array of project summaries. Each entry has:
        `id`, `name`, `statusTag`, `areaOfFocus`, `themeTag`, `deadline`,
        `vision`, and `taskCount` (number of currently-active tasks
        linked to this project).
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        state = await _fetch_state(client)
    projects = state.get("projects") or []
    tasks = state.get("tasks") or []
    summaries = [_project_summary(p, tasks) for p in projects]
    if not include_completed:
        summaries = [s for s in summaries if s.get("statusTag") != "Completed"]
    return summaries


@mcp.tool()
async def get_project(id: str) -> dict[str, Any]:
    """Get full details for one project, including all tasks linked to it.

    Args:
        id: The project id (e.g. "project-<uuid>"). Get this from
            list_projects or from a previous create_project call.

    Returns:
        The full project record (excluding internal sync fields) PLUS a
        `tasks` array containing every active task where
        `task.projectId == id`. Each task entry has `id`, `title`,
        `status`. Completed/archived tasks are NOT included (they live
        in completionLog, queryable separately if needed).

    Raises:
        ValueError if no project with that id exists. The LLM caller
        sees this as a tool error.
    """
    if not id:
        raise ValueError("id is required")
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        state = await _fetch_state(client)
    projects = state.get("projects") or []
    project = next((p for p in projects if p.get("id") == id), None)
    if project is None:
        raise ValueError(f"Project {id!r} not found")
    tasks = state.get("tasks") or []
    linked_tasks = [
        {"id": t.get("id"), "title": t.get("title"), "status": t.get("status")}
        for t in tasks
        if t.get("projectId") == id
    ]
    # Drop internal sync fields from the project response.
    public = {
        k: v for k, v in project.items()
        if k not in ("_fieldTimestamps", "_source", "tasks")
    }
    public["tasks"] = linked_tasks
    return public


MAX_TASKS_PER_DECOMPOSITION = 50
TASK_STATUSES = ("inbox", "next", "doing", "waiting", "someday")


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
    01-02). Always sets `_source: "mcp"`."""
    now = _now_iso()
    return {
        "id": _uuid.uuid4().hex,
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


@mcp.tool()
async def create_project_with_tasks(
    project: dict[str, Any],
    tasks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Atomically create a new project and its initial child tasks in a
    single state transaction. Use this when the user describes a goal
    that needs to be decomposed into a project plus next-action tasks
    (e.g., "plan a vacation", "set up the new home office",
    "onboard the new contractor").

    The tasks default to status="next" because they are explicit next
    actions of a planned project, not unprocessed inbox items. If the
    user wants a task in a different status (waiting, someday, doing,
    or inbox), set it explicitly per task.

    Atomicity guarantee: a single PUT to the underlying state — `_rev`
    advances by exactly one, regardless of how many tasks are created.
    Either the whole project + all tasks land, or nothing does (and a
    409 conflict is retried up to 3 times).

    Args:
        project: A dict with the project fields:
            `name` (str, required, non-empty)
            `vision` (str, optional — "why" / outcome statement)
            `areaOfFocus` (str, optional — Work | Personal | Home |
                Finance | Health, or a custom user-defined area)
            `themeTag` (str, optional — Networking | DevOps |
                Automations | Family | Admin | Research, or custom)
            `statusTag` (str, optional, default "Active" — Active |
                OnHold | Completed)
            `deadline` (str, optional — ISO 8601 "YYYY-MM-DD")
        tasks: A list of 1 to 50 task dicts. Each task dict has:
            `title` (str, required, non-empty)
            `status` (str, optional, default "next" — inbox | next |
                doing | waiting | someday)
            `description` (str, optional)
            `contexts` (list[str], optional — physical/situational
                contexts like "@Phone", "@Home", "@Errands")
            `peopleTags` (list[str], optional — people-tags like
                "+Alyssa_Smith")

    Returns:
        `{"project_id": "<id>", "task_ids": [...], "_rev": <int>}`.
        The `task_ids` array is in the same order as the input `tasks`
        list.

    Raises:
        ValueError on validation failure (empty project name; empty
        task list; >50 tasks; invalid status enum; empty task title).
    """
    # Validate project
    if not isinstance(project, dict):
        raise ValueError("project must be a dict")
    project_name = (project.get("name") or "").strip()
    if not project_name:
        raise ValueError("project.name is required and cannot be empty")
    project_status = project.get("statusTag", "Active")
    if project_status not in PROJECT_STATUSES:
        raise ValueError(
            f"project.statusTag must be one of {PROJECT_STATUSES}; got {project_status!r}"
        )

    # Validate tasks
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("at least one task required")
    if len(tasks) > MAX_TASKS_PER_DECOMPOSITION:
        raise ValueError(
            f"max {MAX_TASKS_PER_DECOMPOSITION} tasks per atomic decomposition; "
            f"got {len(tasks)}. Split into multiple calls."
        )
    for i, t in enumerate(tasks):
        if not isinstance(t, dict):
            raise ValueError(f"tasks[{i}] must be a dict")
        if not (t.get("title") or "").strip():
            raise ValueError(f"tasks[{i}].title is required and cannot be empty")
        t_status = t.get("status", "next")
        if t_status not in TASK_STATUSES:
            raise ValueError(
                f"tasks[{i}].status must be one of {TASK_STATUSES}; got {t_status!r}"
            )

    # Build the new project
    new_project = _build_project_record(
        name=project_name,
        vision=(project.get("vision") or "").strip(),
        areaOfFocus=(project.get("areaOfFocus") or "").strip(),
        themeTag=(project.get("themeTag") or "").strip(),
        statusTag=project_status,
        deadline=(project.get("deadline") or "").strip(),
    )
    new_project_id = new_project["id"]

    # Build all new tasks linked to the new project
    new_tasks = [
        _build_task_record(
            title=(t.get("title") or "").strip(),
            status=t.get("status", "next"),
            description=(t.get("description") or "").strip(),
            contexts=t.get("contexts") or [],
            peopleTags=t.get("peopleTags") or [],
            project_id=new_project_id,
        )
        for t in tasks
    ]

    def _atomic_append(state: dict[str, Any]) -> dict[str, Any]:
        projects = list(state.get("projects") or [])
        projects.append(new_project)
        existing_tasks = list(state.get("tasks") or [])
        existing_tasks.extend(new_tasks)
        return {**state, "projects": projects, "tasks": existing_tasks}

    result = await _write_state_with_retry(_atomic_append)
    return {
        "project_id": new_project_id,
        "task_ids": [t["id"] for t in new_tasks],
        "_rev": result.get("_rev"),
    }


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
