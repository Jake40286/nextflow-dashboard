# Roadmap: nextflow

## Overview

nextflow is a mature self-hosted productivity app. With v1.0 polish complete, v1.1 opens the data model to LLM-driven creation through a new MCP (Model Context Protocol) sidecar service. Goal: let any MCP-aware LLM (Claude Desktop, Claude Code, agents on the LAN) create tasks and projects on the user's behalf — including decomposing a vague project description into a project plus a sensible set of tasks — without breaking the optimistic-locking sync model that v1.0 relies on.

## Current Milestone

**v1.1 MCP Integration** (v1.1.0)
Status: 🚧 In Progress
Phases: 1 of 3 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | MCP Feasibility & PoC | 01-01, 01-02 | Complete | 2026-05-08 |
| 2 | MCP Server — Full Tool Surface | TBD | Not started | - |
| 3 | Safety, Audit & Security Hardening | TBD | Not started | - |

## Phase Details

### Phase 1: MCP Feasibility & PoC

**Goal:** Decide whether MCP-in-Python is the right fit for nextflow, then prove it with a walking-skeleton PoC that creates one task end-to-end through the existing `PUT /state` path.
**Depends on:** Nothing (first phase of v1.1)
**Research:** Required (this phase IS the research)

**Scope:**
- Survey the Python MCP landscape: official `mcp` SDK vs. hand-rolled JSON-RPC over HTTP/SSE; maturity, license, dependency footprint, transport options.
- Decide sidecar shape: Python image, port assignment, how it shares the `data/` volume (or whether it talks to the main app via HTTP only).
- Prototype: a minimal MCP server exposing one tool (`create_task`) that succeeds end-to-end through `PUT /state` with `If-Match: <rev>` and is reachable from Claude Desktop or Claude Code.
- Document the auth posture decision (localhost-only? shared secret? deferred to Phase 3?).
- **Exit criterion:** go/no-go decision with a working PoC. If MCP-in-Python proves impractical, the milestone re-scopes or pauses rather than forcing the build.

**Plans:**
- [x] 01-01: MCP feasibility research — DECISIONS.md produced (verdict: **GO**); see `.paul/phases/01-mcp-feasibility/01-01-SUMMARY.md` — completed 2026-05-08
- [x] 01-02: Walking-skeleton PoC — sidecar shipped, `create_task` tool live, smoke-tested end-to-end; see `.paul/phases/01-mcp-feasibility/01-02-SUMMARY.md` — completed 2026-05-08

**Notes:**
- This phase is intentionally a feasibility gate. The PoC investment is small so a no-go answer is cheap.
- The phase may surface a natural alignment between MCP tool schemas and a `data.js` extraction (e.g., shared GTD constants). If so, a clean JS-file split could escalate into scope; otherwise, leave structure alone.

### Phase 2: MCP Server — Full Tool Surface

**Goal:** Promote the PoC to production. Expose the full read + write + atomic decomposition tool surface so an LLM can drive nextflow safely and idiomatically.
**Depends on:** Phase 1
**Research:** Unlikely (Phase 1 produces the answers)

**Scope:**
- Write tools: `create_task`, `create_project`, `create_project_with_tasks` (atomic project + N tasks in one `PUT /state`).
- Read tools: `list_tasks`, `list_projects`, `get_task`, `get_project` with filters (by status, by project, by area).
- Light update tools: `update_task_status`, `set_task_project`, possibly `add_task_note`.
- LLM-author tagging on every write (single new field, e.g. `_source: "mcp"`, to keep merge code untouched).
- Rich tool-schema descriptions for GTD-specific fields (status / contexts / areaOfFocus / peopleTags / effortLevel / timeRequired) — explain meaning and enums inline so LLM-generated tasks are semantically accurate, not just structurally valid.
- 409-conflict retry loop matching the JS client's behavior (re-merge + retry, capped).

**Plans:**
- [ ] 02-01: TBD (defined during /paul:plan)

