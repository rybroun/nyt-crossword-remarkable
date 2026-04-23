# Backend + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend services and CLI so the user can fetch NYT crossword PDFs and upload them to a reMarkable tablet end-to-end from the command line.

**Architecture:** Python package with CLI (typer), config management (pydantic + JSON file), NYT PDF fetcher (httpx), reMarkable uploader (rmapi subprocess wrapper), and in-process scheduler (APScheduler). No frontend in this phase.

**Tech Stack:** Python 3.10+, typer, httpx, pydantic, APScheduler v4, pytest, respx (httpx mocking)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `src/nyt_crossword_remarkable/__init__.py`
- Create: `src/nyt_crossword_remarkable/__main__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/ryan/claude_ideas/nyt_crossword_remarkable
git init
```

- [ ] **Step 2: Create pyproject.toml**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "nyt-crossword-remarkable"
version = "0.1.0"
description = "Automatically deliver the daily NYT crossword to your reMarkable tablet"
readme = "README.md"
license = "MIT"
requires-python = ">=3.10"
dependencies = [
    "typer>=0.9.0",
    "httpx>=0.27.0",
    "pydantic>=2.0.0",
    "apscheduler>=4.0.0a1",
    "rich>=13.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "respx>=0.21.0",
    "pytest-asyncio>=0.23.0",
]
server = [
    "fastapi>=0.111.0",
    "uvicorn>=0.30.0",
]

[project.scripts]
nyt-crossword-remarkable = "nyt_crossword_remarkable.cli:app"

[tool.hatch.build.targets.wheel]
packages = ["src/nyt_crossword_remarkable"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 3: Create .gitignore**

```
__pycache__/
*.pyc
*.egg-info/
dist/
build/
.venv/
.env
*.pdf
```

- [ ] **Step 4: Create package init and main**

`src/nyt_crossword_remarkable/__init__.py`:
```python
"""Automatically deliver the daily NYT crossword to your reMarkable tablet."""

__version__ = "0.1.0"
```

`src/nyt_crossword_remarkable/__main__.py`:
```python
from nyt_crossword_remarkable.cli import app

app()
```

`tests/__init__.py`: empty file.

- [ ] **Step 5: Create venv and install in dev mode**

```bash
cd /Users/ryan/claude_ideas/nyt_crossword_remarkable
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

- [ ] **Step 6: Verify the CLI entry point exists**

```bash
source .venv/bin/activate
# This will fail because cli.py doesn't exist yet — that's expected.
# Just verify the package is installed:
pip show nyt-crossword-remarkable
```

Expected: package metadata shown (name, version 0.1.0, etc.)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml .gitignore src/ tests/
git commit -m "chore: scaffold project structure"
```

---

### Task 2: Config Management

**Files:**
- Create: `src/nyt_crossword_remarkable/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_config.py`:
```python
import json
from pathlib import Path

from nyt_crossword_remarkable.config import Config, load_config, save_config


def test_default_config():
    config = Config()
    assert config.nyt.cookie == ""
    assert config.remarkable.folder == "/Crosswords"
    assert config.schedule.enabled is True
    assert config.schedule.days == ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    assert config.schedule.time == "22:00"
    assert config.schedule.timezone == "America/New_York"
    assert config.server.host == "0.0.0.0"
    assert config.server.port == 8080


def test_save_and_load_config(tmp_path: Path):
    config_path = tmp_path / "config.json"
    config = Config()
    config.nyt.cookie = "test-cookie-value"
    config.remarkable.folder = "/MyPuzzles"

    save_config(config, config_path)

    assert config_path.exists()
    loaded = load_config(config_path)
    assert loaded.nyt.cookie == "test-cookie-value"
    assert loaded.remarkable.folder == "/MyPuzzles"


def test_load_config_missing_file(tmp_path: Path):
    config_path = tmp_path / "nonexistent.json"
    config = load_config(config_path)
    assert config.nyt.cookie == ""
    assert config.remarkable.folder == "/Crosswords"


def test_config_file_permissions(tmp_path: Path):
    config_path = tmp_path / "config.json"
    config = Config()
    config.nyt.cookie = "secret"
    save_config(config, config_path)

    import stat
    mode = config_path.stat().st_mode
    assert not (mode & stat.S_IROTH), "Config should not be world-readable"
    assert not (mode & stat.S_IWOTH), "Config should not be world-writable"


def test_config_round_trip_preserves_unknown_fields(tmp_path: Path):
    """If the config file has extra fields (future version), don't drop them."""
    config_path = tmp_path / "config.json"
    data = {
        "nyt": {"cookie": "abc", "cookie_set_at": None},
        "remarkable": {"folder": "/Crosswords", "file_pattern": "NYT Crossword - {Mon DD, YYYY}"},
        "schedule": {
            "enabled": True,
            "days": ["mon"],
            "time": "22:00",
            "timezone": "America/New_York",
        },
        "server": {"host": "0.0.0.0", "port": 8080},
    }
    config_path.write_text(json.dumps(data))
    loaded = load_config(config_path)
    assert loaded.nyt.cookie == "abc"
    assert loaded.schedule.days == ["mon"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ryan/claude_ideas/nyt_crossword_remarkable
source .venv/bin/activate
pytest tests/test_config.py -v
```

Expected: FAIL — `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Implement config module**

`src/nyt_crossword_remarkable/config.py`:
```python
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
    port: int = 8080


class Config(BaseModel):
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_config.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/config.py tests/test_config.py
git commit -m "feat: add config management with pydantic models"
```

---

### Task 3: NYT Crossword Fetcher

**Files:**
- Create: `src/nyt_crossword_remarkable/services/__init__.py`
- Create: `src/nyt_crossword_remarkable/services/nyt_fetcher.py`
- Create: `tests/test_nyt_fetcher.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_nyt_fetcher.py`:
```python
import httpx
import pytest
import respx
from datetime import date
from pathlib import Path

from nyt_crossword_remarkable.services.nyt_fetcher import (
    NytFetcher,
    NytAuthError,
    NytFetchError,
    format_puzzle_date,
)


def test_format_puzzle_date():
    assert format_puzzle_date(date(2026, 4, 23)) == "Apr2326"
    assert format_puzzle_date(date(2026, 1, 5)) == "Jan0526"
    assert format_puzzle_date(date(2026, 12, 31)) == "Dec3126"


def test_format_puzzle_date_single_digit_day():
    assert format_puzzle_date(date(2026, 3, 1)) == "Mar0126"


class TestNytFetcher:
    def setup_method(self):
        self.fetcher = NytFetcher(cookie="test-nyt-s-cookie")

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_success(self, tmp_path: Path):
        pdf_bytes = b"%PDF-1.4 fake pdf content"
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(200, content=pdf_bytes))

        result = await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

        assert result.exists()
        assert result.read_bytes() == pdf_bytes
        assert result.name == "2026-04-23.pdf"

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_uses_cache(self, tmp_path: Path):
        cached = tmp_path / "2026-04-23.pdf"
        cached.write_bytes(b"%PDF cached")

        result = await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

        assert result == cached
        assert result.read_bytes() == b"%PDF cached"
        assert respx.calls.call_count == 0

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_auth_error(self, tmp_path: Path):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(403))

        with pytest.raises(NytAuthError):
            await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_not_found(self, tmp_path: Path):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(404))

        with pytest.raises(NytFetchError, match="404"):
            await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

    @respx.mock
    @pytest.mark.asyncio
    async def test_check_cookie_valid(self):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/2026-04-23.json"
        ).mock(return_value=httpx.Response(200, json={"status": "OK"}))

        result = await self.fetcher.check_cookie()
        assert result is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_check_cookie_expired(self):
        respx.get(
            url__regex=r".*/svc/crosswords/v6/puzzle/daily/.*\.json"
        ).mock(return_value=httpx.Response(403))

        result = await self.fetcher.check_cookie()
        assert result is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_nyt_fetcher.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the fetcher**

