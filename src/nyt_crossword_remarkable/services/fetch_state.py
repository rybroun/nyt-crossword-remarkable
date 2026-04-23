"""In-memory fetch progress tracking for the UI."""

from datetime import datetime
from enum import Enum
from typing import Optional


class FetchPhase(str, Enum):
    IDLE = "idle"
    DOWNLOAD = "download"
    PREPARE = "prepare"
    UPLOAD = "upload"
    DONE = "done"


class FetchProgress:
    def __init__(self):
        self.phase: FetchPhase = FetchPhase.IDLE
        self.progress: int = 0
        self.log: list[dict] = []
        self.puzzle_date: Optional[str] = None

    def set_phase(self, phase: FetchPhase, progress: int = 0) -> None:
        self.phase = phase
        self.progress = progress

    def add_log(self, msg: str, kind: str = "info") -> None:
        self.log.append({
            "ts": datetime.now().strftime("%H:%M:%S"),
            "msg": msg,
            "kind": kind,
        })

    def complete(self) -> None:
        self.phase = FetchPhase.DONE
        self.progress = 100

    def reset(self) -> None:
        self.phase = FetchPhase.IDLE
        self.progress = 0
        self.log = []
        self.puzzle_date = None

    def to_dict(self) -> dict:
        return {
            "phase": self.phase.value,
            "progress": self.progress,
            "log": self.log,
            "puzzle_date": self.puzzle_date,
        }


# Module-level singleton
fetch_state = FetchProgress()
