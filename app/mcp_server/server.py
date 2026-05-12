"""FastMCP instance + entry point for the nextflow MCP sidecar.

The singleton ``mcp`` instance is defined here. Tool modules import it
and register tools via ``@mcp.tool()`` decorators; ``main()`` triggers
those imports so that registration happens on launch.
"""
from __future__ import annotations

import sys

from mcp.server.fastmcp import FastMCP

from .config import MCP_HOST, MCP_PORT, NEXTFLOW_API_URL

mcp = FastMCP("nextflow")


def main() -> None:
    # Importing the tool modules runs their @mcp.tool() decorators and
    # registers all tools against the singleton above. Import here (not
    # at module top) so that callers who only need the FastMCP handle
    # (e.g. tests) don't pay the registration cost.
    from .tools import projects, tasks  # noqa: F401

    print(
        f"MCP server listening on {MCP_HOST}:{MCP_PORT} "
        f"(NEXTFLOW_API_URL={NEXTFLOW_API_URL})",
        flush=True,
    )
    mcp.settings.host = MCP_HOST
    mcp.settings.port = MCP_PORT
    try:
        mcp.run(transport="streamable-http")
    except KeyboardInterrupt:
        print("Shutting down MCP server", file=sys.stderr)