`src/nyt_crossword_remarkable/services/__init__.py`: empty file.

`src/nyt_crossword_remarkable/services/nyt_fetcher.py`:
```python
"""Fetch NYT crossword PDFs using the undocumented print endpoint."""

from datetime import date
from pathlib import Path

import httpx

from nyt_crossword_remarkable.config import DEFAULT_CACHE_DIR

NYT_PRINT_URL = "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/{date_code}.pdf"
NYT_PUZZLE_URL = "https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/{iso_date}.json"


class NytAuthError(Exception):
    """Raised when the NYT cookie is expired or invalid."""


class NytFetchError(Exception):
    """Raised when fetching the puzzle fails for non-auth reasons."""


def format_puzzle_date(d: date) -> str:
    """Format a date for the NYT print URL: MMMddyy (e.g., Apr2326)."""
    return d.strftime("%b%d%y")


class NytFetcher:
    def __init__(self, cookie: str):
        self.cookie = cookie

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(cookies={"NYT-S": self.cookie})

    async def fetch_pdf(self, puzzle_date: date, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
        """Download the crossword PDF for the given date. Returns path to the cached file."""
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached_path = cache_dir / f"{puzzle_date.isoformat()}.pdf"

        if cached_path.exists():
            return cached_path

        date_code = format_puzzle_date(puzzle_date)
        url = NYT_PRINT_URL.format(date_code=date_code)

        async with self._client() as client:
            response = await client.get(url)

        if response.status_code == 403:
            raise NytAuthError("NYT cookie is expired or invalid. Re-authenticate to continue.")
        if response.status_code != 200:
            raise NytFetchError(f"Failed to fetch puzzle: HTTP {response.status_code}")

        cached_path.write_bytes(response.content)
        return cached_path

    async def check_cookie(self) -> bool:
        """Check if the stored NYT cookie is still valid."""
        iso_date = date.today().isoformat()
        url = NYT_PUZZLE_URL.format(iso_date=iso_date)

        async with self._client() as client:
            response = await client.get(url)

        return response.status_code == 200
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_nyt_fetcher.py -v
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/ tests/test_nyt_fetcher.py
git commit -m "feat: add NYT crossword PDF fetcher with caching"
```

