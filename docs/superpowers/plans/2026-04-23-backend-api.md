# Backend API Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the FastAPI server with all REST endpoints the React frontend needs — health, history, fetch (with SSE progress), schedule, settings, and auth (NYT login + reMarkable pairing).

**Architecture:** Add route modules under `src/nyt_crossword_remarkable/api/`, each focused on one API domain. Enhance the existing History and FetchRecord models to include file size. Add an NYT login service. Wire all routes into the existing `create_app()` in server.py. Use Server-Sent Events (SSE) for live fetch progress.

**Tech Stack:** FastAPI, httpx, sse-starlette, pydantic v2, pytest, respx

---

## File Structure

```
src/nyt_crossword_remarkable/
├── server.py                          # Modify: include routers, CORS, static files
├── api/
│   ├── __init__.py                    # New
│   ├── routes_health.py               # New: GET /api/health, /api/health/nyt, /api/health/remarkable
│   ├── routes_history.py              # New: GET /api/history
│   ├── routes_fetch.py                # New: POST /api/fetch, GET /api/fetch/status (SSE)
│   ├── routes_schedule.py             # New: GET/PUT /api/schedule, POST /api/schedule/pause
│   ├── routes_settings.py             # New: GET/PUT /api/settings
│   └── routes_auth.py                 # New: POST /api/auth/nyt/login, /api/auth/nyt/cookie, /api/auth/remarkable/pair
├── services/
│   ├── history.py                     # Modify: add size field, by_year query
│   ├── nyt_fetcher.py                 # Modify: add login method, return file size
│   ├── orchestrator.py                # Modify: emit progress events, track file size
│   └── fetch_state.py                 # New: in-memory fetch progress tracking
└── config.py                          # Modify: add paused_until field
```

---

### Task 1: Enhance History Model

**Files:**
- Modify: `src/nyt_crossword_remarkable/services/history.py`
- Modify: `tests/test_history.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_history.py`:
```python
def test_fetch_record_with_size(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
        size_bytes=223744,
        filename="NYT Crossword - Apr 23, 2026.pdf",
    ))
    records = history.recent(10)
    assert records[0].size_bytes == 223744
    assert records[0].filename == "NYT Crossword - Apr 23, 2026.pdf"


def test_by_year(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2025, 12, 31),
        fetched_at=datetime(2025, 12, 31, 22, 0, 0),
        status="success",
    ))
    history.add(FetchRecord(
        puzzle_date=date(2026, 1, 1),
        fetched_at=datetime(2026, 1, 1, 22, 0, 0),
        status="success",
    ))
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="error",
        error="cookie expired",
    ))

    records_2026 = history.by_year(2026)
    assert len(records_2026) == 2
    assert all(r.puzzle_date.year == 2026 for r in records_2026)

    records_2025 = history.by_year(2025)
    assert len(records_2025) == 1


def test_by_year_empty(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    assert history.by_year(2026) == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source .venv/bin/activate
pytest tests/test_history.py -v
```

Expected: FAIL — `FetchRecord` doesn't accept `size_bytes`/`filename`, `History` has no `by_year`

- [ ] **Step 3: Update FetchRecord and History**

In `src/nyt_crossword_remarkable/services/history.py`, update FetchRecord:
```python
class FetchRecord(BaseModel):
    puzzle_date: date
    fetched_at: datetime
    status: str  # "success" or "error"
    error: Optional[str] = None
    size_bytes: Optional[int] = None
    filename: Optional[str] = None
```

Add `by_year` method to History:
```python
    def by_year(self, year: int) -> list[FetchRecord]:
        """Return all records for a given year, sorted by puzzle_date."""
        return sorted(
            [r for r in self._records if r.puzzle_date.year == year],
            key=lambda r: r.puzzle_date,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_history.py -v
```

Expected: all tests PASS (old + new)

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/history.py tests/test_history.py
git commit -m "feat: add size_bytes, filename to FetchRecord; add by_year query"
```

---

### Task 2: Fetch Progress State

**Files:**
- Create: `src/nyt_crossword_remarkable/services/fetch_state.py`
- Create: `tests/test_fetch_state.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_fetch_state.py`:
```python
import asyncio
from datetime import date

from nyt_crossword_remarkable.services.fetch_state import FetchProgress, FetchPhase, fetch_state


