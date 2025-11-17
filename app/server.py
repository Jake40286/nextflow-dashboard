"""Simple HTTP server for the GTD dashboard static files."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import sys

BASE_DIR = Path(__file__).resolve().parent
WEB_ROOT = BASE_DIR / "web_ui"


def get_server_address():
    host = os.getenv("HOST", "0.0.0.0")
    try:
        port = int(os.getenv("PORT", "8000"))
    except ValueError:
        print("Invalid PORT value. Falling back to 8000.", file=sys.stderr)
        port = 8000
    return host, port


def start_server():
    if not WEB_ROOT.exists():
        print(f"Web root {WEB_ROOT} is missing", file=sys.stderr)
        sys.exit(1)
    os.chdir(WEB_ROOT)
    server_address = get_server_address()
    httpd = ThreadingHTTPServer(server_address, SimpleHTTPRequestHandler)
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