---

### Task 4: reMarkable Uploader (rmapi Wrapper)

**Files:**
- Create: `src/nyt_crossword_remarkable/services/remarkable.py`
- Create: `tests/test_remarkable.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_remarkable.py`:
```python
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from nyt_crossword_remarkable.services.remarkable import (
    RemarkableUploader,
    RmapiNotFoundError,
    RemarkableUploadError,
    RemarkableAuthError,
)


class TestRemarkableUploader:
    def setup_method(self):
        self.uploader = RemarkableUploader(folder="/Crosswords")

    @patch("shutil.which", return_value=None)
    def test_check_rmapi_not_installed(self, mock_which):
        with pytest.raises(RmapiNotFoundError, match="rmapi"):
            self.uploader.check_rmapi()

    @patch("shutil.which", return_value="/usr/local/bin/rmapi")
    def test_check_rmapi_installed(self, mock_which):
        self.uploader.check_rmapi()  # should not raise

    @patch("subprocess.run")
    def test_upload_success(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "put", "test.pdf", "/Crosswords"],
            returncode=0,
            stdout="Uploading test.pdf... Done!\n",
            stderr="",
        )

        pdf_path = Path("test.pdf")
        self.uploader.upload(pdf_path)

        mock_run.assert_called_once_with(
            ["rmapi", "put", str(pdf_path), "/Crosswords"],
            capture_output=True,
            text=True,
            timeout=120,
        )

    @patch("subprocess.run")
    def test_upload_auth_error(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "put", "test.pdf", "/Crosswords"],
            returncode=1,
            stdout="",
            stderr="Auth token expired",
        )

        with pytest.raises(RemarkableAuthError):
            self.uploader.upload(Path("test.pdf"))

    @patch("subprocess.run")
    def test_upload_generic_error(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "put", "test.pdf", "/Crosswords"],
            returncode=1,
            stdout="",
            stderr="Network unreachable",
        )

        with pytest.raises(RemarkableUploadError, match="Network unreachable"):
            self.uploader.upload(Path("test.pdf"))

    @patch("subprocess.run")
    def test_check_connection_success(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "ls", "/"],
            returncode=0,
            stdout="[d]\tCrosswords\n[d]\tQuick sheets\n",
            stderr="",
        )

        assert self.uploader.check_connection() is True

    @patch("subprocess.run")
    def test_check_connection_failure(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "ls", "/"],
            returncode=1,
            stdout="",
            stderr="failed to refresh token",
        )

        assert self.uploader.check_connection() is False

    @patch("subprocess.run")
    def test_list_folders(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "ls", "/"],
            returncode=0,
            stdout="[d]\tCrosswords\n[d]\tQuick sheets\n[f]\tsome_doc\n",
            stderr="",
        )

        folders = self.uploader.list_folders()
        assert folders == ["Crosswords", "Quick sheets"]

    @patch("subprocess.run")
    def test_create_folder(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=["rmapi", "mkdir", "/Crosswords"],
            returncode=0,
            stdout="",
            stderr="",
        )

        self.uploader.create_folder("/Crosswords")
        mock_run.assert_called_once_with(
            ["rmapi", "mkdir", "/Crosswords"],
            capture_output=True,
            text=True,
            timeout=30,
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_remarkable.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the rmapi wrapper**

`src/nyt_crossword_remarkable/services/remarkable.py`:
```python
"""Wrapper around rmapi CLI for reMarkable cloud uploads."""

import shutil
import subprocess
from pathlib import Path


class RmapiNotFoundError(Exception):
    """rmapi binary not found on PATH."""


class RemarkableAuthError(Exception):
    """reMarkable cloud authentication failed."""


class RemarkableUploadError(Exception):
    """Upload to reMarkable failed."""


AUTH_ERROR_KEYWORDS = ["auth", "token expired", "unauthorized", "forbidden"]