def test_initial_state():
    state = FetchProgress()
    assert state.phase == FetchPhase.IDLE
    assert state.progress == 0
    assert state.log == []


def test_update_phase():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 0)
    assert state.phase == FetchPhase.DOWNLOAD
    assert state.progress == 0


def test_add_log():
    state = FetchProgress()
    state.add_log("Starting download")
    assert len(state.log) == 1
    assert state.log[0]["msg"] == "Starting download"


def test_complete():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 50)
    state.complete()
    assert state.phase == FetchPhase.DONE
    assert state.progress == 100


def test_reset():
    state = FetchProgress()
    state.set_phase(FetchPhase.UPLOAD, 80)
    state.add_log("uploading")
    state.reset()
    assert state.phase == FetchPhase.IDLE
    assert state.progress == 0
    assert state.log == []


def test_to_dict():
    state = FetchProgress()
    state.set_phase(FetchPhase.DOWNLOAD, 50)
    state.add_log("HTTP 200", kind="ok")
    d = state.to_dict()
    assert d["phase"] == "download"
    assert d["progress"] == 50
    assert len(d["log"]) == 1
    assert d["log"][0]["kind"] == "ok"


def test_global_fetch_state():
    """The module-level fetch_state is a singleton."""
    fetch_state.reset()
    assert fetch_state.phase == FetchPhase.IDLE
    fetch_state.set_phase(FetchPhase.UPLOAD, 75)
    assert fetch_state.phase == FetchPhase.UPLOAD
    fetch_state.reset()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_fetch_state.py -v
```

- [ ] **Step 3: Implement fetch state**

`src/nyt_crossword_remarkable/services/fetch_state.py`:
```python
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


# Module-level singleton — shared between API routes and orchestrator
fetch_state = FetchProgress()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_fetch_state.py -v
```

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/fetch_state.py tests/test_fetch_state.py
git commit -m "feat: add in-memory fetch progress tracking"
```

---

### Task 3: NYT Login Service

**Files:**
- Modify: `src/nyt_crossword_remarkable/services/nyt_fetcher.py`
- Create: `tests/test_nyt_login.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_nyt_login.py`:
```python
import httpx
import pytest
import respx

from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher, NytLoginError


class TestNytLogin:
    @respx.mock
    @pytest.mark.asyncio
    async def test_login_success(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(200, json={
                "data": {
                    "cookies": [
                        {"name": "NYT-S", "cipheredValue": "abc123cookievalue=="},
                        {"name": "other", "cipheredValue": "ignore"},
                    ]
                }
            })
        )

        cookie = await NytFetcher.login("user@example.com", "password123")
        assert cookie == "abc123cookievalue=="

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(403, json={"error": "invalid credentials"})
        )

        with pytest.raises(NytLoginError, match="credentials"):
            await NytFetcher.login("user@example.com", "wrongpass")

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_blocked(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(429)
        )

        with pytest.raises(NytLoginError):
            await NytFetcher.login("user@example.com", "password123")

    @respx.mock
    @pytest.mark.asyncio
    async def test_login_no_cookie_in_response(self):
        respx.post("https://myaccount.nytimes.com/svc/ios/v2/login").mock(
            return_value=httpx.Response(200, json={
                "data": {"cookies": [{"name": "other", "cipheredValue": "val"}]}
            })
        )

        with pytest.raises(NytLoginError, match="NYT-S"):
            await NytFetcher.login("user@example.com", "password123")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_nyt_login.py -v
```

- [ ] **Step 3: Add login method and NytLoginError to nyt_fetcher.py**

Add at the top of `src/nyt_crossword_remarkable/services/nyt_fetcher.py`, after the existing exceptions:
```python
class NytLoginError(Exception):
    """Raised when NYT login fails."""

NYT_LOGIN_URL = "https://myaccount.nytimes.com/svc/ios/v2/login"
```

Add as a static method on `NytFetcher`:
```python
    @staticmethod
    async def login(email: str, password: str) -> str:
        """Log in to NYT and return the NYT-S cookie value.

        Uses the undocumented iOS app login endpoint. May be blocked by NYT.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                NYT_LOGIN_URL,
                data={"login": email, "password": password},
                headers={
                    "User-Agent": "Crossword/1844.220922 CFNetwork/1335.0.3 Darwin/21.6.0",
                    "client_id": "ios.crosswords",
                },
            )

        if response.status_code == 403:
            raise NytLoginError("Invalid credentials or login blocked by NYT.")
        if response.status_code != 200:
            raise NytLoginError(f"NYT login failed: HTTP {response.status_code}")

        try:
            cookies = response.json()["data"]["cookies"]
            for cookie in cookies:
                if cookie["name"] == "NYT-S":
                    return cookie["cipheredValue"]
            raise NytLoginError("NYT-S cookie not found in login response.")
        except (KeyError, TypeError) as e:
            raise NytLoginError(f"Unexpected login response format: {e}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_nyt_login.py -v
```

