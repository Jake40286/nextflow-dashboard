"""Shared pytest plumbing for the MCP server suite.

Adds `/app` to sys.path so `from mcp_server.sync import ...` resolves the
same way it does inside the sidecar container, registers the
`--integration` opt-in flag, and provides a `mock_state` fixture used by
the wire-contract tests.
"""
from __future__ import annotations

import os
import sys
from typing import Any

import pytest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_APP_DIR = os.path.join(_REPO_ROOT, "app")
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--integration",
        action="store_true",
        default=False,
        help="Run integration tests that require `docker compose up -d`.",
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "integration: requires a live `docker compose up -d` stack; "
        "skipped unless --integration is passed.",
    )


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    if config.getoption("--integration"):
        return
    skip_integration = pytest.mark.skip(reason="needs --integration flag")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


@pytest.fixture
def mock_state() -> dict[str, Any]:
    """Minimal valid state dict suitable as a `_fetch_state` return value.

    Includes the completion fields so tests can assert they are stripped
    from the outbound PUT body (AC-2).
    """
    return {
        "_rev": 42,
        "tasks": [],
        "projects": [],
        "settings": {
            "peopleOptions": [],
            "contextOptions": [],
            "areaOptions": [],
            "_fieldTimestamps": {},
        },
        "_tombstones": {},
        "completionLog": [{"id": "old-completion", "title": "stale"}],
        "reference": [],
        "completedProjects": [],
        "projectActivityLog": [],
    }
