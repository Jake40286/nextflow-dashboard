# NextFlow — Project Context

> Auto-generated architectural reference. Use `@project-context.md` in other commands to skip re-reading memory files.

---

## Stack

- **Backend:** Python 3.11, `ThreadingHTTPServer` (no framework), `threading.Lock` for state safety
- **Frontend:** Vanilla ES6+ modules, no build step, no framework, no bundler
- **Storage:** Dual-persist — localStorage (immediate) + server JSON files (durable)
- **Tests:** Node.js native test runner (`npm test`), no mocking framework, no server required
- **Deploy:** Docker + docker-compose, port 8002→8000, `./data` and `./secrets` bind-mounted volumes

---

## Key Files

| File | Purpose |
|------|---------|
| `app/server.py` | HTTP server, REST API, gzip responses |
| `app/google_calendar.py` | Async Google Calendar sync |
| `app/backup.py` | Gzip snapshot writer with retention policy |
| `app/web_ui/js/data.js` | **TaskManager** — all state, persistence, sync (~3400 lines) |
| `app/web_ui/js/ui.js` | **UIController** — all rendering, events, modals (~8400 lines) |
| `app/web_ui/js/app.js` | Bootstrap: wires TaskManager + UIController |
| `app/web_ui/js/analytics.js` | Chart.js weekly completion chart |
| `app/web_ui/css/style.css` | All styles, 10 themes via CSS custom properties |
| `data/state.json` | Active tasks, projects, settings, syncMeta |
| `data/completed.json` | reference[], completionLog[], completedProjects[] |

---

## Architecture — Key Decisions

**No framework** — zero build step, works offline as static files, trivial Docker deployment.

**Dual persistence** — UI never blocks on network. Every mutation: `persistLocally()` (debounced 500ms, flushes on `beforeunload`) + `persistRemotely()` → `flushRemoteQueue()`.

**State split** — `completionLog`/`reference`/`completedProjects` excluded from `/state` endpoint, served via `/completed`. Reduces sync payload ~50% as app ages. Only Statistics/Reports panels need it.

**Conflict resolution** — `mergeStates()` uses last-write-wins per entity via `updatedAt` timestamps. `collectRemovalMarkers()` prevents zombie-resurrection of deleted tasks. Conflict detection uses `slimStateForHash()` to compare only `/state`-returned fields.

**EventTarget pattern** — TaskManager emits `statechange`, `toast`, `syncconflict`, `versionchange`, `connection`. UIController listens — clean separation, no coupling.

**Dirty panel rendering** — `_dirtyPanels` Set tracks which panels need re-render. Only active panel renders immediately; hidden panels render on-demand when activated.

---

## Data Model

### Task (key fields)
```
id, slug, title, description
status: inbox | next | doing | waiting | someday
contexts: ["@Phone", "@Home", ...]
projectId, areaOfFocus
dueDate, myDayDate/calendarDate (always kept in sync), calendarTime, calendarEndTime
waitingFor: "+Person | task:slug | free text"
peopleTag: "+Name"
effortLevel: low | medium | high
timeRequired: <5min | <15min | <30min | 30min+
recurrenceRule: daily | weekly | monthly
notes: [{ id, text, createdAt }]
listItems: [{ id, text, done }]
```

### Project
```
id, name, vision, status: Active | OnHold | Completed
areaOfFocus, tags[], nextTaskIds[], isExpanded
```

### Settings
```
theme, customTheme, contextOptions, peopleOptions, areaOptions
featureFlags: { showFiltersCard, showDaysSinceTouched, highlightStaleTasks, googleCalendarEnabled }
staleTaskThresholds: { warn:7, stale:14, old:30, ancient:90 }
googleCalendarConfig: { calendarId, timezone, defaultDurationMinutes }
```

---

## Design Tenets

1. **Minimize clicks** — every action should require the fewest possible steps. Default to inline editing, single-tap affordances, and smart defaults over wizards or multi-step flows.
2. **Don't overwhelm with form fields** — surface only what's needed at the moment. Progressive disclosure over exhaustive upfront forms.
3. **Out of sight, out of mind** — if the user created it, it should be findable and visible. Avoid burying data in deep menus; the app should reflect the user's full context back to them.
4. **Multiple views of the same data** — the same tasks and projects should be explorable through different lenses (by status, area, person, date, effort, etc.) so the user can build a complete mental model of their work.

---

## Panels

`inbox · myday · next · kanban · projects · calendar · waitingfor · someday · allactive · reports · statistics · settings`

Pending Tasks grouping modes: `context | project | area | effort | none`

---

## Thread Safety

- `STATE_LOCK` guards all reads/writes to `state.json` / `completed.json`
- `FEEDBACK_LOCK` for feedback endpoints
- `_CALENDAR_SYNC_LOCK` for Google Calendar sync
- Calendar sync + backup both run in background threads after each successful write

---

## Testing Pattern

```js
// Tests in tests/taskManager.test.js
globalThis.fetch = undefined;          // no network
manager.remoteSyncEnabled = false;     // no server
import { __testing } from '../app/web_ui/js/data.js';  // internal helpers
```

No mocking framework. No server required. Node built-in runner only.