- [ ] **Step 5: Commit**

```bash
git add src/nyt_crossword_remarkable/services/nyt_fetcher.py tests/test_nyt_login.py
git commit -m "feat: add NYT programmatic login via iOS endpoint"
```

---

### Task 4: API Route Modules

**Files:**
- Create: `src/nyt_crossword_remarkable/api/__init__.py`
- Create: `src/nyt_crossword_remarkable/api/routes_health.py`
- Create: `src/nyt_crossword_remarkable/api/routes_history.py`
- Create: `src/nyt_crossword_remarkable/api/routes_fetch.py`
- Create: `src/nyt_crossword_remarkable/api/routes_schedule.py`
- Create: `src/nyt_crossword_remarkable/api/routes_settings.py`
- Create: `src/nyt_crossword_remarkable/api/routes_auth.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Install sse-starlette**

Add `"sse-starlette>=2.0.0"` to the `server` optional dependencies in `pyproject.toml`, then:
```bash
pip install -e ".[server]"
```

- [ ] **Step 2: Write the tests**

`tests/test_api.py`:
```python
import json
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from nyt_crossword_remarkable.config import Config, save_config
from nyt_crossword_remarkable.services.history import FetchRecord, History
from nyt_crossword_remarkable.services.fetch_state import fetch_state, FetchPhase


@pytest.fixture
def config_dir(tmp_path: Path):
    config_path = tmp_path / "config.json"
    history_path = tmp_path / "history.json"
    cache_dir = tmp_path / "cache"
    return {
        "config_path": config_path,
        "history_path": history_path,
        "cache_dir": cache_dir,
    }


@pytest.fixture
def app(config_dir):
    config = Config()
    config.nyt.cookie = "test-cookie"
    config.nyt.cookie_set_at = datetime(2026, 4, 1)
    save_config(config, config_dir["config_path"])

    with patch("nyt_crossword_remarkable.api.routes_health.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_history.DEFAULT_HISTORY_PATH", config_dir["history_path"]), \
         patch("nyt_crossword_remarkable.api.routes_fetch.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_fetch.DEFAULT_CACHE_DIR", config_dir["cache_dir"]), \
         patch("nyt_crossword_remarkable.api.routes_fetch.DEFAULT_HISTORY_PATH", config_dir["history_path"]), \
         patch("nyt_crossword_remarkable.api.routes_schedule.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_schedule.save_config"), \
         patch("nyt_crossword_remarkable.api.routes_settings.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_settings.save_config"), \
         patch("nyt_crossword_remarkable.api.routes_auth.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_auth.save_config"):

        from nyt_crossword_remarkable.server import create_app
        application = create_app()
        yield application


@pytest.fixture
def client(app):
    return TestClient(app)


class TestHealthRoutes:
    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_health_nyt_ok(self, client):
        with patch("nyt_crossword_remarkable.api.routes_health.NytFetcher") as MockFetcher:
            instance = MockFetcher.return_value
            instance.check_cookie = AsyncMock(return_value=True)
            r = client.get("/api/health/nyt")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_health_remarkable_ok(self, client):
        with patch("nyt_crossword_remarkable.api.routes_health.RemarkableUploader") as MockUploader:
            instance = MockUploader.return_value
            instance.check_connection.return_value = True
            r = client.get("/api/health/remarkable")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestHistoryRoutes:
    def test_history_empty(self, client, config_dir):
        r = client.get("/api/history?year=2026")
        assert r.status_code == 200
        assert r.json() == []

    def test_history_with_data(self, client, config_dir):
        hist = History(path=config_dir["history_path"])
        hist.add(FetchRecord(
            puzzle_date=date(2026, 4, 23),
            fetched_at=datetime(2026, 4, 23, 22, 0, 0),
            status="success",
            size_bytes=218000,
            filename="NYT Crossword - Apr 23, 2026.pdf",
        ))
        r = client.get("/api/history?year=2026")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["puzzle_date"] == "2026-04-23"
        assert data[0]["status"] == "success"