class RemarkableUploader:
    def __init__(self, folder: str = "/Crosswords"):
        self.folder = folder

    def check_rmapi(self) -> None:
        """Verify rmapi is installed. Raises RmapiNotFoundError if not."""
        if shutil.which("rmapi") is None:
            raise RmapiNotFoundError(
                "rmapi not found. Install it: go install github.com/ddvk/rmapi@latest "
                "or download from https://github.com/ddvk/rmapi/releases"
            )

    def _run(self, args: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout)

    def upload(self, pdf_path: Path) -> None:
        """Upload a PDF to the configured reMarkable folder."""
        result = self._run(["rmapi", "put", str(pdf_path), self.folder])

        if result.returncode != 0:
            stderr_lower = result.stderr.lower()
            if any(kw in stderr_lower for kw in AUTH_ERROR_KEYWORDS):
                raise RemarkableAuthError(
                    "reMarkable authentication failed. Re-register your device at "
                    "https://my.remarkable.com/connect/desktop"
                )
            raise RemarkableUploadError(result.stderr.strip() or "Unknown error")

    def check_connection(self) -> bool:
        """Check if rmapi can reach the reMarkable cloud."""
        try:
            result = self._run(["rmapi", "ls", "/"], timeout=30)
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    def list_folders(self) -> list[str]:
        """List top-level folders on the reMarkable."""
        result = self._run(["rmapi", "ls", "/"], timeout=30)
        if result.returncode != 0:
            return []

        folders = []
        for line in result.stdout.strip().splitlines():
            # rmapi ls output: [d]\tFolderName or [f]\tFileName
            if line.startswith("[d]"):
                name = line.split("\t", 1)[1] if "\t" in line else ""
                if name:
                    folders.append(name)
        return folders

    def create_folder(self, folder_path: str) -> None:
        """Create a folder on the reMarkable."""
        self._run(["rmapi", "mkdir", folder_path], timeout=30)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_remarkable.py -v
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/remarkable.py tests/test_remarkable.py
git commit -m "feat: add reMarkable uploader wrapping rmapi CLI"
```

---

### Task 5: Fetch History

**Files:**
- Create: `src/nyt_crossword_remarkable/services/history.py`
- Create: `tests/test_history.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_history.py`:
```python
from datetime import date, datetime
from pathlib import Path

from nyt_crossword_remarkable.services.history import FetchRecord, History


def test_empty_history(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    assert history.recent(10) == []


def test_add_and_retrieve(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
    ))

    records = history.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)
    assert records[0].status == "success"


def test_add_failure(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="error",
        error="NYT cookie expired",
    ))

    records = history.recent(10)
    assert records[0].error == "NYT cookie expired"


def test_recent_limit(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    for i in range(20):
        history.add(FetchRecord(
            puzzle_date=date(2026, 1, i + 1),
            fetched_at=datetime(2026, 1, i + 1, 22, 0, 0),
            status="success",
        ))

    records = history.recent(5)
    assert len(records) == 5
    # Most recent first
    assert records[0].puzzle_date == date(2026, 1, 20)


def test_persistence(tmp_path: Path):
    path = tmp_path / "history.json"
    history1 = History(path=path)
    history1.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
    ))

    history2 = History(path=path)
    records = history2.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_history.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement history**

`src/nyt_crossword_remarkable/services/history.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_history.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/history.py tests/test_history.py
git commit -m "feat: add fetch history tracking"
```

---

### Task 6: Orchestrator (Fetch + Upload Pipeline)

**Files:**
- Create: `src/nyt_crossword_remarkable/services/orchestrator.py`
- Create: `tests/test_orchestrator.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_orchestrator.py`:
```python
import pytest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from nyt_crossword_remarkable.services.orchestrator import Orchestrator
from nyt_crossword_remarkable.services.nyt_fetcher import NytAuthError
from nyt_crossword_remarkable.services.remarkable import RemarkableUploadError


@pytest.fixture
def orchestrator(tmp_path: Path):
    return Orchestrator(
        nyt_cookie="test-cookie",
        remarkable_folder="/Crosswords",
        file_pattern="NYT Crossword - {Mon DD, YYYY}",
        cache_dir=tmp_path / "cache",
        history_path=tmp_path / "history.json",
    )


@pytest.mark.asyncio
async def test_fetch_and_upload_success(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload"
    ) as mock_upload:
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "success"
    assert result.error is None
    mock_upload.assert_called_once()
    # Verify the uploaded file was renamed according to the pattern
    uploaded_path = mock_upload.call_args[0][0]
    assert "NYT Crossword" in uploaded_path.name


@pytest.mark.asyncio
async def test_fetch_and_upload_nyt_auth_error(orchestrator):
    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock,
        side_effect=NytAuthError("cookie expired")
    ):
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "error"
    assert "cookie" in result.error.lower()


@pytest.mark.asyncio
async def test_fetch_and_upload_remarkable_error(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload",
        side_effect=RemarkableUploadError("network error")
    ):
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "error"
    assert "network error" in result.error.lower()


@pytest.mark.asyncio
async def test_fetch_and_upload_records_history(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload"
    ):
        await orchestrator.fetch_and_upload(date(2026, 4, 23))

    records = orchestrator._history.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_orchestrator.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the orchestrator**

`src/nyt_crossword_remarkable/services/orchestrator.py`:
```python
"""Orchestrates the fetch-and-upload pipeline."""