### Phase 3: Safety, Audit & Security Hardening

**Goal:** Make the MCP surface safe for daily-driver use.
**Depends on:** Phase 2
**Research:** Unlikely

**Scope:**
- Optional `dry_run` flag on mutating tools — returns the diff without writing.
- Rate-limit / batch-cap on `create_project_with_tasks` (LLM hallucinations can produce 100-task lists).
- Settings UI: "view LLM-created items" filter for audit + bulk-undo of any MCP-created entries.
- README + in-app docs documenting **LAN-only default + reverse-proxy-with-TLS guidance** for any internet exposure (explicit "do not expose without TLS termination" warning).
- Auth model decision: shared secret? bearer token? localhost-only bind? Decision deferred from Phase 1, finalized here once transport reality is known.

**Plans:**
- [ ] 03-01: TBD (defined during /paul:plan)

## Deferred (Someday)

Out of scope for this milestone — large-scope features requiring separate planning:

- **Feedback panel removal** — Strip the in-app feedback page (UI + backend endpoints + `data/feedback.json`) now that GitHub Issues is the system of record. Touches `app/server.py` (`/feedback` CRUD), `app/web_ui/` (feedback panel HTML/JS), and the settings-panel admin list (`loadFeedbackList()` in `ui.js`). Polish-shaped, fits naturally as a later v1.x milestone or as a final phase if v1.1 finishes early. Prerequisite: confirm no automation depends on `GET /feedback`.
- **JS file restructure** — `ui.js` and `data.js` are getting long; consider splitting into more purpose-driven modules. Adjacent to v1.1 (MCP tool schemas may want to share constants with `data.js`); only escalate into scope if Phase 1 surfaces a clean alignment.
- **Internet-exposure / mature auth** — multi-user, OAuth, or any "expose this app to the public internet" features. Wait until auth + audit are mature.
- `943c01b8` — Mobile-friendly dashboard (full mobile pass)
- `346ac587` — Multi-user support
- `fc822ad6` — Task trash bin with 30-day auto-delete
- `3ad1d3e3` — Sleep/snooze task with intervals
- `00b83571` — Shopping list feature
- `5953b8c8` — Email digest summaries
- `21377c43` — Chaining/prerequisite tasks
- `8daaf79a` — Complete-with-options modal + chained follow-up tasks + "Graph View" (obsidian-style task graph)
- `64227659` — Guided tour / "show me around" (deferred from v1.0 Phase 6)
- `a87a75af` — Pop-out window for "doing" timers (deferred from v1.0 Phase 6)
- `1f7139ee` — Backlog page "resolve all" button (deferred from v1.0 Phase 5)
- `bb343993` — Apply Backlog UX elements to other pages (deferred from v1.0)

---

## Previous Milestones

### v1.0 Feedback Clearance & Polish — Complete (2026-05-07)

7 phases shipped: Bug Fixes, Inbox & Clarify, Top-Bar Status Sections (My Day + Neglected), Projects Panel UX, Projects Panel Features (activity log), Active Task Views (bulk-edit redesign + filters), Settings & Misc (Inactive→Completed, Convert-to-Project carry-over). Closing commit `05d1fb1`. Full historical detail preserved in git history; phase directories under `.paul/phases/01-bug-fixes/` … `06-settings-misc/`.

---

*Roadmap created: 2026-05-06*
*Last updated: 2026-05-07 — v1.0 complete (7 of 7 phases shipped).*
*Last updated: 2026-05-08 — v1.1 MCP Integration milestone created. Phase 1 is a feasibility gate (research + walking-skeleton PoC); Phase 2 is the full server; Phase 3 is safety + security hardening. v1.0 collapsed into Previous Milestones section.*
*Last updated: 2026-05-08 — Phase 1 complete (both plans shipped). 1 of 3 phases done. Walking-skeleton sidecar live and smoke-tested. Phase 2 (Full Tool Surface) is next.*
