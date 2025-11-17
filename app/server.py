"""Simple HTTP server for the GTD dashboard static files and shared state."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import json
import os
import sys
import threading

BASE_DIR = Path(__file__).resolve().parent
WEB_ROOT = BASE_DIR / "web_ui"
STATE_FILE = Path(os.getenv("STATE_FILE", "/data/state.json"))
STATE_LOCK = threading.Lock()


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
        if STATE_FILE.exists():
            with STATE_LOCK:
                try:
                    payload = json.loads(STATE_FILE.read_text(encoding="utf-8") or "{}")
                except json.JSONDecodeError:
                    payload = {}
        else:
            payload = {}
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
            STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self._send_json({"status": "ok"})


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
