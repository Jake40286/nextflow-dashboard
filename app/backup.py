"""Backup utilities for NextFlow state."""

from __future__ import annotations

import gzip
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable


class StateBackupManager:
    """Writes timestamped compressed snapshots of the full state payload."""

    def __init__(self, backup_dir: Path, retention: int = 30):
        self.backup_dir = Path(backup_dir)
        self.retention = max(1, retention)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls) -> "StateBackupManager":
        backup_dir = Path(os.getenv("STATE_BACKUP_DIR", "./data/backups/full"))
        retention = int(os.getenv("STATE_BACKUP_RETENTION", "30"))
        return cls(backup_dir=backup_dir, retention=retention)

    def write_backup(self, payload: Dict[str, Any]) -> None:
        stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filename = self.backup_dir / f"state-{stamp}.json.gz"
        data = json.dumps(payload, indent=2).encode("utf-8")
        with gzip.open(filename, "wb") as stream:
            stream.write(data)
        self._trim_backups()

    def _trim_backups(self) -> None:
        files: Iterable[Path] = sorted(self.backup_dir.glob("state-*.json.gz"))
        excess = len(files) - self.retention
        if excess <= 0:
            return
        for entry in files[:excess]:
            try:
                entry.unlink(missing_ok=True)
            except OSError:
                pass
