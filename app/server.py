"""Simple HTTP server for the NextFlow dashboard static files and shared state."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import datetime
import gzip
import json
import mimetypes
import os
import re as _re
import subprocess
import sys
import threading
import time
import uuid as _uuid

try:
    from google_calendar import GoogleCalendarSync
except Exception:  # noqa: BLE001
    GoogleCalendarSync = None
try:
    from backup import StateBackupManager
except Exception:  # noqa: BLE001
    StateBackupManager = None

BASE_DIR = Path(__file__).resolve().parent


def _compute_server_version():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=BASE_DIR,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:  # noqa: BLE001
        return str(int(time.time()))


SERVER_VERSION = _compute_server_version()
WEB_ROOT = BASE_DIR / "web_ui"
STATE_FILE = Path(os.getenv("STATE_FILE", "./data/state.json"))
COMPLETED_FILE = Path(os.getenv("COMPLETED_FILE", "./data/completed.json"))
CREDENTIALS_FILE = Path(os.getenv("GOOGLE_CREDENTIALS_FILE", "/secrets/google-service-account.json"))
STATE_LOCK = threading.Lock()
IMAGES_DIR = Path(os.getenv("IMAGES_DIR", "/data/images"))
FEEDBACK_FILE = Path(os.getenv("FEEDBACK_FILE", "/data/feedback.json"))
FEEDBACK_LOCK = threading.Lock()
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}
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
        credentials_file = CREDENTIALS_FILE
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


def cleanup_orphaned_images():
    """Delete images in IMAGES_DIR not referenced in any task notes or descriptions."""
    if not IMAGES_DIR.exists():
        return {"removed": 0, "bytes_freed": 0}
    img_pattern = _re.compile(r'!\[[^\]]*\]\(/images/([^)]+)\)')
    referenced = set()

    def _extract(text):
        if text:
            for m in img_pattern.finditer(text):
                referenced.add(m.group(1))

    def _scan(tasks):
        for task in tasks or []:
            _extract(task.get("description"))
            for note in task.get("notes") or []:
                _extract(note.get("text"))

    with STATE_LOCK:
        try:
            state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
        except json.JSONDecodeError:
            state = {}
        try:
            completed = json.loads(COMPLETED_FILE.read_text(encoding="utf-8")) if COMPLETED_FILE.exists() else {}
        except json.JSONDecodeError:
            completed = {}

    _scan(state.get("tasks", []))
    _scan(completed.get("reference", []))
    _scan(completed.get("completionLog", []))

    removed = 0
    bytes_freed = 0
    for f in IMAGES_DIR.iterdir():
        if not f.is_file():
            continue
        if f.name not in referenced:
            size = f.stat().st_size
            try:
                f.unlink()
                removed += 1
                bytes_freed += size
            except OSError as error:
                print(f"Failed to delete orphan {f.name}: {error}", file=sys.stderr)
    return {"removed": removed, "bytes_freed": bytes_freed}


def _schedule_nightly_cleanup():
    """Reschedule cleanup_orphaned_images() to run daily at midnight UTC."""
    now = datetime.datetime.now(datetime.timezone.utc)
    midnight = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delay = (midnight - now).total_seconds()

    def run():
        try:
            result = cleanup_orphaned_images()
            print(
                f"Nightly image cleanup: removed {result['removed']} orphan(s), "
                f"freed {result['bytes_freed']} bytes",
            )
        except Exception as error:  # noqa: BLE001
            print(f"Nightly image cleanup failed: {error}", file=sys.stderr)
        _schedule_nightly_cleanup()

    t = threading.Timer(delay, run)
    t.daemon = True
    t.start()


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

    def _is_credentials_endpoint(self):
        parsed = urlparse(self.path)
        return parsed.path.rstrip("/") == "/credentials/google"

    def _is_upload_endpoint(self):
        return urlparse(self.path).path.rstrip("/") == "/upload"

    def _is_image_endpoint(self):
        return urlparse(self.path).path.startswith("/images/")

    def _is_cleanup_endpoint(self):
        return urlparse(self.path).path.rstrip("/") == "/admin/cleanup-images"

    def _is_feedback_endpoint(self):
        return urlparse(self.path).path.rstrip("/") == "/feedback"

    def _send_json(self, payload, status=200):
        encoded = json.dumps(payload).encode("utf-8")
        accept_encoding = self.headers.get("Accept-Encoding", "")
        if "gzip" in accept_encoding and len(encoded) > 512:
            body = gzip.compress(encoded, compresslevel=6)
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
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
        if self._is_credentials_endpoint():
            self._handle_credentials_get()
            return
        if self._is_image_endpoint():
            self._handle_image_get()
            return
        if self._is_feedback_endpoint():
            self._handle_feedback_get()
            return
        super().do_GET()

    def do_POST(self):
        if self._is_state_endpoint():
            self._handle_state_write()
            return
        if self._is_credentials_endpoint():
            self._handle_credentials_write()
            return
        if self._is_upload_endpoint():
            self._handle_upload()
            return
        if self._is_cleanup_endpoint():
            self._handle_cleanup()
            return
        if self._is_feedback_endpoint():
            self._handle_feedback_post()
            return
        super().do_POST()

    def do_PUT(self):
        if self._is_state_endpoint():
            self._handle_state_write()
            return
        super().do_PUT()

    def do_PATCH(self):
        if self._is_feedback_endpoint():
            self._handle_feedback_patch()
            return
        self.send_error(405)

    def do_DELETE(self):
        if self._is_credentials_endpoint():
            self._handle_credentials_delete()
            return
        if self._is_feedback_endpoint():
            self._handle_feedback_delete()
            return
        self.send_error(405)

    def _handle_credentials_get(self):
        if CREDENTIALS_FILE.exists():
            try:
                creds = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
                self._send_json({"configured": True, "clientEmail": creds.get("client_email")})
                return
            except Exception:  # noqa: BLE001
                pass
        self._send_json({"configured": False, "clientEmail": None})

    def _handle_credentials_write(self):
        global _calendar_sync, _calendar_sync_key  # noqa: PLW0603
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length <= 0:
            self._send_json({"error": "Request body required"}, status=400)
            return
        try:
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode("utf-8"))
        except (OSError, json.JSONDecodeError):
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        required = {"type", "project_id", "private_key_id", "private_key", "client_email"}
        if not required.issubset(payload.keys()) or payload.get("type") != "service_account":
            self._send_json({"error": "Invalid service account JSON — required fields missing or type is not service_account"}, status=400)
            return
        try:
            CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
            CREDENTIALS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            with _CALENDAR_SYNC_LOCK:
                _calendar_sync = None
                _calendar_sync_key = None
            self._send_json({"status": "ok", "clientEmail": payload.get("client_email")})
        except OSError as error:
            self._send_json({"error": f"Failed to save credentials: {error}"}, status=500)

    def _handle_credentials_delete(self):
        global _calendar_sync, _calendar_sync_key  # noqa: PLW0603
        try:
            if CREDENTIALS_FILE.exists():
                CREDENTIALS_FILE.unlink()
            with _CALENDAR_SYNC_LOCK:
                _calendar_sync = None
                _calendar_sync_key = None
            self._send_json({"status": "ok"})
        except OSError as error:
            self._send_json({"error": f"Failed to remove credentials: {error}"}, status=500)

    def _handle_upload(self):
        content_type = self.headers.get("Content-Type", "").split(";")[0].strip()
        if content_type not in _ALLOWED_IMAGE_TYPES:
            self._send_json({"error": "Only PNG, JPEG, GIF, and WebP images are accepted"}, status=415)
            return
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length <= 0:
            self._send_json({"error": "Empty upload"}, status=400)
            return
        if content_length > MAX_UPLOAD_BYTES:
            self._send_json({"error": f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit"}, status=413)
            return
        try:
            data = self.rfile.read(content_length)
        except OSError:
            self._send_json({"error": "Failed to read upload"}, status=500)
            return
        ext = _ALLOWED_IMAGE_TYPES[content_type]
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{_uuid.uuid4().hex}{ext}"
        (IMAGES_DIR / filename).write_bytes(data)
        self._send_json({"url": f"/images/{filename}"})

    def _handle_image_get(self):
        parsed_path = urlparse(self.path).path
        filename = parsed_path[len("/images/"):]
        # Prevent path traversal — filename must be a plain name with no separators
        if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
            self.send_error(400)
            return
        image_path = IMAGES_DIR / filename
        if not image_path.exists() or not image_path.is_file():
            self.send_error(404)
            return
        content_type, _ = mimetypes.guess_type(str(image_path))
        try:
            data = image_path.read_bytes()
        except OSError:
            self.send_error(500)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)

    def _handle_cleanup(self):
        try:
            result = cleanup_orphaned_images()
            self._send_json(result)
        except Exception as error:  # noqa: BLE001
            self._send_json({"error": str(error)}, status=500)

    def _handle_feedback_get(self):
        with FEEDBACK_LOCK:
            try:
                items = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8")) if FEEDBACK_FILE.exists() else []
            except json.JSONDecodeError:
                items = []
        self._send_json(items)

    def _handle_feedback_post(self):
        content_length = int(self.headers.get("Content-Length") or 0)
        if content_length <= 0:
            self._send_json({"error": "Request body required"}, status=400)
            return
        try:
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode("utf-8"))
        except (OSError, json.JSONDecodeError):
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        feedback_type = str(payload.get("type", "")).strip()
        description = str(payload.get("description", "")).strip()
        if feedback_type not in ("bug", "feature") or not description:
            self._send_json({"error": "type (bug|feature) and description are required"}, status=400)
            return
        item = {
            "id": _uuid.uuid4().hex,
            "type": feedback_type,
            "description": description,
            "createdAt": payload.get("createdAt", ""),
            "panel": str(payload.get("panel", "")).strip(),
        }
        with FEEDBACK_LOCK:
            try:
                items = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8")) if FEEDBACK_FILE.exists() else []
            except json.JSONDecodeError:
                items = []
            items.append(item)
            FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
            FEEDBACK_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")
        self._send_json({"status": "ok", "id": item["id"]})

    def _handle_feedback_patch(self):
        """Mark a set of feedback items as resolved. Body: { "ids": [...] }"""
        content_length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8")) if content_length > 0 else {}
        except (OSError, json.JSONDecodeError):
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        ids = set(payload.get("ids") or [])
        with FEEDBACK_LOCK:
            try:
                items = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8")) if FEEDBACK_FILE.exists() else []
            except json.JSONDecodeError:
                items = []
            for item in items:
                if item.get("id") in ids:
                    item["resolved"] = True
            FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
            FEEDBACK_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")
        self._send_json({"status": "ok", "resolved": len(ids)})

    def _handle_feedback_delete(self):
        """Remove all resolved feedback items (or all if ?all=1)."""
        purge_all = "all=1" in (urlparse(self.path).query or "")
        with FEEDBACK_LOCK:
            try:
                items = json.loads(FEEDBACK_FILE.read_text(encoding="utf-8")) if FEEDBACK_FILE.exists() else []
            except json.JSONDecodeError:
                items = []
            before = len(items)
            kept = [] if purge_all else [i for i in items if not i.get("resolved")]
            FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
            FEEDBACK_FILE.write_text(json.dumps(kept, indent=2), encoding="utf-8")
        self._send_json({"status": "ok", "removed": before - len(kept)})

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
        payload["_serverVersion"] = SERVER_VERSION
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
            STATE_FILE.write_text(json.dumps(core_payload), encoding="utf-8")
            COMPLETED_FILE.write_text(json.dumps(completed_payload), encoding="utf-8")
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
    print(f"Serving NextFlow on http://{host}:{port}")
    _schedule_nightly_cleanup()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down server")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    start_server()
