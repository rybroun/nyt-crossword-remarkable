import platform
from pathlib import Path
from unittest.mock import patch

import pytest

from nyt_crossword_remarkable.services.rmapi_installer import (
    get_asset_filename,
    get_rmapi_path,
    is_installed,
    UnsupportedPlatformError,
    RMAPI_BIN_PATH,
)


def test_get_asset_filename_mac_arm():
    with patch("platform.system", return_value="Darwin"), \
         patch("platform.machine", return_value="arm64"):
        assert get_asset_filename() == "rmapi-macos-arm64.zip"


def test_get_asset_filename_mac_intel():
    with patch("platform.system", return_value="Darwin"), \
         patch("platform.machine", return_value="x86_64"):
        assert get_asset_filename() == "rmapi-macos-intel.zip"


def test_get_asset_filename_linux_amd64():
    with patch("platform.system", return_value="Linux"), \
         patch("platform.machine", return_value="x86_64"):
        assert get_asset_filename() == "rmapi-linux-amd64.tar.gz"


def test_get_asset_filename_linux_arm64():
    with patch("platform.system", return_value="Linux"), \
         patch("platform.machine", return_value="aarch64"):
        assert get_asset_filename() == "rmapi-linux-arm64.tar.gz"


def test_get_asset_filename_unsupported():
    with patch("platform.system", return_value="Windows"), \
         patch("platform.machine", return_value="AMD64"):
        with pytest.raises(UnsupportedPlatformError):
            get_asset_filename()


def test_is_installed_false(tmp_path: Path):
    with patch("nyt_crossword_remarkable.services.rmapi_installer.RMAPI_BIN_PATH", tmp_path / "rmapi"):
        assert is_installed() is False


def test_is_installed_true(tmp_path: Path):
    fake_bin = tmp_path / "rmapi"
    fake_bin.write_text("#!/bin/sh\necho fake")
    fake_bin.chmod(0o755)
    with patch("nyt_crossword_remarkable.services.rmapi_installer.RMAPI_BIN_PATH", fake_bin):
        assert is_installed() is True


def test_get_rmapi_path_local(tmp_path: Path):
    fake_bin = tmp_path / "rmapi"
    fake_bin.write_text("#!/bin/sh\necho fake")
    fake_bin.chmod(0o755)
    with patch("nyt_crossword_remarkable.services.rmapi_installer.RMAPI_BIN_PATH", fake_bin), \
         patch("nyt_crossword_remarkable.services.rmapi_installer.is_installed", return_value=True):
        assert get_rmapi_path() == str(fake_bin)


def test_get_rmapi_path_system():
    with patch("nyt_crossword_remarkable.services.rmapi_installer.is_installed", return_value=False):
        assert get_rmapi_path() == "rmapi"
