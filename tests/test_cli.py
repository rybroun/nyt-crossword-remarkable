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
