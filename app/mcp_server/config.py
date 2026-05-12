"""Module-level configuration for the nextflow MCP sidecar.

Env vars and constants only — no I/O, no SDK imports. Safe to import
from anywhere in the package without side effects.
"""
from __future__ import annotations

import os

import httpx

NEXTFLOW_API_URL = os.getenv("NEXTFLOW_API_URL", "http://web:8000").rstrip("/")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))
MAX_RETRIES = 3
HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

PROJECT_AREAS = ("Work", "Personal", "Home", "Finance", "Health")
PROJECT_THEMES = ("Networking", "DevOps", "Automations", "Family", "Admin", "Research")
PROJECT_STATUSES = ("Active", "OnHold", "Completed")

TASK_STATUSES = ("inbox", "next", "doing", "waiting", "someday")
MAX_TASKS_PER_DECOMPOSITION = 50

_TASK_INTERNAL_FIELDS = ("_fieldTimestamps", "_source", "slug", "originDevice", "originDeviceId")
_TASK_SUMMARY_FIELDS = (
    "id", "title", "status", "projectId", "contexts", "peopleTags",
    "areaOfFocus", "dueDate", "followUpDate",
)
