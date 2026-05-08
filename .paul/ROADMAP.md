# Roadmap: nextflow

## Overview

nextflow is a mature self-hosted productivity app. This milestone focuses on quality and completeness — fixing all open bugs, polishing the core interaction flows, and clearing the full feedback backlog. Work proceeds from highest trust-impact (bugs) through the most-used flows (Inbox/Clarify, Projects) to supporting panels and settings.

## Current Milestone

**v1.0 Feedback Clearance & Polish** (v1.0.0)
Status: In progress
Phases: 5 of 7 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Bug Fixes | 1 | Complete | 2026-05-06 |
| 2 | Inbox & Clarify | 2 | Complete | 2026-05-06 |
| 2.5 | Top-Bar Status Sections | 1 | Complete | 2026-05-07 |
| 3 | Projects Panel — UX | 2 | Complete | 2026-05-07 |
| 4 | Projects Panel — Features | 2 | Complete | 2026-05-07 |
| 5 | Active Task Views | 3 | Not started | - |
| 6 | Settings & Misc | 2 | Not started | - |

## Phase Details

### Phase 1: Bug Fixes

**Goal:** Fix all 4 open bugs — restore broken functionality before any polish work begins.
**Depends on:** Nothing (first phase)
**Research:** Unlikely (bugs in existing code)

**Scope:**
- _All originally-scoped items shipped by plan 01-01 and marked resolved in feedback._

**Plans:**
- [ ] 01-01: Fix all 4 open bugs

### Phase 2: Inbox & Clarify

**Goal:** Polish the capture and clarification flow — the highest-frequency interaction in the app.
**Depends on:** Phase 1
**Research:** Unlikely (UI enhancements to existing flow)

**Scope:**
- `0bf1bf88` — Show newly assigned project immediately after assignment
- `160e0923` — Description visible during clarification flyout

**Plans:**
- [ ] 02-01: Inbox & Clarify improvements

### Phase 2.5: Top-Bar Status Sections

**Goal:** Mirror the existing urgent-tasks top bar with two new at-a-glance sections — "My Day" (tasks scheduled or due today) and "Neglected" (top 5 stale tasks).
**Depends on:** Phase 2 (uses task data shape; no Phase 3 dependency)
**Research:** Unlikely (mirrors an existing rendering pattern in `ui.js`)
**Priority:** Top priority — inserted ahead of Phase 3 by user request 2026-05-07.

**Scope:**
- New "My Day" top bar — chips for tasks where `myDayDate == today` OR `dueDate == today`, sorted by `calendarTime` then `updatedAt`, no cap
- New "Neglected" top bar — top 5 active tasks whose `updatedAt` is older than `settings.staleTaskThresholds.stale` days, sorted oldest-first
- Both bars render via `renderAll()` and hide when empty, matching `renderUrgentBar()` behavior

**Plans:**
- [x] 02.5-01: My Day and Neglected top-bar sections — completed 2026-05-07

### Phase 3: Projects Panel — UX

**Goal:** Improve clarity and reduce noise on the Projects panel — naming, affordances, and warning behavior.
**Depends on:** Phase 2.5
**Research:** Unlikely (layout and visual hierarchy work)

**Scope:**
- `1448576c` — Rename "Active Projects" → "Projects" (panel includes all projects, not just active); clarify the add-project area is for adding a new project
- `3ff676c5` — Suppress "no next action" warning on a project when a delegated task exists (delegated work is implicitly "next")

**Plans:**
- [x] 03-01: Projects panel renames and add-project affordance — completed 2026-05-07
- [x] 03-02: Refine "no next action" warning logic — completed 2026-05-07

**Notes:**
- Re-scoped 2026-05-07 after live `GET /feedback` audit. The 2026-05-06 audit incorrectly marked Phase 3 as having zero open scope; two `panel: projects` items were either missed or filed after the audit.
- `483a286b` (rename "Move to waiting" + delegate-to-person) sits on the task flyout, not the Projects panel — left in Phase 5 candidate pool unless surfacing in Phase 3 makes more sense during planning.
- Originally-listed plans (project page layout redesign, filter indicator, stats click, undo completion) were retired with the 2026-05-06 audit; current scope no longer needs them.

### Phase 4: Projects Panel — Features

