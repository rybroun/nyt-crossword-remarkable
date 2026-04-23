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
    assert config.server.port == 8742


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
