import json
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from nyt_crossword_remarkable.config import Config
from nyt_crossword_remarkable.services.history import FetchRecord, History
from nyt_crossword_remarkable.services.fetch_state import fetch_state, FetchPhase


@pytest.fixture
def tmp_paths(tmp_path: Path):
    return {
        "config_path": tmp_path / "config.json",
        "history_path": tmp_path / "history.json",
        "cache_dir": tmp_path / "cache",
    }


@pytest.fixture
def app(tmp_paths):
    config = Config()
    config.nyt.cookie = "test-cookie"
    config.nyt.cookie_set_at = datetime(2026, 4, 1)

    with patch("nyt_crossword_remarkable.api.routes_health.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_history.DEFAULT_HISTORY_PATH", tmp_paths["history_path"]), \
         patch("nyt_crossword_remarkable.api.routes_fetch.load_config", return_value=config), \
         patch("nyt_crossword_remarkable.api.routes_fetch.DEFAULT_CACHE_DIR", tmp_paths["cache_dir"]), \
         patch("nyt_crossword_remarkable.api.routes_fetch.DEFAULT_HISTORY_PATH", tmp_paths["history_path"]), \
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
            instance.check_rmapi.return_value = None
            r = client.get("/api/health/remarkable")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestHistoryRoutes:
    def test_history_empty(self, client):
        r = client.get("/api/history?year=2026")
        assert r.status_code == 200
        assert r.json() == []

    def test_history_with_data(self, client, tmp_paths):
        hist = History(path=tmp_paths["history_path"])
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
        r = client.post("/api/auth/nyt/cookie", json={"cookie": "manual-cookie-value=="})
        assert r.status_code == 200

    def test_remarkable_pair(self, client):
        with patch("nyt_crossword_remarkable.api.routes_auth.RemarkableUploader") as MockUploader:
            instance = MockUploader.return_value
            instance.check_connection.return_value = True
            with patch("nyt_crossword_remarkable.api.routes_auth.subprocess") as mock_sub:
                mock_sub.run.return_value = MagicMock(returncode=0, stdout="", stderr="")
                r = client.post("/api/auth/remarkable/pair", json={"code": "abcd1234"})
        assert r.status_code == 200