class TestScheduleRoutes:
    def test_get_schedule(self, client):
        r = client.get("/api/schedule")
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert "days" in data

    def test_update_schedule(self, client):
        r = client.put("/api/schedule", json={
            "days": ["mon", "wed", "fri"],
            "time": "21:00",
            "timezone": "America/New_York",
            "enabled": True,
        })
        assert r.status_code == 200


class TestSettingsRoutes:
    def test_get_settings(self, client):
        r = client.get("/api/settings")
        assert r.status_code == 200
        data = r.json()
        assert data["remarkable_folder"] == "/Crosswords"

    def test_update_settings(self, client):
        r = client.put("/api/settings", json={
            "remarkable_folder": "/Puzzles",
            "file_pattern": "NYT {date}",
        })
        assert r.status_code == 200


class TestFetchRoutes:
    def test_fetch_status_idle(self, client):
        fetch_state.reset()
        r = client.get("/api/fetch/status")
        assert r.status_code == 200
        assert r.json()["phase"] == "idle"

    def test_trigger_fetch(self, client):
        with patch("nyt_crossword_remarkable.api.routes_fetch.run_fetch_in_background"):
            r = client.post("/api/fetch", json={"date": "2026-04-23"})
        assert r.status_code == 202
        assert "started" in r.json()["status"]


class TestAuthRoutes:
    def test_nyt_login(self, client):
        with patch("nyt_crossword_remarkable.api.routes_auth.NytFetcher") as MockFetcher:
            MockFetcher.login = AsyncMock(return_value="new-cookie-value==")
            r = client.post("/api/auth/nyt/login", json={
                "email": "user@example.com",
                "password": "pass123",
            })
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_nyt_cookie_paste(self, client):
        r = client.post("/api/auth/nyt/cookie", json={
            "cookie": "manual-cookie-value==",
        })
        assert r.status_code == 200

    def test_remarkable_pair(self, client):
        with patch("nyt_crossword_remarkable.api.routes_auth.RemarkableUploader") as MockUploader:
            instance = MockUploader.return_value
            instance.check_connection.return_value = True
            with patch("nyt_crossword_remarkable.api.routes_auth.subprocess") as mock_sub:
                mock_sub.run.return_value = MagicMock(returncode=0, stdout="", stderr="")
                r = client.post("/api/auth/remarkable/pair", json={
                    "code": "abcd1234",
                })
        assert r.status_code == 200
```

- [ ] **Step 3: Create API route modules**

`src/nyt_crossword_remarkable/api/__init__.py`: empty file.

`src/nyt_crossword_remarkable/api/routes_health.py`:
```python
"""Health check endpoints."""

from fastapi import APIRouter
from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader, RmapiNotFoundError

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health():
    return {"status": "ok"}


@router.get("/nyt")
async def health_nyt():
    config = load_config()
    if not config.nyt.cookie:
        return {"status": "not_configured", "cookie_age_days": None}

    fetcher = NytFetcher(cookie=config.nyt.cookie)
    valid = await fetcher.check_cookie()

    age_days = None
    if config.nyt.cookie_set_at:
        from datetime import datetime
        age_days = (datetime.now() - config.nyt.cookie_set_at).days

    return {
        "status": "ok" if valid else "expired",
        "cookie_age_days": age_days,
    }


@router.get("/remarkable")
async def health_remarkable():
    config = load_config()
    try:
        uploader = RemarkableUploader(folder=config.remarkable.folder)
        uploader.check_rmapi()
        connected = uploader.check_connection()
        return {
            "status": "ok" if connected else "disconnected",
            "folder": config.remarkable.folder,
        }
    except RmapiNotFoundError:
        return {"status": "not_installed", "folder": config.remarkable.folder}
```

`src/nyt_crossword_remarkable/api/routes_history.py`:
```python
"""History endpoints."""

from fastapi import APIRouter, Query
from nyt_crossword_remarkable.config import DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.history import History

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def get_history(year: int = Query(...)):
    history = History(path=DEFAULT_HISTORY_PATH)
    records = history.by_year(year)
    return [
        {
            "puzzle_date": r.puzzle_date.isoformat(),
            "fetched_at": r.fetched_at.isoformat(),
            "status": r.status,
            "error": r.error,
            "size_bytes": r.size_bytes,
            "filename": r.filename,
        }
        for r in records
    ]
