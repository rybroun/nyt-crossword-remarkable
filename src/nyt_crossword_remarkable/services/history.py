"""Fetch history — records of each puzzle download attempt."""

import json
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from nyt_crossword_remarkable.config import DEFAULT_HISTORY_PATH


class FetchRecord(BaseModel):
    puzzle_date: date
    fetched_at: datetime
    status: str  # "success" or "error"
    error: Optional[str] = None


class History:
    def __init__(self, path: Path = DEFAULT_HISTORY_PATH):
        self.path = path
        self._records: list[FetchRecord] = []
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self._records = [FetchRecord.model_validate(r) for r in data]

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = [json.loads(r.model_dump_json()) for r in self._records]
        self.path.write_text(json.dumps(data, indent=2))

    def add(self, record: FetchRecord) -> None:
        self._records.append(record)
        self._save()

    def recent(self, limit: int) -> list[FetchRecord]:
        """Return the most recent records, newest first."""
        return sorted(
            self._records, key=lambda r: r.fetched_at, reverse=True
        )[:limit]
