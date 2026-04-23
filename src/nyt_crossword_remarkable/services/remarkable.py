"""Wrapper around rmapi CLI for reMarkable cloud uploads."""

import shutil
import subprocess
from pathlib import Path

from nyt_crossword_remarkable.services.rmapi_installer import get_rmapi_path, is_installed


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
        if shutil.which("rmapi") is None and not is_installed():
            raise RmapiNotFoundError(
                "rmapi not found. Install it: go install github.com/ddvk/rmapi@latest "
                "or download from https://github.com/ddvk/rmapi/releases"
            )

    def _run_rmapi(self, subcommand: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
        cmd = [get_rmapi_path()] + subcommand
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    def upload(self, pdf_path: Path) -> None:
        """Upload a PDF to the configured reMarkable folder."""
        result = self._run_rmapi(["put", str(pdf_path), self.folder])

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
            result = self._run_rmapi(["ls", "/"], timeout=30)
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    def list_folders(self) -> list[str]:
        """List top-level folders on the reMarkable."""
        result = self._run_rmapi(["ls", "/"], timeout=30)
        if result.returncode != 0:
            return []

        folders = []
        for line in result.stdout.strip().splitlines():
            if line.startswith("[d]"):
                name = line.split("\t", 1)[1] if "\t" in line else ""
                if name:
                    folders.append(name)
        return folders

    def ensure_folder(self) -> None:
        """Create the destination folder if it doesn't already exist."""
        folders = self.list_folders()
        # Strip leading slash for comparison
        target = self.folder.lstrip("/")
        if target not in folders:
            self.create_folder(self.folder)

    def create_folder(self, folder_path: str) -> None:
        """Create a folder on the reMarkable."""
        self._run_rmapi(["mkdir", folder_path], timeout=30)
