---
phase: 04-projects-features
topic: Project activity / change log — data model, persistence, event emission, UI surface
depth: standard
confidence: HIGH
created: 2026-05-07
---

# Discovery: Project Activity / Change Log

**Recommendation:** Add a `projectActivityLog` collection to the existing `completed.json` split-persistence file. Emit MVP event types (status changes, project assignment changes, task lifecycle events, project lifecycle events) from the existing mutation paths in `data.js`. Lazy-load via `ensureCompletedLoaded()` — only fetched when a project's activity is viewed. Surface in a new tab inside the project flyout. Suggest splitting Phase 4 into TWO plans (04-01 = data + emission + tests, 04-02 = UI surface) for safer staging.

**Confidence:** HIGH — Recommendation reuses three already-proven codebase patterns (split persistence, server-merged accumulator, lazy-load via `ensureCompletedLoaded`). The feedback record itself explicitly bounds scope ("status of tasks... should be logged" / "I wouldn't want some information to become permanent, like notes").

## Objective

Phase 4's only ROADMAP item is feedback `7868b077` — "Project activity/change log." Before planning, we needed to answer:

- What event types should be logged? (Feedback hints: status changes yes, notes no.)
- Where should activity entries be persisted? (Inline `state.json`? Separate file? Existing op log?)
- How should sync handle them? (LWW? Append-only accumulator? Conflict-free merge?)
- How bounded should the log be? (Cap entries? Time-prune? Unbounded?)
- What's the UI surface? (Modal? Tab in project flyout? Side panel?)
- Can the work fit in one plan or should it split?

## Scope

**Include:**
- Survey of existing change-tracking infrastructure in this codebase (op log, completionLog, `_fieldTimestamps`, tombstones)
- Three architectural options for the activity-log persistence + emission
- Event-type set for MVP based on feedback wording
- Plan-splitting recommendation

**Exclude:**
- UI design specifics (which tab vs. modal, copy/styling) — left for the relevant plan
- Project merge feature (separate concern, not in feedback `7868b077`)
- External libraries — vanilla JS stack means we're choosing internal patterns, not packages
- Multi-user / actor-tracking semantics beyond `deviceLabel` (single-user app today)

## Findings

### Existing change-tracking infrastructure (codebase reconnaissance)

| Pattern | Location | What it does | Fit for activity log |
|---|---|---|---|
| **Op log** | `data.js:23-30, 1216-1257` | Captures field-level changes for `OP_LOG_FIELDS` (status, myDayDate, calendarDate, calendarTime, dueDate, followUpDate, urgent). Per-entry: `{id, taskId, taskTitle, field, prev, next, ts, deviceId, deviceLabel}`. Bounded at 300 local / 100 shared per PUT. Replicated via `deviceLog` payload field. Already merged across devices. | Strong primitive — most of the emission work is **already done** for status changes. Bounded size makes it wrong for long-term history; not project-scoped. |
| **completionLog (in `completed.json`)** | `server.py:68, 763-800` + `data.js:172, 679` | Separate persistence file, lazy-loaded by Statistics/Reports panels. Server **merges** rather than replaces — stale devices cannot wipe history. Conditional in PUT payload (`_completionsDirty` flag). | Excellent fit pattern. New `projectActivityLog` would parallel `completionLog` exactly. |
| **`_fieldTimestamps` (per-task / per-settings)** | `data.js:267, 1222-1239, 4615-4737` | LWW conflict resolution at field-group granularity (scheduling, status, dueDate, followUpDate, prerequisites, urgency). | Not directly relevant — that's for merge decisions, not history. |
| **Tombstones** | `data.js:_tombstones`, `server.py` 30-day prune | Track deleted task IDs with timestamps so a stale device cannot resurrect deleted tasks. | Not the right model — activity log is append-only, not deletion-marker. |

### Option A: Extend the existing op log

**Source:** `app/web_ui/js/data.js:23-30, 430-459, 570-572, 713`

**Summary:** Add `projectId` to op log entries, expand `OP_LOG_FIELDS` to include `project`, surface op log entries grouped by project as the activity view.

**Pros:**
- Minimal new code — emission already happens at `data.js:1216-1257` for the relevant fields
- Sync, persistence, and device-tracking already work
- Cross-device merge already proven (`mergeOpLogs` at data.js)

**Cons:**
- **Op log is bounded at 300 entries.** A power user editing tasks frequently could blow past that in days, losing history. Increasing the cap balloons sync payload size on every PUT.
- Op log entries are field-level (`prev` / `next`), not human-readable events. Rendering "Status: next → done" is fine; rendering "Project field changed from null to 'Q4 launch'" is awkward.
- Some events have no field-level representation (project creation, task deletion, task restoration). Would require adding synthetic op-log entries, mixing two concepts.
- Op log is currently a **diagnostic** surface (Sync Diagnostics in Settings). Promoting it to a primary feature changes its character and may complicate future op-log-only changes.