import shutil
from datetime import date, datetime
from pathlib import Path

from nyt_crossword_remarkable.config import DEFAULT_CACHE_DIR, DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.history import FetchRecord, History
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher, NytAuthError, NytFetchError
from nyt_crossword_remarkable.services.remarkable import (
    RemarkableUploader,
    RemarkableAuthError,
    RemarkableUploadError,
)


def _format_filename(pattern: str, puzzle_date: date) -> str:
    """Format the file name pattern with the puzzle date.

    Supports: {Mon DD, YYYY} → Apr 23, 2026
    """
    formatted = pattern.replace("{Mon DD, YYYY}", puzzle_date.strftime("%b %d, %Y"))
    return formatted


class Orchestrator:
    def __init__(
        self,
        nyt_cookie: str,
        remarkable_folder: str = "/Crosswords",
        file_pattern: str = "NYT Crossword - {Mon DD, YYYY}",
        cache_dir: Path = DEFAULT_CACHE_DIR,
        history_path: Path = DEFAULT_HISTORY_PATH,
    ):
        self._fetcher = NytFetcher(cookie=nyt_cookie)
        self._uploader = RemarkableUploader(folder=remarkable_folder)
        self._history = History(path=history_path)
        self._file_pattern = file_pattern
        self._cache_dir = cache_dir

    async def fetch_and_upload(self, puzzle_date: date) -> FetchRecord:
        """Fetch the crossword PDF and upload it to the reMarkable."""
        record = FetchRecord(
            puzzle_date=puzzle_date,
            fetched_at=datetime.now(),
            status="success",
        )

        try:
            pdf_path = await self._fetcher.fetch_pdf(puzzle_date, cache_dir=self._cache_dir)

            # Rename to the configured pattern for upload
            filename = _format_filename(self._file_pattern, puzzle_date) + ".pdf"
            upload_path = pdf_path.parent / filename
            if upload_path != pdf_path:
                shutil.copy2(pdf_path, upload_path)

            self._uploader.upload(upload_path)

        except NytAuthError as e:
            record.status = "error"
            record.error = str(e)
        except (NytFetchError, RemarkableAuthError, RemarkableUploadError) as e:
            record.status = "error"
            record.error = str(e)
        except Exception as e:
            record.status = "error"
            record.error = f"Unexpected error: {e}"

        self._history.add(record)
        return record
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_orchestrator.py -v
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/orchestrator.py tests/test_orchestrator.py
git commit -m "feat: add orchestrator for fetch-and-upload pipeline"
```

---

### Task 7: CLI Commands

**Files:**
- Create: `src/nyt_crossword_remarkable/cli.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_cli.py`:
```python
from datetime import date
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from typer.testing import CliRunner

from nyt_crossword_remarkable.cli import app
from nyt_crossword_remarkable.config import Config
from nyt_crossword_remarkable.services.history import FetchRecord

runner = CliRunner()


@pytest.fixture(autouse=True)
def mock_config(tmp_path: Path):
    config = Config()
    config.nyt.cookie = "test-cookie"
    with patch("nyt_crossword_remarkable.cli.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.cli.DEFAULT_CONFIG_PATH", tmp_path / "config.json"), \
         patch("nyt_crossword_remarkable.cli.DEFAULT_CACHE_DIR", tmp_path / "cache"), \
         patch("nyt_crossword_remarkable.cli.DEFAULT_HISTORY_PATH", tmp_path / "history.json"):
        yield config


def test_fetch_today():
    mock_record = FetchRecord(
        puzzle_date=date.today(),
        fetched_at="2026-04-23T22:00:00",
        status="success",
    )

    with patch(
        "nyt_crossword_remarkable.cli._run_fetch",
        return_value=mock_record,
    ):
        result = runner.invoke(app, ["fetch"])

    assert result.exit_code == 0
    assert "success" in result.stdout.lower() or "Success" in result.stdout


def test_fetch_specific_date():
    mock_record = FetchRecord(
        puzzle_date=date(2026, 4, 20),
        fetched_at="2026-04-23T22:00:00",
        status="success",
    )

    with patch(
        "nyt_crossword_remarkable.cli._run_fetch",
        return_value=mock_record,
    ):
        result = runner.invoke(app, ["fetch", "--date", "2026-04-20"])

    assert result.exit_code == 0


def test_fetch_no_cookie():
    with patch("nyt_crossword_remarkable.cli.load_config") as mock_load:
        config = Config()
        config.nyt.cookie = ""
        mock_load.return_value = config
        result = runner.invoke(app, ["fetch"])

    assert result.exit_code != 0 or "no nyt cookie" in result.stdout.lower()


