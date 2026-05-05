## What

Extends `completeProject` to accept an optional per-task `dispositions` map, and generalizes `createSkipSnapshot` to support a custom `archiveType`. This is a data-layer-only change (Slice 1 of 2); no UI changes yet.

## Why

When a user completes a project that has unfinished tasks, those tasks were silently orphaned (`projectId = null`) with no record of why. Slice 2 will add a disposition modal; this slice wires up the data layer it will call.

## Changes

- **`app/web_ui/js/data.js`**
  - `completeProject(projectId, closureNotes, { dispositions })` — new third param. Each task linked to the project is routed by its disposition: `complete` (tombstone + completionLog entry), `skip` (tombstone + `skipped-with-project` log entry), `delete` (tombstone + deleted log entry), `keep` (orphan in place, today's behavior). Tasks absent from the map fall back to `keep`, preserving full back-compat.
  - `createSkipSnapshot` — adds `archiveType = "skipped"` to its options object, allowing the new `"skipped-with-project"` archive type without touching existing recurring-task callers.

- **`tests/taskManager.test.js`** — 8 new tests: back-compat (no options), each of the four dispositions individually, mixed dispositions over four tasks, tasks absent from the map, and a tombstone-survives-stale-remote-merge test via `mergeStates`.

## Reviewer focus

- **Back-compat gate** (`data.js:2232`): `Object.keys(dispositions).length > 0` — existing callers that pass no third argument get the legacy orphan-all path. Verify the `?? "keep"` fallback ensures a partial map can't accidentally tombstone unlisted tasks.
- **Single `now` timestamp** (`data.js:2233`): all dispositions in one call share a timestamp for merge-ordering consistency. Intentional.
- **`_completionsDirty` set unconditionally** (`data.js:2285`): always set for the `completedProjects` entry, regardless of whether any tasks produced log entries.

## Known limitations / deferred

See `TECHNICAL_DEBT.md` under `2026-05-05 — feature/completion-dispositions-data-layer`. Highlights:

- Disposition strings (`"complete"/"skip"/"keep"/"delete"`) are bare — promote to `DISPOSITION` constants in Slice 2 or a cleanup PR.
- Unknown disposition values write a tombstone but no archive entry (silent data loss). Not reachable today; add an explicit guard in Slice 2.
- `snapshot.skippedCount = undefined` for project-skip entries (omitted from JSON). Semantically correct but inconsistent with recurring-task skip entries.
- Bulk-archive loop duplicated between `deleteProject` and `completeProject`; `_archiveTaskBatch` helper deferred.

## Test plan

- [x] `npm test` — 152/152 passing
- [x] `node --test --test-name-pattern "completeProject"` — 8/8 passing
- [ ] Slice 2 will add manual browser smoke test when the modal is wired up
