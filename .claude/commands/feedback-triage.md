---
description: Triage, implement, and resolve items from the NextFlow feedback backlog
---

## Usage
`/feedback-triage [ITEM_ID_OR_KEYWORD]`

## Context
Item to work on (optional): $ARGUMENTS

## Fetch the live backlog

```bash
# All open items (source of truth — never use the static file)
curl -s http://localhost:8002/feedback | python3 -c \
  "import json,sys; [print(i['id'][:6], i.get('type','?'), repr(i['text'][:80])) for i in json.load(sys.stdin) if not i.get('resolved')]"

# Full detail on one item by 6-char prefix
curl -s http://localhost:8002/feedback | python3 -c \
  "import json,sys; [print(json.dumps(i,indent=2)) for i in json.load(sys.stdin) if i['id'].startswith('$ARGUMENTS')]"
```

## Triage workflow

| Step | Action |
|------|--------|
| **Design** | `/ask <description>` — get an architectural recommendation before touching code |
| **Implement** | `/code <description>` — implement the change |
| **Test** | `npm test` — run the full suite; add a test if the bug is logic-level |
| **Record** | Write implementation notes to the item (see below) — this is required so you have context of prior changes if an item is re-opened. |
| **Resolve** | Mark resolved via `PATCH /feedback/<full-id>` (see below) |

```bash
# Write implementation notes BEFORE resolving (required step)
# Summarise what files were changed and what the fix/feature does in 1-3 sentences.
curl -s -X PATCH http://localhost:8002/feedback/<FULL_UUID> \
  -H "Content-Type: application/json" \
  -d '{"implementationNotes": "Brief description of what was changed and why."}'

# Resolve via API (after writing notes)
curl -s -X PATCH http://localhost:8002/feedback/<FULL_UUID> \
  -H "Content-Type: application/json" \
  -d '{"resolved": true}'

# Both in one call
curl -s -X PATCH http://localhost:8002/feedback/<FULL_UUID> \
  -H "Content-Type: application/json" \
  -d '{"resolved": true, "implementationNotes": "Brief description of what was changed and why."}'

# Delete an item
curl -s -X DELETE http://localhost:8002/feedback/<FULL_UUID>
```

## Feedback item types
- `bug` — something broken
- `feature` — new capability requested
- `improvement` — enhancement to existing behaviour

## After implementing
1. Resolve the item via Settings UI or PATCH
2. If the fix affects architecture described in `CLAUDE.md`, update the relevant section
3. Restart the container if Python changed: `docker compose restart web`
4. JS/CSS changes are live immediately — no restart needed

## Key Files
- [app/server.py](app/server.py) — `/feedback` CRUD endpoints
- `data/feedback.json` — persisted feedback (do not edit directly)
- [.claude/commands/feedback.md](.claude/commands/feedback.md) — prior analysis notes
