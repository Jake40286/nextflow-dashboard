"""Simple HTTP server for the GTD dashboard static files and shared state."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import json
import os
import sys
import threading

try:
    from google_calendar import GoogleCalendarSync
except Exception:  # noqa: BLE001
    GoogleCalendarSync = None
try:
    from backup import StateBackupManager
except Exception:  # noqa: BLE001
    StateBackupManager = None

BASE_DIR = Path(__file__).resolve().parent
WEB_ROOT = BASE_DIR / "web_ui"
STATE_FILE = Path(os.getenv("STATE_FILE", "./data/state.json"))
COMPLETED_FILE = Path(os.getenv("COMPLETED_FILE", "./data/completed.json"))
STATE_LOCK = threading.Lock()
_CALENDAR_SYNC_LOCK = threading.Lock()
_calendar_sync = GoogleCalendarSync.from_env() if GoogleCalendarSync else None
_calendar_sync_key = None  # tracks (calendarId, timezone, duration) of current sync
BACKUP_MANAGER = StateBackupManager.from_env() if StateBackupManager else None


def _get_calendar_sync(calendar_id, timezone, duration):
    """Return a GoogleCalendarSync for the given config, reusing or reinitialising as needed."""
    global _calendar_sync, _calendar_sync_key
    if not GoogleCalendarSync or not calendar_id:
        return None
    key = (calendar_id, timezone, duration)
    with _CALENDAR_SYNC_LOCK:
        if _calendar_sync_key == key and _calendar_sync is not None:
            return _calendar_sync
        credentials_file = os.getenv("GOOGLE_CREDENTIALS_FILE", "/secrets/google-service-account.json")
        event_store = os.getenv("GOOGLE_CALENDAR_EVENT_STORE", "/data/google-events.json")
        try:
            sync = GoogleCalendarSync(
                calendar_id=calendar_id,
                credentials_file=Path(credentials_file),
                state_file=Path(event_store),
                timezone=timezone,
                default_duration=duration,
            )
            _calendar_sync = sync
            _calendar_sync_key = key
            return sync
        except Exception as error:  # noqa: BLE001
            print(f"Failed to (re)initialise Google Calendar sync: {error}", file=sys.stderr)
            _calendar_sync = None
            _calendar_sync_key = None
            return None


def get_server_address():
    host = os.getenv("HOST", "0.0.0.0")
    try:
        port = int(os.getenv("PORT", "8000"))
    except ValueError:
        print("Invalid PORT value. Falling back to 8000.", file=sys.stderr)
        port = 8000
    return host, port


class DashboardRequestHandler(SimpleHTTPRequestHandler):
    """Serve static assets and expose a simple JSON state API."""

    def _is_state_endpoint(self):
        parsed = urlparse(self.path)
        return parsed.path.rstrip("/") == "/state"

    def _send_json(self, payload, status=200):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _ensure_state_dir(self):
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        COMPLETED_FILE.parent.mkdir(parents=True, exist_ok=True)

    def do_GET(self):
        if self._is_state_endpoint():
            self._handle_state_get()
            return
        super().do_GET()

    def do_POST(self):
        if self._is_state_endpoint():
            self._handle_state_write()
            return
        super().do_POST()

    def do_PUT(self):
        if self._is_state_endpoint():
            self._handle_state_write()
            return
        super().do_PUT()

    def _handle_state_get(self):
        self._ensure_state_dir()
        with STATE_LOCK:
            payload = {}
            try:
                if STATE_FILE.exists():
                    payload = json.loads(STATE_FILE.read_text(encoding="utf-8") or "{}")
            except json.JSONDecodeError:
                payload = {}
            try:
                if COMPLETED_FILE.exists():
                    completed_blob = json.loads(COMPLETED_FILE.read_text(encoding="utf-8") or "{}")
                    payload["reference"] = completed_blob.get("reference", payload.get("reference"))
                    payload["completionLog"] = completed_blob.get("completionLog", payload.get("completionLog"))
                    payload["completedProjects"] = completed_blob.get("completedProjects", payload.get("completedProjects"))
            except json.JSONDecodeError:
                pass
        self._send_json(payload)

    def _handle_state_write(self):
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length <= 0:
            self._send_json({"error": "Request body required"}, status=400)
            return
        try:
            raw = self.rfile.read(content_length)
        except OSError:
            self._send_json({"error": "Failed to read request body"}, status=500)
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON payload"}, status=400)
            return

        self._ensure_state_dir()
        with STATE_LOCK:
            core_payload = dict(payload or {})
            completed_payload = {
                "reference": core_payload.pop("reference", []),
                "completionLog": core_payload.pop("completionLog", []),
                "completedProjects": core_payload.pop("completedProjects", []),
            }
            STATE_FILE.write_text(json.dumps(core_payload, indent=2), encoding="utf-8")
            COMPLETED_FILE.write_text(json.dumps(completed_payload, indent=2), encoding="utf-8")
        self._send_json({"status": "ok"})
        settings = core_payload.get("settings", {})
        flags = settings.get("featureFlags", {})
        gcal_enabled = flags.get("googleCalendarEnabled", True)
        if gcal_enabled:
            gcal_cfg = settings.get("googleCalendarConfig", {})
            calendar_id = gcal_cfg.get("calendarId") or os.getenv("GOOGLE_CALENDAR_ID", "")
            timezone = gcal_cfg.get("timezone") or os.getenv("GOOGLE_CALENDAR_TIMEZONE", "UTC")
            duration = int(gcal_cfg.get("defaultDurationMinutes") or os.getenv("GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES", "60"))
            sync = _get_calendar_sync(calendar_id, timezone, duration)
            if sync:
                try:
                    sync.sync_async(core_payload.get("tasks", []))
                except Exception as error:  # noqa: BLE001
                    print(f"Google Calendar sync skipped: {error}", file=sys.stderr)
        if BACKUP_MANAGER:
            try:
                BACKUP_MANAGER.write_backup(payload)
            except Exception as error:  # noqa: BLE001
                print(f"Failed to write backup snapshot: {error}", file=sys.stderr)


def start_server():
    if not WEB_ROOT.exists():
        print(f"Web root {WEB_ROOT} is missing", file=sys.stderr)
        sys.exit(1)
    os.chdir(WEB_ROOT)
    server_address = get_server_address()
    httpd = ThreadingHTTPServer(server_address, DashboardRequestHandler)
    host, port = server_address
    print(f"Serving GTD dashboard on http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down server")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    start_server()
