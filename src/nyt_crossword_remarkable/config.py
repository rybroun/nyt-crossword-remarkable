"""Configuration management — load, save, and validate settings."""

import json
import os
import stat
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

DEFAULT_CONFIG_DIR = Path.home() / ".config" / "nyt-crossword-remarkable"
DEFAULT_CONFIG_PATH = DEFAULT_CONFIG_DIR / "config.json"
DEFAULT_CACHE_DIR = DEFAULT_CONFIG_DIR / "cache"
DEFAULT_HISTORY_PATH = DEFAULT_CONFIG_DIR / "history.json"


class NytConfig(BaseModel):
    cookie: str = ""
    cookie_set_at: Optional[datetime] = None


class RemarkableConfig(BaseModel):
    folder: str = "/Crosswords"
    file_pattern: str = "NYT Crossword - {Mon DD, YYYY}"


class ScheduleConfig(BaseModel):
    enabled: bool = True
    days: list[str] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    time: str = "22:00"
    timezone: str = "America/New_York"


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8742


class Config(BaseModel):
    user_name: str = ""
    nyt: NytConfig = NytConfig()
    remarkable: RemarkableConfig = RemarkableConfig()
    schedule: ScheduleConfig = ScheduleConfig()
    server: ServerConfig = ServerConfig()


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> Config:
    """Load config from JSON file. Returns defaults if file doesn't exist."""
    if not path.exists():
        return Config()
    data = json.loads(path.read_text())
    return Config.model_validate(data)


def save_config(config: Config, path: Path = DEFAULT_CONFIG_PATH) -> None:
    """Save config to JSON file with restricted permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(config.model_dump_json(indent=2))
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 600