**For our use case:** Tempting because of code reuse, but the bounded size is a fatal flaw for a feature whose entire value proposition is "see what happened on this project over time."

### Option B: New `projectActivityLog` collection in `completed.json` (RECOMMENDED)

**Source:** Mirrors `completionLog` pattern at `server.py:68, 763-800` and `data.js:172, 679`

**Summary:** Add a new array `projectActivityLog` to `completed.json`. Emit semantically-named events from the existing mutation methods in `data.js`. Lazy-load via the existing `ensureCompletedLoaded()` path. Render in a new project-flyout tab.

**Entry shape (proposed):**
```js
{
  id: "act_<uuid>",
  projectId: "proj_xyz",
  type: "task.statusChange" | "task.projectAssign" | "task.completed" |
        "task.deleted" | "task.restored" | "project.created" |
        "project.statusChange" | "project.completed",
  taskId: "task_abc",            // null for project.* events
  taskTitle: "Email vendor",     // captured at event time so deletions don't orphan the log
  actor: "MacBook Pro (Jake)",   // deviceLabel from existing deviceInfo
  ts: "2026-05-07T14:30:00Z",
  before: "next",                // event-type-specific
  after: "doing",
}
```

**MVP event types (from feedback wording — "status of tasks etc, should be logged"):**
1. `task.statusChange` — any STATUS transition while assigned to a project
2. `task.projectAssign` — task moved into / out of / between projects
3. `task.completed` — task completion (special-case of status change, kept distinct for cleaner UI)
4. `task.deleted` — task deletion (records title before tombstone)
5. `task.restored` — restore from completion log
6. `project.created` — project creation
7. `project.statusChange` — Active ↔ OnHold ↔ Completed
8. `project.completed` — completion with `disposition` summary

**Out of MVP** (per feedback "I wouldn't want some information to become permanent, like notes"):
- Note edits / list-item edits — too noisy, freeform
- Field edits beyond status (dueDate, contexts, etc.) — can be added later if missed; safer to start narrow
- Title renames — usually not interesting; can revisit

**Pros:**
- Reuses `completed.json` split-persistence: server merges incoming logs without replacement, so stale devices cannot wipe history (same guarantee as `completionLog`)
- Lazy-loaded via existing `ensureCompletedLoaded()` — zero impact on initial-load payload, only fetched when user opens a project's activity tab
- Unbounded growth — server can prune by age if it ever becomes an issue, but starts append-forever
- Conditional in PUT payload via existing `_completionsDirty` mechanism — regular task edits don't bloat sync
- Semantic event types map directly to human-readable UI ("Status changed: next → doing")
- Captures `taskTitle` snapshot at event time — log remains readable even after tasks are deleted

**Cons:**
- Net-new emission code — must add calls to a small `_logActivity()` helper from `updateTask`, `addTask`, `deleteTask`, `completeTask`, `restoreCompletedTask`, `addProject`, `updateProject`, `completeProject`. Estimated ~10 emission sites.
- Server `_atomic_write` and `completed.json` merge logic must learn to merge `projectActivityLog` (likely a 5-line addition to the existing `_merge_collection` call site at `server.py:784`).
- Frontend bundle weight grows with the lazy-loaded log over time — fine for typical use, may matter at extreme volumes (1000s of entries).

**For our use case:** Best fit. Maps to user's mental model ("show me what happened on this project"), reuses three battle-tested patterns, scales over time without sync-payload regression.

### Option C: Hybrid — op log for live recent + `projectActivityLog` for archival

**Source:** Combination of A + B

**Summary:** Use op log entries directly for "last N changes" views; periodically archive aged-out entries into `projectActivityLog` before they fall off the 300-entry bound.

**Pros:**
- Cheaper writes for very recent activity
- Theoretically lossless if archival is reliable

**Cons:**
- **Two sources of truth** — UI must merge op log + projectActivityLog deduplicating by event id, increasing complexity for marginal benefit
- Archival job needs careful concurrency design (op log is local-first, projectActivityLog round-trips through the server)
- Risk of entries being lost during the archival window if a client goes offline at the wrong moment
- Premature optimization — Option B's lazy-load already keeps the cost off the hot path

**For our use case:** Over-engineered. The ~10 emission sites in Option B are not a hot path; the synthesis of two stores costs more than it saves.

## Comparison

| Criterion | Option A (extend op log) | Option B (new projectActivityLog) | Option C (hybrid) |
|---|---|---|---|
| Code volume | Low | Medium (~10 emission sites + UI tab) | High |
| Pattern reuse | Strong (op log) | Strong (completionLog) | Medium |
| Bounded growth concerns | Critical — 300-entry cap loses history | None — server-merged accumulator | Mitigated but complex |
| Sync payload impact | Bloats every PUT (deviceLog grows) | Conditional via `_completionsDirty` | Same as Option B for archival |
| Cross-device merge | Already works | Reuses completed.json server merge | Two merge paths to maintain |
| Human-readable UI mapping | Awkward (raw field/prev/next) | Native (semantic event types) | Mixed |
| Risk to existing features | Medium (changes op log character) | Low (additive collection) | High (two systems to keep in sync) |
| Fits feedback intent | Partial | Yes | Yes |