**Goal:** Implement the larger project-level features: merge, activity log.
**Depends on:** Phase 3
**Research:** Likely (project merge touches sync/merge logic; activity log needs data model decisions)

**Scope:**
- `7868b077` — Project activity/change log

**Plans:**
- [x] 04-01: Project activity log — data layer + emission + tests — completed 2026-05-07
- [x] 04-02: Project activity log — UI surface (project-flyout section) — completed 2026-05-07

**Notes:**
- 2026-05-07: Renumbered plans after `/paul:discover` recommended splitting the work. Original ROADMAP listed only `04-02`; the discovery (HIGH confidence) called out the data/UI split as the de-risked staging path. See `.paul/phases/04-projects-features/DISCOVERY.md`.

### Phase 5: Active Task Views

**Goal:** Improve the Next/Active and Backlog panels — filtering, bulk edit, and UX consistency.
**Depends on:** Phase 4
**Research:** Unlikely

**Scope:**
- `059f0a1e` — Area of Focus in association filters
- `f3d948ce` — Flyout notes and lists always expanded
- `fb700fcc` — Multi-select/bulk edit UX issues (3 sub-items split across 05-01 and 05-03)
- `8dac310e` — Weekly Review → Next Actions page guidance
- `1f7139ee` — Backlog page "resolve all" button
- `2dc7c45a` — Delete/edit context buttons missing

**Plans (per `/paul:discover` recommendation 2026-05-07):**
- [ ] 05-01: Pending Tasks panel polish (`059f0a1e`, `f3d948ce`, `fb700fcc` items 1+2)
- [ ] 05-02: Backlog panel improvements (`8dac310e`, `1f7139ee`, `2dc7c45a`)
- [ ] 05-03: Bulk-edit redesign — draft + Apply/Cancel (`fb700fcc` item 3)

**Notes:**
- 2026-05-07: `bb343993` ("Apply Backlog UX elements to other pages") descoped from this milestone per user request — feedback record stays open for a future milestone but not actively planned here. Deferred-issues list updated.

### Phase 6: Settings & Misc

**Goal:** Settings/onboarding polish and pop-out timer feature.
**Depends on:** Phase 5
**Research:** Unlikely

**Scope:**
- `64227659` — Guided tour / "show me around"
- `b4faaccd` — Rename "Inactive" label on completed tasks
- `981dde72` — "Convert to Project" UX clarification
- `a87a75af` — Pop-out window for "doing" timers

**Plans:**
- [ ] 06-01: Settings & onboarding polish
- [ ] 06-02: Pop-out doing timers

## Deferred (Someday)

Out of scope for this milestone — large-scope features requiring separate planning:

- `943c01b8` — Mobile-friendly dashboard (full mobile pass)
- `346ac587` — Multi-user support
- `fc822ad6` — Task trash bin with 30-day auto-delete
- `3ad1d3e3` — Sleep/snooze task with intervals
- `00b83571` — Shopping list feature
- `5953b8c8` — Email digest summaries
- `21377c43` — Chaining/prerequisite tasks

---
*Roadmap created: 2026-05-06*
*Last updated: 2026-05-06 — Stripped 12 already-resolved items from Phase 1/2/3/4 scope per audit against `data/feedback.json`.*
*Last updated: 2026-05-07 — Re-scoped Phase 3 with `1448576c` and `3ff676c5` after live feedback audit found the 2026-05-06 sweep had over-stripped Phase 3.*
*Last updated: 2026-05-07 — Inserted Phase 2.5 (Top-Bar Status Sections: My Day + Neglected) ahead of Phase 3 by user request. Phase 3 now depends on 2.5.*
*Last updated: 2026-05-07 — Phase 2.5 complete (plan 02.5-01 shipped). 3 of 7 phases done. Phase 3 (Projects Panel — UX) is next.*
*Last updated: 2026-05-07 — Phase 3 complete (plans 03-01, 03-02 shipped). 4 of 7 phases done. Phase 4 (Projects Panel — Features: project activity log) is next.*
*Last updated: 2026-05-07 — Phase 4 split into 04-01 (data + emission + tests) and 04-02 (UI tab) per `/paul:discover` recommendation.*
*Last updated: 2026-05-07 — Phase 4 complete (both plans shipped). 5 of 7 phases done. Phase 5 (Active Task Views) is next.*
