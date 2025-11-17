# GTD Dashboard Docker Stack

Static GTD dashboard bundled with a tiny Python HTTP server so it can run anywhere via Docker. Launch the stack to serve the files from `app/web_ui` and persist optional data under `data/`.

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

## Verification Checklist

- [ ] `.env` created with all required vars (`HOST`, `PORT`, `KEYRING_SERVICE`, `KEYRING_USERNAME`).
- [ ] Volumes (`./app`, `./data`) mounted as expected.
- [ ] Credential retrieval/storage flow tested.
- [ ] `docker compose up --build` completes successfully.
- [ ] Service responds on the exposed port without errors.
