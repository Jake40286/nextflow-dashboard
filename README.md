# GTD Dashboard Docker Stack

Static GTD dashboard bundled with a tiny Python HTTP server so it can run anywhere via Docker. Launch the stack to serve the files from `app/web_ui` and persist optional data under `data/`.

Key behaviors:
- Clarification is a guided, nine-step flow that always removes items from Inbox (identify → actionable → next action → 2‑minute rule → who → date → project → metadata → final route).
- Flyout edits auto-save on change (no need to click Save).
- Completed projects can be removed from the Completed list.
- Quick add never assigns a context; context is only set during clarification.

## Setup

1. Copy `.env.example` to `.env` and fill in the values (including `KEYRING_SERVICE` and `KEYRING_USERNAME`). `STATE_FILE` controls where the dashboard writes the shared JSON state inside the container (defaults to `/data/state.json`).
2. Ensure `app/` holds the GTD dashboard (frontend lives in `app/web_ui`).
3. Keep `data/` available for anything you want persisted or shared with other services. The server writes the task/project state JSON here so all browsers see the same data.

## Running with Docker Compose

```bash
docker compose up --build -d
```

- The Compose file loads `.env`, maps `./app` to `/app` and `./data` to `/data`, and publishes `${PORT:-8000}` on the host. The `/state` endpoint inside the container reads/writes the JSON file at `STATE_FILE`, so ensure that path lives on a persistent volume (for example the provided `./data` bind mount).
- Default command is `python server.py`, which uses `HOST`/`PORT` from the environment to run a threaded HTTP server inside the container.
- Stop the stack with `docker compose down` when finished.

## Notes

- Base image: `python:3.11-slim`.
- No additional packages are needed beyond the standard library HTTP server.
- Do **not** commit `.env` or anything inside `data/`.
- Follow your credential-handling policy when managing secrets.

## Google Calendar Sync (one-way)

The server can optionally push tasks with `calendarDate`/`dueDate` to a Google Calendar using a service account. Summary:

1. **Create a Google Cloud project & enable the Calendar API.**
   - Visit [Google Cloud Console](https://console.cloud.google.com/), create/select a project, open “APIs & Services → Library,” search for “Google Calendar API,” and click “Enable.”
2. **Generate a service-account key.**
   - In “APIs & Services → Credentials,” create a service account and download the JSON key. Store it somewhere safe (e.g., `./secrets/google-service-account.json`).
3. **Share the destination Google Calendar with the service account.**
   - In Google Calendar, open the calendar settings, find “Share with specific people,” and add the service account email with “Make changes to events.”
4. **Wire the credentials into Docker.**
   - Update `docker-compose.yml` to mount the secrets directory, e.g.:
     ```yaml
     services:
       app:
         volumes:
           - ./secrets:/secrets:ro
     ```
   - Keep a `.gitkeep` in `secrets/` and add the directory to `.gitignore` so keys never hit version control.
5. **Configure environment variables (e.g., in `.env`).**
   - `GOOGLE_CALENDAR_ID`: calendar ID (available at the bottom of the calendar’s settings page, often an email).
   - `GOOGLE_CREDENTIALS_FILE`: path inside the container (defaults to `/secrets/google-service-account.json`).
   - `GOOGLE_CALENDAR_EVENT_STORE`: optional path for the task→event mapping cache (defaults to `/data/google-events.json`).
   - `GOOGLE_CALENDAR_TIMEZONE`: IANA timezone for timed events (defaults to `UTC`).
   - `GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES`: fallback meeting length (defaults to `60`).
6. **Redeploy.**
   - Run `docker compose down && docker compose up --build -d` so the new env vars and dependencies take effect.

After those steps, open the dashboard and give tasks a `calendarDate` (and optionally `calendarTime`). Each `/state` save mirrors the tasks into Google Calendar; removing the dates deletes the events. If the logs show API errors (credentials missing, API disabled, etc.), address them in Google Cloud, then trigger another save.

## Automated Backups

Every time the dashboard saves `/state`, the server writes a compressed JSON snapshot to `STATE_BACKUP_DIR` (defaults to `/data/backups/full`). Configure retention with `STATE_BACKUP_RETENTION` (defaults to 30 snapshots). Each file is named `state-YYYYMMDD-HHMMSS.json.gz` and contains the full payload (tasks, references, etc.).

To restore, pick a snapshot, decompress it, and POST the JSON back to `/state` (or copy the contents into `data/state.json` / `data/completed.json`). Keep the backup directory on persistent storage.

## Verification Checklist

- [ ] `.env` created with all required vars (`HOST`, `PORT`, `KEYRING_SERVICE`, `KEYRING_USERNAME`).
- [ ] Volumes (`./app`, `./data`) mounted as expected.
- [ ] Credential retrieval/storage flow tested.
- [ ] `docker compose up --build` completes successfully.
- [ ] Service responds on the exposed port without errors.
- [ ] Clarify flow runs end-to-end and routes items out of Inbox as expected.