def test_status_command():
    with patch(
        "nyt_crossword_remarkable.cli._check_nyt", return_value=True
    ), patch(
        "nyt_crossword_remarkable.cli._check_remarkable", return_value=True
    ):
        result = runner.invoke(app, ["status"])

    assert result.exit_code == 0
    assert "nyt" in result.stdout.lower()
    assert "remarkable" in result.stdout.lower()


def test_set_cookie():
    with patch("nyt_crossword_remarkable.cli.save_config") as mock_save:
        result = runner.invoke(app, ["set-cookie", "my-nyt-s-value"])

    assert result.exit_code == 0
    assert "saved" in result.stdout.lower() or "cookie" in result.stdout.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cli.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the CLI**

`src/nyt_crossword_remarkable/cli.py`:
```python
"""CLI interface for nyt-crossword-remarkable."""

import asyncio
from datetime import date, datetime
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from nyt_crossword_remarkable.config import (
    Config,
    load_config,
    save_config,
    DEFAULT_CONFIG_PATH,
    DEFAULT_CACHE_DIR,
    DEFAULT_HISTORY_PATH,
)
from nyt_crossword_remarkable.services.history import FetchRecord, History
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher
from nyt_crossword_remarkable.services.orchestrator import Orchestrator
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader, RmapiNotFoundError

app = typer.Typer(
    name="nyt-crossword-remarkable",
    help="Deliver the daily NYT crossword to your reMarkable tablet.",
)
console = Console()


def _run_fetch(puzzle_date: date, config: Config) -> FetchRecord:
    """Run the fetch-and-upload pipeline synchronously (wraps async)."""
    orchestrator = Orchestrator(
        nyt_cookie=config.nyt.cookie,
        remarkable_folder=config.remarkable.folder,
        file_pattern=config.remarkable.file_pattern,
        cache_dir=DEFAULT_CACHE_DIR,
        history_path=DEFAULT_HISTORY_PATH,
    )
    return asyncio.run(orchestrator.fetch_and_upload(puzzle_date))


def _check_nyt(cookie: str) -> bool:
    fetcher = NytFetcher(cookie=cookie)
    return asyncio.run(fetcher.check_cookie())


def _check_remarkable() -> bool:
    uploader = RemarkableUploader()
    return uploader.check_connection()


@app.command()
def fetch(
    date_str: Optional[str] = typer.Option(
        None, "--date", "-d", help="Puzzle date (YYYY-MM-DD). Defaults to today."
    ),
) -> None:
    """Fetch a crossword and upload it to your reMarkable."""
    config = load_config()

    if not config.nyt.cookie:
        console.print("[red]No NYT cookie configured.[/red] Run: nyt-crossword-remarkable set-cookie <value>")
        raise typer.Exit(code=1)

    puzzle_date = date.fromisoformat(date_str) if date_str else date.today()
    console.print(f"Fetching crossword for [bold]{puzzle_date.isoformat()}[/bold]...")

    record = _run_fetch(puzzle_date, config)

    if record.status == "success":
        console.print(f"[green]Success![/green] Uploaded to {config.remarkable.folder}")
    else:
        console.print(f"[red]Failed:[/red] {record.error}")
        raise typer.Exit(code=1)


@app.command()
def status() -> None:
    """Check connection status for NYT and reMarkable."""
    config = load_config()

    table = Table(title="Connection Status")
    table.add_column("Service", style="bold")
    table.add_column("Status")
    table.add_column("Details")

    # NYT
    if not config.nyt.cookie:
        table.add_row("NYT", "[yellow]Not Configured[/yellow]", "Run: set-cookie <value>")
    else:
        nyt_ok = _check_nyt(config.nyt.cookie)
        if nyt_ok:
            age = ""
            if config.nyt.cookie_set_at:
                days = (datetime.now() - config.nyt.cookie_set_at).days
                age = f" (set {days} days ago)"
            table.add_row("NYT", "[green]Connected[/green]", f"Cookie valid{age}")
        else:
            table.add_row("NYT", "[red]Expired[/red]", "Run: set-cookie <new-value>")

    # reMarkable
    try:
        uploader = RemarkableUploader(folder=config.remarkable.folder)
        uploader.check_rmapi()
        rm_ok = _check_remarkable()
        if rm_ok:
            table.add_row("reMarkable", "[green]Connected[/green]", f"Folder: {config.remarkable.folder}")
        else:
            table.add_row("reMarkable", "[red]Disconnected[/red]", "Check rmapi auth")
    except RmapiNotFoundError:
        table.add_row("reMarkable", "[yellow]Not Installed[/yellow]", "Install rmapi first")

    console.print(table)


@app.command(name="set-cookie")
def set_cookie(
    cookie: str = typer.Argument(help="Your NYT-S cookie value"),
) -> None:
    """Save your NYT authentication cookie."""
    config = load_config()
    # Strip "NYT-S=" prefix if the user included it
    cookie = cookie.removeprefix("NYT-S=").strip()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    console.print("[green]Cookie saved.[/green]")


@app.command()
def history(
    limit: int = typer.Option(10, "--limit", "-n", help="Number of records to show"),
) -> None:
    """Show recent fetch history."""
    hist = History(path=DEFAULT_HISTORY_PATH)
    records = hist.recent(limit)

    if not records:
        console.print("No fetch history yet.")
        return

    table = Table(title="Fetch History")
    table.add_column("Puzzle Date")
    table.add_column("Fetched At")
    table.add_column("Status")
    table.add_column("Error")

    for r in records:
        status_str = "[green]success[/green]" if r.status == "success" else f"[red]{r.status}[/red]"
        table.add_row(
            r.puzzle_date.isoformat(),
            r.fetched_at.strftime("%Y-%m-%d %H:%M"),
            status_str,
            r.error or "",
        )

    console.print(table)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_cli.py -v
```

