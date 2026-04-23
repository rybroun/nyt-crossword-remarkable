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


@pytest.fixture(autouse=True)
def mock_get_rmapi_path():
    """Always return 'rmapi' as the path for tests."""
    with patch("nyt_crossword_remarkable.services.remarkable.get_rmapi_path", return_value="rmapi"):
        yield


class TestRemarkableUploader:
    def setup_method(self):
        self.uploader = RemarkableUploader(folder="/Crosswords")

    @patch("shutil.which", return_value=None)
    @patch("nyt_crossword_remarkable.services.remarkable.is_installed", return_value=False)
    def test_check_rmapi_not_installed(self, mock_is_installed, mock_which):
        with pytest.raises(RmapiNotFoundError, match="rmapi"):
            self.uploader.check_rmapi()

    @patch("shutil.which", return_value="/usr/local/bin/rmapi")
    def test_check_rmapi_installed(self, mock_which):
        self.uploader.check_rmapi()  # should not raise

    @patch("shutil.which", return_value=None)
    @patch("nyt_crossword_remarkable.services.remarkable.is_installed", return_value=True)
    def test_check_rmapi_local_install(self, mock_is_installed, mock_which):
        self.uploader.check_rmapi()  # should not raise because is_installed() is True

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
