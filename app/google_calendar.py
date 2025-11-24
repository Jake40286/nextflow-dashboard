"""Google Calendar sync helpers."""

from __future__ import annotations

import json
import os
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:  # pragma: no cover - google libs unavailable in tests
    service_account = None
    build = None


class GoogleCalendarSync:
    """Minimal helper that mirrors dated tasks into a Google Calendar."""

    SCOPES = ["https://www.googleapis.com/auth/calendar"]

    def __init__(self, calendar_id: str, credentials_file: Path, state_file: Path):
        if not service_account or not build:
            raise RuntimeError("Google libraries are unavailable. Did you install requirements?")
        self.calendar_id = calendar_id
        self.credentials_file = Path(credentials_file)
        self.state_file = Path(state_file)
        self.lock = threading.Lock()
        self._service = None

    @classmethod
    def from_env(cls) -> Optional["GoogleCalendarSync"]:
        calendar_id = os.getenv("GOOGLE_CALENDAR_ID")
        credentials_file = os.getenv("GOOGLE_CREDENTIALS_FILE", "/secrets/google-service-account.json")
        state_file = os.getenv("GOOGLE_CALENDAR_EVENT_STORE", "/data/google-events.json")
        if not calendar_id:
            return None
        cred_path = Path(credentials_file)
        if not cred_path.exists():
            print("Google Calendar sync disabled: credentials file missing.")
            return None
        try:
            return cls(calendar_id=calendar_id, credentials_file=cred_path, state_file=Path(state_file))
        except Exception as error:  # noqa: BLE001
            print(f"Failed to initialize Google Calendar sync: {error}")
            return None

    @property
    def service(self):
        if not self._service:
            credentials = service_account.Credentials.from_service_account_file(
                str(self.credentials_file), scopes=self.SCOPES
            )
            self._service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
        return self._service

    def sync_async(self, tasks: Iterable[Dict[str, Any]]) -> None:
        thread = threading.Thread(target=self.sync_tasks, args=(list(tasks),), daemon=True)
        thread.start()

    def sync_tasks(self, tasks: Iterable[Dict[str, Any]]) -> None:
        tasks_by_id = {task.get("id"): task for task in tasks if task.get("id")}
        if not tasks_by_id:
            return
        with self.lock:
            mapping = self._load_mapping()
            changed = False
            seen = set()
            for task_id, task in tasks_by_id.items():
                seen.add(task_id)
                has_dates = self._task_has_dates(task)
                event_id = mapping.get(task_id)
                if has_dates and not task.get("completedAt"):
                    next_event_id = self._upsert_event(task, event_id)
                    if next_event_id and next_event_id != event_id:
                        mapping[task_id] = next_event_id
                        changed = True
                elif event_id:
                    if self._delete_event(event_id):
                        mapping.pop(task_id, None)
                        changed = True
            for task_id in list(mapping.keys()):
                if task_id not in seen:
                    if self._delete_event(mapping[task_id]):
                        mapping.pop(task_id, None)
                        changed = True
            if changed:
                self._save_mapping(mapping)

    def _task_has_dates(self, task: Dict[str, Any]) -> bool:
        return bool(task.get("calendarDate") or task.get("dueDate"))

    def _build_event_body(self, task: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        date_value = task.get("calendarDate") or task.get("dueDate")
        if not date_value:
            return None
        try:
            start_date = date.fromisoformat(date_value)
        except ValueError:
            return None
        end_date = start_date + timedelta(days=1)
        description = task.get("description") or ""
        context = task.get("context")
        project = task.get("projectId")
        extra_lines = []
        if context:
            extra_lines.append(f"Context: {context}")
        if project:
            extra_lines.append(f"Project: {project}")
        if task.get("slug"):
            extra_lines.append(f"Task ID: {task['slug']}")
        if extra_lines:
            description = f"{description}\n\n" if description else ""
            description += "\n".join(extra_lines)
        return {
            "summary": task.get("title", "GTD Task"),
            "description": description or "Synced from GTD Dashboard",
            "start": {"date": start_date.isoformat()},
            "end": {"date": end_date.isoformat()},
            "extendedProperties": {
                "private": {"taskId": task.get("id", ""), "source": "gtd-dashboard"}
            },
        }

    def _upsert_event(self, task: Dict[str, Any], event_id: Optional[str]) -> Optional[str]:
        body = self._build_event_body(task)
        if not body:
            return None
        try:
            if event_id:
                self.service.events().patch(calendarId=self.calendar_id, eventId=event_id, body=body).execute()
                return event_id
            created = self.service.events().insert(calendarId=self.calendar_id, body=body).execute()
            return created.get("id")
        except HttpError as error:
            print(f"Google Calendar sync error for task {task.get('id')}: {error}")
            return event_id

    def _delete_event(self, event_id: str) -> bool:
        try:
            self.service.events().delete(calendarId=self.calendar_id, eventId=event_id).execute()
            return True
        except HttpError as error:
            print(f"Failed to delete Google Calendar event {event_id}: {error}")
            return False

    def _load_mapping(self) -> Dict[str, str]:
        if not self.state_file.exists():
            return {}
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            return {}

    def _save_mapping(self, mapping: Dict[str, str]) -> None:
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(mapping, indent=2), encoding="utf-8")
