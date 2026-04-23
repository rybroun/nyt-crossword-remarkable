"""Auto-install rmapi binary from GitHub releases."""

import os
import platform
import shutil
import stat
import tarfile
import tempfile
import zipfile
from pathlib import Path

import httpx

from nyt_crossword_remarkable.config import DEFAULT_CONFIG_DIR

RMAPI_BIN_DIR = DEFAULT_CONFIG_DIR / "bin"
RMAPI_BIN_PATH = RMAPI_BIN_DIR / "rmapi"
RMAPI_RELEASE_URL = "https://github.com/ddvk/rmapi/releases/download/{tag}/{filename}"
RMAPI_DEFAULT_TAG = "v0.0.32"

PLATFORM_ASSETS = {
    ("Darwin", "arm64"): "rmapi-macos-arm64.zip",
    ("Darwin", "x86_64"): "rmapi-macos-intel.zip",
    ("Linux", "x86_64"): "rmapi-linux-amd64.tar.gz",
    ("Linux", "aarch64"): "rmapi-linux-arm64.tar.gz",
}


class UnsupportedPlatformError(Exception):
    """Current platform is not supported for rmapi auto-install."""


def get_asset_filename() -> str:
    """Get the correct rmapi release asset filename for this platform."""
    system = platform.system()
    machine = platform.machine()
    key = (system, machine)
    if key not in PLATFORM_ASSETS:
        raise UnsupportedPlatformError(
            f"No rmapi binary available for {system}/{machine}. "
            "Install manually from https://github.com/ddvk/rmapi/releases"
        )
    return PLATFORM_ASSETS[key]


def is_installed() -> bool:
    """Check if rmapi is already installed in our bin directory."""
    return RMAPI_BIN_PATH.exists() and os.access(RMAPI_BIN_PATH, os.X_OK)


def get_rmapi_path() -> str:
    """Get the path to rmapi — our local copy if installed, otherwise 'rmapi' (system PATH)."""
    if is_installed():
        return str(RMAPI_BIN_PATH)
    return "rmapi"


def install(tag: str = RMAPI_DEFAULT_TAG) -> Path:
    """Download and install rmapi. Returns path to the binary."""
    filename = get_asset_filename()
    url = RMAPI_RELEASE_URL.format(tag=tag, filename=filename)

    RMAPI_BIN_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        archive_path = tmp_path / filename

        # Download
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            archive_path.write_bytes(response.content)

        # Extract
        extracted_dir = tmp_path / "extracted"
        if filename.endswith(".zip"):
            with zipfile.ZipFile(archive_path) as zf:
                zf.extractall(extracted_dir)
        elif filename.endswith(".tar.gz"):
            with tarfile.open(archive_path) as tf:
                tf.extractall(extracted_dir)

        # Find the rmapi binary in extracted files
        rmapi_binary = None
        for f in extracted_dir.rglob("rmapi"):
            if f.is_file():
                rmapi_binary = f
                break

        if rmapi_binary is None:
            raise FileNotFoundError("rmapi binary not found in downloaded archive")

        # Copy to bin dir
        shutil.copy2(rmapi_binary, RMAPI_BIN_PATH)
        os.chmod(RMAPI_BIN_PATH, stat.S_IRWXU)  # 700

    return RMAPI_BIN_PATH