```

`src/nyt_crossword_remarkable/api/routes_fetch.py`:
```python
"""Fetch endpoints — trigger and monitor crossword fetches."""

import asyncio
from datetime import date

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from nyt_crossword_remarkable.config import load_config, DEFAULT_CACHE_DIR, DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.fetch_state import fetch_state, FetchPhase
from nyt_crossword_remarkable.services.orchestrator import Orchestrator

router = APIRouter(prefix="/api/fetch", tags=["fetch"])


class FetchRequest(BaseModel):
    date: str  # ISO format YYYY-MM-DD


def run_fetch_in_background(puzzle_date: date) -> None:
    """Run the fetch pipeline in a background thread, updating fetch_state."""
    config = load_config()
    fetch_state.reset()
    fetch_state.puzzle_date = puzzle_date.isoformat()

    async def _run():
        fetch_state.set_phase(FetchPhase.DOWNLOAD, 0)
        fetch_state.add_log(f"Fetching puzzle for {puzzle_date.isoformat()}")

        orchestrator = Orchestrator(
            nyt_cookie=config.nyt.cookie,
            remarkable_folder=config.remarkable.folder,
            file_pattern=config.remarkable.file_pattern,
            cache_dir=DEFAULT_CACHE_DIR,
            history_path=DEFAULT_HISTORY_PATH,
        )

        fetch_state.set_phase(FetchPhase.DOWNLOAD, 30)
        record = await orchestrator.fetch_and_upload(puzzle_date)

        if record.status == "success":
            fetch_state.set_phase(FetchPhase.DONE, 100)
            fetch_state.add_log("Delivered successfully", kind="ok")
        else:
            fetch_state.set_phase(FetchPhase.DONE, 100)
            fetch_state.add_log(f"Failed: {record.error}", kind="err")

    asyncio.run(_run())


@router.post("", status_code=202)
async def trigger_fetch(req: FetchRequest, background_tasks: BackgroundTasks):
    if fetch_state.phase not in (FetchPhase.IDLE, FetchPhase.DONE):
        return {"status": "already_running", "phase": fetch_state.phase.value}

    puzzle_date = date.fromisoformat(req.date)
    background_tasks.add_task(run_fetch_in_background, puzzle_date)
    return {"status": "started", "date": req.date}


@router.get("/status")
async def fetch_status():
    return fetch_state.to_dict()
```

`src/nyt_crossword_remarkable/api/routes_schedule.py`:
```python
"""Schedule endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from nyt_crossword_remarkable.config import load_config, save_config

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


class ScheduleUpdate(BaseModel):
    days: list[str]
    time: str
    timezone: str
    enabled: bool


@router.get("")
async def get_schedule():
    config = load_config()
    return {
        "days": config.schedule.days,
        "time": config.schedule.time,
        "timezone": config.schedule.timezone,
        "enabled": config.schedule.enabled,
    }


@router.put("")
async def update_schedule(update: ScheduleUpdate):
    config = load_config()
    config.schedule.days = update.days
    config.schedule.time = update.time
    config.schedule.timezone = update.timezone
    config.schedule.enabled = update.enabled
    save_config(config)
    return {"status": "ok"}


@router.post("/pause")
async def pause_schedule():
    config = load_config()
    config.schedule.enabled = False
    save_config(config)
    return {"status": "paused"}
```

`src/nyt_crossword_remarkable/api/routes_settings.py`:
```python
"""Settings endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from nyt_crossword_remarkable.config import load_config, save_config

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    remarkable_folder: str
    file_pattern: str


@router.get("")
async def get_settings():
    config = load_config()
    return {
        "remarkable_folder": config.remarkable.folder,
        "file_pattern": config.remarkable.file_pattern,
    }


@router.put("")
async def update_settings(update: SettingsUpdate):
    config = load_config()
    config.remarkable.folder = update.remarkable_folder
    config.remarkable.file_pattern = update.file_pattern
    save_config(config)
    return {"status": "ok"}
```

`src/nyt_crossword_remarkable/api/routes_auth.py`:
```python
"""Authentication endpoints — NYT login and reMarkable pairing."""

import subprocess
from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from nyt_crossword_remarkable.config import load_config, save_config
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher, NytLoginError
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader
from nyt_crossword_remarkable.services.rmapi_installer import get_rmapi_path

