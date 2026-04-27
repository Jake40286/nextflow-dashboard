---
description: Diagnose state sync issues, merge conflicts, tombstone problems, and op log anomalies in NextFlow
---

## Usage
`/sync-debug <SYMPTOM_OR_ISSUE>`

## Context
Issue to diagnose: $ARGUMENTS

## Quick Diagnostics

```bash
# Check server state and rev
curl -s http://localhost:8002/state | python3 -c \
  "import json,sys; s=json.load(sys.stdin); print('rev:', s['_rev'], '| tasks:', len(s.get('tasks',[])), '| tombstones:', len(s.get('_tombstones',{})))"

# Inspect tombstones
curl -s http://localhost:8002/state | python3 -c \
  "import json,sys; [print(k,v) for k,v in json.load(sys.stdin).get('_tombstones',{}).items()]"

# Find a task by partial title
curl -s http://localhost:8002/state | python3 -c \
  "import json,sys; [print(json.dumps(t,indent=2)) for t in json.load(sys.stdin).get('tasks',[]) if '<TITLE_FRAGMENT>' in t.get('title','')]"
```

## Checklist by Symptom

**Task keeps disappearing:**
- Check `_tombstones` — a tombstone newer than the task's `updatedAt` will suppress it across all devices
- `restoreCompletedTask()` deletes the tombstone; manual fix: remove the key from `_tombstones` via a PUT

**Changes not syncing between devices:**
- Compare `_rev` values in localStorage (`nextflow-last-rev`) vs server — a stale rev causes every PUT to 409 until a manual refresh
- Check op log in localStorage (`nextflow-op-log`) for the last successful write

**409 conflict loop:**
- `flushRemoteQueue()` retries up to 3 times; a 4th failure means `mergeStates()` is producing a state that still conflicts
- Check `_fieldTimestamps` on the conflicting task — per-group LWW (`MERGE_FIELD_GROUPS`) should resolve most conflicts

**Setting not persisting:**
- Settings use `SETTINGS_MERGE_GROUPS` for per-group LWW — check `settings._fieldTimestamps` on both sides

**Missing completion history in Statistics:**
- `/state` intentionally excludes completion data; Statistics fetches `/completed` lazily on panel activation
- Confirm `data/completed.json` exists and is valid JSON

## Key Files
- [app/server.py](app/server.py) — `_handle_put_state()`, optimistic locking, tombstone pruning
- [app/web_ui/js/data.js](app/web_ui/js/data.js) — `mergeStates()`, `mergeTasks()`, `flushRemoteQueue()`, `_mergeTombstones()`
- `data/state.json` — live state with `_rev` and `_tombstones`
- `data/completed.json` — completion log (never included in PUT payload)
