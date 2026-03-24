"""Google Calendar sync helpers."""

from __future__ import annotations

import json
import os
import threading
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from zoneinfo import ZoneInfo

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

    def __init__(self, calendar_id: str, credentials_file: Path, state_file: Path, timezone: str, default_duration: int):
        if not service_account or not build:
            raise RuntimeError("Google libraries are unavailable. Did you install requirements?")
        self.calendar_id = calendar_id
        self.credentials_file = Path(credentials_file)
        self.state_file = Path(state_file)
        self.lock = threading.Lock()
        self._service = None
        self.timezone = timezone or "UTC"
        self.default_duration = max(5, default_duration)
        try:
            self.zoneinfo = ZoneInfo(self.timezone)
        except Exception:
            self.zoneinfo = ZoneInfo("UTC")

    @classmethod
    def from_env(cls) -> Optional["GoogleCalendarSync"]:
        calendar_id = os.getenv("GOOGLE_CALENDAR_ID")
        credentials_file = os.getenv("GOOGLE_CREDENTIALS_FILE", "/secrets/google-service-account.json")
        state_file = os.getenv("GOOGLE_CALENDAR_EVENT_STORE", "/data/google-events.json")
        timezone = os.getenv("GOOGLE_CALENDAR_TIMEZONE", "UTC")
        duration = int(os.getenv("GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES", "60"))
        if not calendar_id:
            return None
        cred_path = Path(credentials_file)
        if not cred_path.exists():
            print("Google Calendar sync disabled: credentials file missing.")
            return None
        try:
            return cls(calendar_id=calendar_id, credentials_file=cred_path, state_file=Path(state_file), timezone=timezone, default_duration=duration)
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
                    if next_event_id != event_id:
                        if next_event_id:
                            mapping[task_id] = next_event_id
                        elif event_id:
                            mapping.pop(task_id, None)
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
        time_value = task.get("calendarTime")
        start_payload = None
        end_payload = None
        if time_value:
            try:
                hour, minute = map(int, time_value.split(":"))
                local_start = datetime.combine(start_date, time(hour, minute), tzinfo=self.zoneinfo)
                end_time_value = task.get("calendarEndTime")
                if end_time_value:
                    end_hour, end_minute = map(int, end_time_value.split(":"))
                    local_end = datetime.combine(start_date, time(end_hour, end_minute), tzinfo=self.zoneinfo)
                    if local_end <= local_start:
                        local_end += timedelta(days=1)
                else:
                    local_end = local_start + timedelta(minutes=self._duration_for_task(task))
                start_payload = {"dateTime": local_start.isoformat()}
                end_payload = {"dateTime": local_end.isoformat()}
            except ValueError:
                start_payload = None
        if not start_payload:
            end_date = start_date + timedelta(days=1)
            start_payload = {"date": start_date.isoformat()}
            end_payload = {"date": end_date.isoformat()}
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
            "start": start_payload,
            "end": end_payload,
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
                try:
                    self.service.events().patch(calendarId=self.calendar_id, eventId=event_id, body=body).execute()
                    return event_id
                except HttpError as patch_error:
                    if patch_error.resp.status != 404:
                        raise
                    # Event no longer exists on the calendar — fall through to insert.
            created = self.service.events().insert(calendarId=self.calendar_id, body=body).execute()
            return created.get("id")
        except HttpError as error:
            print(f"Google Calendar sync error for task {task.get('id')}: {error}")
            try:
                print("Request payload:", json.dumps(body))
            except Exception:
                pass
            return None

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

    def _duration_for_task(self, task: Dict[str, Any]) -> int:
        mapping = {
            "<5min": 5,
            "<15min": 15,
            "<30min": 30,
            "30min+": 60,
        }
        hint = task.get("timeRequired")
        if isinstance(hint, str) and hint in mapping:
            return mapping[hint]
        return self.default_duration