router = APIRouter(prefix="/api/auth", tags=["auth"])


class NytLoginRequest(BaseModel):
    email: str
    password: str


class NytCookieRequest(BaseModel):
    cookie: str


class RemarkablePairRequest(BaseModel):
    code: str


@router.post("/nyt/login")
async def nyt_login(req: NytLoginRequest):
    try:
        cookie = await NytFetcher.login(req.email, req.password)
    except NytLoginError as e:
        return {"status": "error", "error": str(e)}

    config = load_config()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    return {"status": "ok"}


@router.post("/nyt/cookie")
async def nyt_cookie_paste(req: NytCookieRequest):
    cookie = req.cookie.removeprefix("NYT-S=").strip()
    config = load_config()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    return {"status": "ok"}


@router.post("/remarkable/pair")
async def remarkable_pair(req: RemarkablePairRequest):
    rmapi_path = get_rmapi_path()
    result = subprocess.run(
        [rmapi_path],
        input=req.code + "\n",
        capture_output=True,
        text=True,
        timeout=30,
    )

    uploader = RemarkableUploader()
    connected = uploader.check_connection()

    if connected:
        return {"status": "ok"}
    else:
        return {
            "status": "error",
            "error": result.stderr.strip() or "Pairing failed. Check the code and try again.",
        }
```

- [ ] **Step 4: Wire routers into server.py**

Replace `src/nyt_crossword_remarkable/server.py`:
```python
"""FastAPI server — serves the API and (eventually) the React frontend."""

import logging

from apscheduler import AsyncScheduler, ConflictPolicy
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from nyt_crossword_remarkable.api.routes_health import router as health_router
from nyt_crossword_remarkable.api.routes_history import router as history_router
from nyt_crossword_remarkable.api.routes_fetch import router as fetch_router
from nyt_crossword_remarkable.api.routes_schedule import router as schedule_router
from nyt_crossword_remarkable.api.routes_settings import router as settings_router
from nyt_crossword_remarkable.api.routes_auth import router as auth_router
from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="NYT Crossword → reMarkable", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(history_router)
    app.include_router(fetch_router)
    app.include_router(schedule_router)
    app.include_router(settings_router)
    app.include_router(auth_router)

    scheduler: AsyncScheduler | None = None

    @app.on_event("startup")
    async def startup():
        nonlocal scheduler
        config = load_config()
        if config.schedule.enabled:
            trigger = build_cron_trigger(config.schedule)
            scheduler = AsyncScheduler()
            await scheduler.__aenter__()
            await scheduler.add_schedule(
                scheduled_fetch,
                trigger,
                id="daily_fetch",
                conflict_policy=ConflictPolicy.replace,
            )
            logger.info(
                f"Scheduler started: {config.schedule.days} at {config.schedule.time} "
                f"{config.schedule.timezone}"
            )
        else:
            logger.info("Scheduler disabled in config")

    @app.on_event("shutdown")
    async def shutdown():
        nonlocal scheduler
        if scheduler is not None:
            await scheduler.__aexit__(None, None, None)

    return app
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_api.py -v
```

- [ ] **Step 6: Run full test suite**

```bash
pytest -v
```

Expected: all tests pass (existing + new API tests)

- [ ] **Step 7: Commit**

```bash
git add src/nyt_crossword_remarkable/api/ src/nyt_crossword_remarkable/server.py tests/test_api.py pyproject.toml
git commit -m "feat: add REST API routes for health, history, fetch, schedule, settings, auth"
```

---

### Task 5: Verify API end-to-end

No new files — manual verification.

- [ ] **Step 1: Start the server**

```bash
source .venv/bin/activate
nyt-crossword-remarkable serve
```

- [ ] **Step 2: Test endpoints**

```bash
# Health
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/nyt
curl http://localhost:8080/api/health/remarkable

# Schedule
curl http://localhost:8080/api/schedule

# Settings
curl http://localhost:8080/api/settings

# History
curl "http://localhost:8080/api/history?year=2026"

# Fetch status
curl http://localhost:8080/api/fetch/status

# Trigger fetch
curl -X POST http://localhost:8080/api/fetch -H "Content-Type: application/json" -d '{"date":"2026-04-23"}'

# Poll status
curl http://localhost:8080/api/fetch/status
```

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: API adjustments from manual testing"
```