Expected: all 5 tests PASS

- [ ] **Step 5: Verify the CLI works interactively**

```bash
source .venv/bin/activate
nyt-crossword-remarkable --help
nyt-crossword-remarkable fetch --help
nyt-crossword-remarkable status
nyt-crossword-remarkable history
```

Expected:
- `--help` shows command list (fetch, status, set-cookie, history)
- `status` shows table with NYT: Not Configured, reMarkable: Not Installed (or Disconnected)
- `history` shows "No fetch history yet."

- [ ] **Step 6: Commit**

```bash
git add src/nyt_crossword_remarkable/cli.py tests/test_cli.py
git commit -m "feat: add CLI commands — fetch, status, set-cookie, history"
```

---

### Task 8: Scheduler Service

**Files:**
- Create: `src/nyt_crossword_remarkable/services/scheduler.py`
- Create: `tests/test_scheduler.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_scheduler.py`:
```python
from datetime import date
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch
from nyt_crossword_remarkable.config import ScheduleConfig


def test_build_cron_trigger_all_days():
    config = ScheduleConfig(
        days=["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        time="22:00",
        timezone="America/New_York",
    )
    trigger = build_cron_trigger(config)
    assert trigger.hour == 22
    assert trigger.minute == 0
    assert trigger.day_of_week == "mon,tue,wed,thu,fri,sat,sun"


def test_build_cron_trigger_weekends():
    config = ScheduleConfig(
        days=["sat", "sun"],
        time="09:30",
        timezone="US/Eastern",
    )
    trigger = build_cron_trigger(config)
    assert trigger.hour == 9
    assert trigger.minute == 30
    assert trigger.day_of_week == "sat,sun"


def test_build_cron_trigger_timezone():
    config = ScheduleConfig(
        days=["mon"],
        time="22:00",
        timezone="America/Chicago",
    )
    trigger = build_cron_trigger(config)
    assert str(trigger.timezone) == "America/Chicago"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_scheduler.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the scheduler**

`src/nyt_crossword_remarkable/services/scheduler.py`:
```python
"""Scheduler for automatic daily crossword fetching."""

import logging
from datetime import date

from apscheduler.triggers.cron import CronTrigger

from nyt_crossword_remarkable.config import Config, ScheduleConfig, load_config, DEFAULT_CACHE_DIR, DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.orchestrator import Orchestrator

logger = logging.getLogger(__name__)


def build_cron_trigger(schedule: ScheduleConfig) -> CronTrigger:
    """Build an APScheduler CronTrigger from the schedule config."""
    hour, minute = schedule.time.split(":")
    return CronTrigger(
        day_of_week=",".join(schedule.days),
        hour=int(hour),
        minute=int(minute),
        timezone=schedule.timezone,
    )


