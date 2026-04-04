# NextFlow

![Beta](https://img.shields.io/badge/status-beta-yellow)

A self-hosted personal productivity app. Run it on any machine with Docker — your tasks, projects, and calendar events live in a single JSON file that every browser on your network shares in real time.

---

## How it works

NextFlow is built around a structured workflow for capturing and processing everything that needs your attention:

1. **Capture** — write down anything that has your attention (the "Inbox")
2. **Clarify** — decide what each item is and what, if anything, you should do about it
3. **Organise** — sort it into the right bucket (Next Actions, Projects, Waiting For, Someday/Maybe, Reference)
4. **Reflect** — review your lists regularly so you trust what's in them
5. **Engage** — pick your next action with confidence

---

## Features at a Glance

- **Guided Clarification flow** — a nine-step modal walks you through every inbox item and routes it correctly without guesswork
- **Project tracking** — group related tasks under projects; see active and completed task lists per project
- **Calendar view** — grid and list views of tasks with due dates or scheduled times
- **Kanban board** — drag tasks between status columns (Inbox → Next → Doing → Waiting → Someday)
- **My Day** — a focused daily view to plan your immediate work
- **Waiting For tracking** — tag tasks by person or reference another task so nothing falls through the cracks
- **Rich filtering** — filter any view by context, project, person, energy level, time required, or waiting-for
- **Reports & Statistics** — completion trends, task-by-context breakdown, and weekly history charts
- **Area of Focus** — a workspace lens (Work, Personal, Home, etc.) that scopes all views, filters, contexts, and people tags app-wide
- **Weekly Review** — a guided review workflow to process all open loops and keep your system current
- **Google Calendar sync** — tasks with dates/times are pushed to a Google Calendar automatically
- **Offline support with multi-device sync** — work without internet; changes merge back to the server when you reconnect, with conflict notifications
- **Automatic backups** — every save writes a compressed snapshot so you can roll back to any point
- **Eight built-in themes** plus a fully customisable colour palette

---

## Views

| Tab | What it shows |
|---|---|
| **Inbox** | Unprocessed captures — your starting point each day |
| **My Day** | Tasks you've scheduled for today |
| **Next Actions** | Everything ready to work on, grouped by context |
| **Kanban** | All tasks on a drag-and-drop board by status |
| **Projects** | Active projects with their task lists and completion history |
| **Calendar** | Tasks by date; grid or list layout |
| **Waiting For** | Tasks delegated or blocked, with who/what they're waiting on |
| **Someday / Maybe** | Ideas and tasks parked for later review |
| **All Active** | Every non-completed task in one scrollable list |
| **Weekly Review** | Guided review flow to process open loops and keep the system current |
| **Reports** | Completion rate charts, context breakdowns, weekly trends |
| **Statistics** | Deeper analytics on your task history |
| **Settings** | Themes, contexts, people tags, area of focus, and feature flags |

---

## The Clarification Flow

When you click **Clarify** on an inbox item, the dashboard walks you through nine steps:

1. Identify what the item actually is
2. Is it actionable?
3. What is the very next physical action?
4. Can it be done in under 2 minutes? (if yes → do it now)
5. Who does it belong to?
6. Does it have a date?
7. Which project does it belong to?
8. Set energy level, time required, and context
9. Final route — sends it to Next Actions, Waiting For, Someday/Maybe, Reference, or Trash

Nothing leaves the Inbox unless this process is complete. Quick-add skips clarification intentionally; context is only ever assigned during this guided flow.

---

## Task Metadata

Each task can carry:

- **Status** — Inbox, Next, Doing, Waiting, Someday
- **Project** — the parent project it belongs to
- **Context** — where/how it can be done (`@Home`, `@Office`, `@Phone`, etc.)
- **Waiting For** — a person, note, or reference to another task
- **Due date**, **Follow-up date**, and **Calendar date/time** — for scheduled work
- **Energy level** — Low / Medium / High
- **Time required** — `<5min`, `<15min`, `<30min`, `30min+`
- **Recurrence** — Daily, Weekly, or Monthly
- **Notes** — free-text journal attached to the task
- **Area of Focus** — workspace lens that scopes the task (`Work`, `Personal`, `Home`, etc.)
- **People tags** — `+Name` mentions for collaboration tracking
- **Short slug** — a compact identifier for cross-referencing tasks in the Waiting For field

---

## Multi-Device Offline Sync

The dashboard works fully offline — every change is saved to your browser's local storage immediately. When your connection returns, it automatically syncs back to the server.

When multiple devices make changes while offline, the system:

1. Detects that the server was updated by another device (via a revision counter, `_rev`)
2. Merges the changes using a **last-write-wins** strategy per field group (scheduling, status, due date, follow-up date each merge independently)
3. Shows a warning toast naming the other device: *"Merged changes from [Device Name]. Review your tasks."*
4. Updates the **Sync** button tooltip to show *"Last synced: [device] at [time]"*

This means concurrent edits to *different* tasks always merge cleanly. Concurrent edits to the *same* task will keep whichever version has the newer timestamp — the warning lets you know to check.

---

## Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### 1. Configure environment

Copy the example env file and fill in the values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description | Default |
|---|---|---|
| `HOST` | Interface to bind | `0.0.0.0` |
| `PORT` | Port inside the container | `8000` |
| `STATE_FILE` | Where the JSON state is stored inside the container | `/data/state.json` |
| `STATE_BACKUP_DIR` | Where compressed backups are written | `/data/backups/full` |
| `STATE_BACKUP_RETENTION` | How many backup snapshots to keep | `30` |

### 2. Start the stack

```bash
docker compose up --build -d
```

The dashboard is then available at `http://localhost:8002` (or whatever port you mapped in `docker-compose.yml`).

To stop:

```bash
docker compose down
```

---

## Google Calendar Sync (optional)

Tasks with a `calendarDate` or `dueDate` can be mirrored to a Google Calendar automatically.

### Setup steps

1. **Enable the API** — in [Google Cloud Console](https://console.cloud.google.com/), create or select a project, go to *APIs & Services → Library*, search for *Google Calendar API*, and click *Enable*.

2. **Create a service account** — in *APIs & Services → Credentials*, create a service account and download its JSON key. Save it to `./secrets/google-service-account.json`.

3. **Share your calendar** — open the target Google Calendar's settings, find *Share with specific people*, add the service account email, and give it *Make changes to events* permission.

4. **Set environment variables** in `.env`:

   | Variable | Description | Default |
   |---|---|---|
   | `GOOGLE_CALENDAR_ID` | Calendar ID (found in calendar settings) | — |
   | `GOOGLE_CREDENTIALS_FILE` | Path to key inside the container | `/secrets/google-service-account.json` |
   | `GOOGLE_CALENDAR_EVENT_STORE` | Cache file for task→event mappings | `/data/google-events.json` |
   | `GOOGLE_CALENDAR_TIMEZONE` | IANA timezone for timed events | `UTC` |
   | `GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES` | Default event duration | `60` |

5. **Redeploy**:

   ```bash
   docker compose down && docker compose up --build -d
   ```

After that, any task with a calendar date will appear in your Google Calendar within seconds of saving. Removing the date from a task deletes the calendar event.

---

## Automated Backups

Every save to `/state` automatically writes a compressed snapshot:

```
/data/backups/full/state-YYYYMMDD-HHMMSS.json.gz
```

The server keeps the most recent `STATE_BACKUP_RETENTION` snapshots (default: 30) and deletes older ones.

**To restore a backup:**

```bash
# Decompress and PUT the snapshot back to the server
gunzip -c data/backups/full/state-20250317-120000.json.gz | \
  curl -X PUT http://localhost:8002/state \
       -H "Content-Type: application/json" \
       -d @-
```

Or copy the decompressed JSON directly into `data/state.json` while the container is stopped.

---

## Running Tests

No build step is required. Run the Node test suite with:

```bash
npm test
```

Tests live in `tests/taskManager.test.js` and cover the core data layer including merge/conflict logic.

---

## Project Structure

```
.
├── app/
│   ├── server.py           # Python HTTP server; handles /state read/write, backups, Google Calendar
│   ├── backup.py           # Snapshot manager
│   ├── google_calendar.py  # Calendar sync logic
│   └── web_ui/
│       ├── index.html      # Single-page app shell
│       ├── js/
│       │   ├── data.js     # TaskManager, state, sync, offline/conflict logic
│       │   ├── ui.js       # All rendering and event handling
│       │   ├── analytics.js
│       │   ├── review.js   # Weekly review workflow
│       │   └── app.js      # Entry point
│       ├── sw.js           # Service worker (network-first for JS/CSS, offline shell cache)
│       └── css/
├── data/                   # Persisted state and backups (bind-mounted into container)
├── secrets/                # Service account keys (never committed)
├── tests/
├── docker-compose.yml
├── Dockerfile
└── .env                    # Local config (never committed)
```

---

## Notes

- No build tools required — the frontend is plain JavaScript modules served directly
- Base image: `python:3.11-slim`; no third-party Python packages needed for core operation
- Do **not** commit `.env` or anything inside `data/` or `secrets/`
- The `/state` endpoint accepts `GET` (read) and `PUT` (write); `POST` returns 405
