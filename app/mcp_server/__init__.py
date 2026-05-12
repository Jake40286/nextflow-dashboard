"""nextflow MCP sidecar package.

Tool registration happens via explicit imports inside ``server.main()``
so that submodule importers (tests, REPL, ad-hoc inspection) don't pay
the side-effect cost of registering all tools just to read config.
"""
