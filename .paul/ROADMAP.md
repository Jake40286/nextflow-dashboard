# Roadmap: nextflow

## Overview

nextflow is a mature self-hosted productivity app. This milestone focuses on quality and completeness — fixing all open bugs, polishing the core interaction flows, and clearing the full feedback backlog. Work proceeds from highest trust-impact (bugs) through the most-used flows (Inbox/Clarify, Projects) to supporting panels and settings.

## Current Milestone

**v1.0 Feedback Clearance & Polish** (v1.0.0)
Status: In progress
Phases: 0 of 6 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Bug Fixes | TBD | In progress | - |
| 2 | Inbox & Clarify | TBD | Planning | - |
| 3 | Projects Panel — UX | TBD | Not started | - |
| 4 | Projects Panel — Features | TBD | Not started | - |
| 5 | Active Task Views | TBD | Not started | - |
| 6 | Settings & Misc | TBD | Not started | - |

## Phase Details

### Phase 1: Bug Fixes

**Goal:** Fix all 4 open bugs — restore broken functionality before any polish work begins.
**Depends on:** Nothing (first phase)
**Research:** Unlikely (bugs in existing code)

**Scope:**
- `88ea7198` — Project Task "Add" button no longer functional
- `cc3779df` — Weekly review live updates: inbox clarify changes not reflecting
- `fb039fa2` — Sync toast covered by feedback button
- `9dd4165f` — Mobile: association filter flyout conflict

**Plans:**
- [ ] 01-01: Fix all 4 open bugs

### Phase 2: Inbox & Clarify

**Goal:** Polish the capture and clarification flow — the highest-frequency interaction in the app.
**Depends on:** Phase 1
**Research:** Unlikely (UI enhancements to existing flow)

**Scope:**
- `0bf1bf88` — Show newly assigned project immediately after assignment
- `160e0923` — Description visible during clarification flyout
- `bb6a0dba` — Clarify menu: add "add to My Day" option in date section
- `c4c05706` — Completion notes for quick (<2 min) tasks in clarification

**Plans:**
- [ ] 02-01: Inbox & Clarify improvements

### Phase 3: Projects Panel — UX

**Goal:** Redesign the project page layout and improve visual clarity across the panel.
**Depends on:** Phase 2
**Research:** Unlikely (layout and visual hierarchy work)

**Scope:**
- `eba74bf6` — Project page layout redesign
- `a8c9f66a` — Project notes visual hierarchy (move higher)
- `7b22e7ce` — Active filter indicator while scrolling
- `c0477361` — Statistics page project click — investigate behavior
- `84e95ceb` — Undo button on task completion (5-second toast)

**Plans:**
- [ ] 03-01: Project page layout redesign
- [ ] 03-02: Filter indicator, stats click, and undo completion

### Phase 4: Projects Panel — Features

**Goal:** Implement the larger project-level features: merge, activity log.
**Depends on:** Phase 3
**Research:** Likely (project merge touches sync/merge logic; activity log needs data model decisions)

**Scope:**
- `1cc10982` — Project merge (combine two projects into one)
- `7868b077` — Project activity/change log

**Plans:**
- [ ] 04-01: Project merge
- [ ] 04-02: Project activity/change log

### Phase 5: Active Task Views

**Goal:** Improve the Next/Active and Backlog panels — filtering, bulk edit, and UX consistency.
**Depends on:** Phase 4
**Research:** Unlikely

**Scope:**
- `059f0a1e` — Area of Focus in association filters
- `f3d948ce` — Flyout notes and lists always expanded
- `fb700fcc` — Multi-select/bulk edit UX issues
- `bb343993` — Apply Backlog UX elements to other pages
- `8dac310e` — Weekly Review → Next Actions page guidance
- `1f7139ee` — Backlog page "resolve all" button
- `2dc7c45a` — Delete/edit context buttons missing

**Plans:**
- [ ] 05-01: Association filters and flyout improvements
- [ ] 05-02: Backlog panel improvements
- [ ] 05-03: Bulk edit UX

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
*Last updated: 2026-05-06*
