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
