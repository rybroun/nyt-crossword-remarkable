"""Book send history — records of each ebook delivery attempt."""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from nyt_crossword_remarkable.config import DEFAULT_BOOK_HISTORY_PATH


class BookSendRecord(BaseModel):
    book_id: str
    title: str
    author: str
    format: str
    size: str = ""
    folder: str = "/Books"
    sent_at: datetime
    status: str  # "success" or "error"
    error: Optional[str] = None


class BookHistory:
    def __init__(self, path: Path = DEFAULT_BOOK_HISTORY_PATH):
        self.path = path
        self._records: list[BookSendRecord] = []
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self._records = [BookSendRecord.model_validate(r) for r in data]

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = [json.loads(r.model_dump_json()) for r in self._records]
        self.path.write_text(json.dumps(data, indent=2))

    def add(self, record: BookSendRecord) -> None:
        self._records.append(record)
        self._save()

    def recent(self, limit: int = 10) -> list[BookSendRecord]:
        """Return the most recent records, newest first."""
        return sorted(
            self._records, key=lambda r: r.sent_at, reverse=True
        )[:limit]