## Recommendation

**Choose: Option B — New `projectActivityLog` collection in `completed.json`.**

**Rationale:**
- The user's stated intent ("status of tasks etc, should be logged" / not notes) maps cleanly to a small, semantic event-type vocabulary that Option B serves natively.
- Reusing the `completionLog` pattern means the split-persistence, lazy-load, server-merge, and `_completionsDirty` infrastructure all work without invention.
- Bounded growth is a non-issue — `completed.json` already accumulates indefinitely (with server-side prune available if needed) and stays out of the hot-path PUT payload.
- Capturing `taskTitle` and `actor` at event time keeps the log readable across deletions and across devices without requiring deep cross-references at render time.

**Plan-splitting recommendation:**
ROADMAP currently lists Phase 4 as a single plan (`04-02`). I recommend splitting:
- **04-01 (data + emission):** Add `projectActivityLog` to state shape, server-merge, `_logActivity()` helper, instrument the ~10 mutation sites, add tests. No UI yet.
- **04-02 (UI surface):** Project-flyout activity tab, lazy-load on tab activation, render the event types as human-readable rows, oldest-first or newest-first toggle.

Splitting de-risks the data-model work (it can be deployed and exercised before any UI depends on it) and produces two reviewable diffs instead of one large one. The existing ROADMAP entry `04-02` should be renumbered or expanded.

**Caveats:**
- Backfill — projects that exist today will have empty activity logs until events are emitted. Decision needed: leave empty (recommended, simplest) or generate synthetic "imported from history" entries from `completionLog` + `_fieldTimestamps`. Recommend leaving empty; it's clearer to users that the log "started today" than to fabricate gappy history.
- Scope discipline — emission sites are a tempting place to log "everything." Plan boundaries must hold the line at the MVP event types, with deferred-issues capturing the others (note edits, dueDate, context changes) for later.
- Note edits explicitly excluded per user wording. If they later want note-edit logging, that would be a separate plan; design today should NOT preclude it (event type vocabulary is open).
- Storage cost — at typical use (a few task changes per day per project), `completed.json` will grow ~few KB / month / project. Acceptable; pruning can be added later if it ever becomes a real concern.

## Open Questions

- **Tab vs. modal vs. sidebar for the UI surface** — Impact: low (decided in 04-02 plan, not a data-model concern).
- **Should the activity tab show only the last 30 days by default, with "load more"?** — Impact: low (UI ergonomics, decided in 04-02).
- **Server prune policy for very old entries?** — Impact: low (can be added when storage actually becomes a concern; not a v1 question).
- **Should `task.completed` write to BOTH `completionLog` and `projectActivityLog`?** — Impact: medium. Recommend yes — completionLog is the source of truth for the Reports panel; projectActivityLog is the project-scoped view. They serve different consumers and the duplication cost is tiny.

## Quality Report

**Sources consulted:**
- `app/web_ui/js/data.js` — op log infrastructure (lines 23-30, 430-459, 570-572, 713, 1216-1257), completionLog handling (lines 172, 195, 225, 241, 247, 317, 536, 589-596, 679, 717), `_fieldTimestamps` (lines 267, 1222-1239), date 2026-05-07
- `app/server.py` — `completed.json` split persistence and merge (lines 68, 135-141, 654-803), date 2026-05-07
- `data/feedback.json:649-657` — feedback record `7868b077`, the user's own scope statement, date 2026-05-07
- `.paul/ROADMAP.md` Phase 4 entry — confirms Research: Likely classification, date 2026-05-07
- CLAUDE.md (project root) — Architecture / completed.json rationale, date 2026-05-07

**Verification:**
- Op log bound (300 / 100): Verified at `data.js:24-25` (`OP_LOG_MAX = 300`, `OP_LOG_SHARED_MAX = 100`)
- completed.json server-merge (no replacement): Verified at `server.py:766-800` (`_merge_collection` call against existing data)
- Lazy-load mechanism: Verified at `setActivePanel` description in CLAUDE.md and `_completionsDirty` flag at `data.js:536`
- Cross-device merge of op log entries: Verified at `data.js:570-572` (`mergeOpLogs` on remoteState.deviceLog)
- Feedback scope intent ("status yes, notes no"): Verified by directly reading `data/feedback.json:652`

**Assumptions (not verified):**
- Estimated ~10 emission sites in `data.js` — this is from a quick scan; the actual count will be confirmed during 04-01 planning
- Storage growth of "few KB / month / project" — back-of-envelope, not measured; can be revisited if a power-user shows otherwise
- Project flyout has room for a new tab — confirmed structurally exists, but visual/interaction fit is a 04-02 concern, not a data-model risk

---
*Discovery completed: 2026-05-07*
*Confidence: HIGH*
*Ready for: /paul:plan 4 (recommend splitting into 04-01 data + 04-02 UI)*