async def scheduled_fetch() -> None:
    """Job function called by the scheduler. Loads config fresh each run."""
    config = load_config()

    if not config.nyt.cookie:
        logger.error("Scheduled fetch skipped: no NYT cookie configured")
        return

    orchestrator = Orchestrator(
        nyt_cookie=config.nyt.cookie,
        remarkable_folder=config.remarkable.folder,
        file_pattern=config.remarkable.file_pattern,
        cache_dir=DEFAULT_CACHE_DIR,
        history_path=DEFAULT_HISTORY_PATH,
    )

    puzzle_date = date.today()
    logger.info(f"Scheduled fetch starting for {puzzle_date.isoformat()}")

    record = await orchestrator.fetch_and_upload(puzzle_date)

    if record.status == "success":
        logger.info(f"Scheduled fetch succeeded for {puzzle_date.isoformat()}")
    else:
        logger.error(f"Scheduled fetch failed for {puzzle_date.isoformat()}: {record.error}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_scheduler.py -v
```

Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/scheduler.py tests/test_scheduler.py
git commit -m "feat: add scheduler with configurable cron triggers"
```

---

### Task 9: Serve Command (FastAPI + Scheduler Startup)

**Files:**
- Create: `src/nyt_crossword_remarkable/server.py`
- Modify: `src/nyt_crossword_remarkable/cli.py` (add `serve` command)
- Create: `tests/test_server.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_server.py`:
```python
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from nyt_crossword_remarkable.cli import app

runner = CliRunner()


def test_serve_command_exists():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0
    assert "host" in result.stdout.lower()
    assert "port" in result.stdout.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_server.py -v
```

Expected: FAIL — no `serve` command yet

- [ ] **Step 3: Implement the server module**

`src/nyt_crossword_remarkable/server.py`:
```python
"""FastAPI server — serves the API and (eventually) the React frontend."""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="NYT Crossword → reMarkable", version="0.1.0")
    scheduler = AsyncIOScheduler()

    @app.on_event("startup")
    async def startup():
        config = load_config()
        if config.schedule.enabled:
            trigger = build_cron_trigger(config.schedule)
            scheduler.add_job(scheduled_fetch, trigger, id="daily_fetch", replace_existing=True)
            scheduler.start()
            logger.info(
                f"Scheduler started: {config.schedule.days} at {config.schedule.time} "
                f"{config.schedule.timezone}"
            )
        else:
            logger.info("Scheduler disabled in config")

    @app.on_event("shutdown")
    async def shutdown():
        if scheduler.running:
            scheduler.shutdown(wait=False)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app
```

- [ ] **Step 4: Add the serve command to cli.py**

Add this to the bottom of `src/nyt_crossword_remarkable/cli.py`, before the last line if any:

```python
@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="Bind address"),
    port: int = typer.Option(8080, "--port", "-p", help="Bind port"),
) -> None:
    """Start the web server and scheduler."""
    import uvicorn
    from nyt_crossword_remarkable.server import create_app

    console.print(f"Starting server at [bold]http://{host}:{port}[/bold]")
    server_app = create_app()
    uvicorn.run(server_app, host=host, port=port)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_server.py tests/test_cli.py -v
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/nyt_crossword_remarkable/server.py src/nyt_crossword_remarkable/cli.py tests/test_server.py
git commit -m "feat: add serve command with FastAPI + scheduler startup"
```

---

### Task 10: End-to-End Manual Verification

No new files — this task verifies the full pipeline works.

- [ ] **Step 1: Install rmapi**

```bash
# Option A: if Go is installed
go install github.com/ddvk/rmapi@latest

# Option B: download binary from GitHub releases
# https://github.com/ddvk/rmapi/releases
```

- [ ] **Step 2: Register rmapi with your reMarkable**

```bash
rmapi
# First run will prompt: "Enter one-time code from https://my.remarkable.com/connect/desktop"
# Go to that URL, log in, get the code, paste it.
# Then run:
rmapi ls /
```

Expected: lists your reMarkable folders

- [ ] **Step 3: Set your NYT cookie**

Extract the `NYT-S` cookie from your browser:
1. Go to nytimes.com, log in
2. Open DevTools → Application → Cookies → nytimes.com
3. Find `NYT-S`, copy the value

```bash
source .venv/bin/activate
nyt-crossword-remarkable set-cookie "YOUR_NYT_S_VALUE_HERE"
```

Expected: "Cookie saved."

- [ ] **Step 4: Check status**

```bash
nyt-crossword-remarkable status
```

Expected: NYT: Connected, reMarkable: Connected

- [ ] **Step 5: Fetch today's crossword**

```bash
nyt-crossword-remarkable fetch
```

Expected: "Success! Uploaded to /Crosswords"

- [ ] **Step 6: Verify on your reMarkable**

Open your reMarkable tablet. Check the `/Crosswords` folder. You should see today's crossword PDF.

- [ ] **Step 7: Fetch a past date**

```bash
nyt-crossword-remarkable fetch --date 2026-04-20
```

Expected: "Success! Uploaded to /Crosswords"

- [ ] **Step 8: Check history**

```bash
nyt-crossword-remarkable history
```

Expected: table showing 2 successful fetches

- [ ] **Step 9: Start the server**

```bash
nyt-crossword-remarkable serve
```

Expected: server starts, scheduler logs show the configured schedule. Hit `http://localhost:8080/api/health` in a browser — should return `{"status": "ok"}`.

- [ ] **Step 10: Run full test suite**

```bash
pytest -v
```

Expected: all tests PASS

- [ ] **Step 11: Commit any fixes from manual testing**

```bash
git add -u
git commit -m "fix: adjustments from end-to-end testing"
```
