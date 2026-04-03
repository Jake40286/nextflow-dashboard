# Feedback

Source of truth: `data/feedback.json`. Never rely on this file for item data — always fetch live.

## Look up an item by ID prefix

```bash
# Full list (open items first, then resolved)
curl -s http://localhost:8002/feedback

# Filter to one item by 6-char prefix
curl -s http://localhost:8002/feedback | python3 -c \
  "import json,sys; [print(json.dumps(i,indent=2)) for i in json.load(sys.stdin) if i['id'].startswith(sys.argv[1])]" <PREFIX>
```

## ID format

Settings panel shows the first 6 chars of the UUID hex as `#abc123`. Partial prefix matches are fine — `8ac0` uniquely identifies `8ac04b` if no other item starts with `8ac0`.

## Workflow

| Intent | Action |
|--------|--------|
| Plan / design | `/ask <item description>` |
| Implement | `/code <item description>` |
| Resolve | Settings UI, or `PATCH /feedback/<full-id>` with `{"resolved":true}` |
| Delete | Settings UI, or `DELETE /feedback/<full-id>` |

After implementing: resolve via the Settings UI and update the Resolved section in `CLAUDE.md` if relevant.
