"""Orchestrates the fetch-and-upload pipeline."""

import re
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


TOKENS = {
    "Mon DD, YYYY": lambda d: d.strftime("%b %d, %Y"),
    "YYYY-MM-DD": lambda d: d.isoformat(),
    "date": lambda d: d.isoformat(),
    "weekday": lambda d: d.strftime("%A"),
    "Mon": lambda d: d.strftime("%b"),
    "mon": lambda d: d.strftime("%b"),
    "DD": lambda d: d.strftime("%d"),
    "dd": lambda d: d.strftime("%d"),
    "YYYY": lambda d: str(d.year),
    "yyyy": lambda d: str(d.year),
    "mm": lambda d: d.strftime("%m"),
}


def _format_filename(pattern: str, puzzle_date: date) -> str:
    """Format the file name pattern with the puzzle date.

    Tokens can be used individually like {weekday} or grouped like
    {weekday, mon dd, yyyy}. Inside braces, each known token name is
    replaced with its value while other characters (commas, spaces) are
    kept as-is.
    """
    def replace_braced(match: re.Match) -> str:
        inner = match.group(1)
        # Try exact match first (handles "Mon DD, YYYY" etc.)
        if inner in TOKENS:
            return TOKENS[inner](puzzle_date)
        # Otherwise replace each token found inside the braces
        result = inner
        for token_name, formatter in sorted(TOKENS.items(), key=lambda t: -len(t[0])):
            result = result.replace(token_name, formatter(puzzle_date))
        return result

    return re.sub(r"\{([^}]+)\}", replace_braced, pattern)


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
            # Sanitize slashes — the pattern is a filename, not a path
            filename = filename.replace("/", "-").replace("\\", "-")
            upload_path = pdf_path.parent / filename
            if upload_path != pdf_path:
                shutil.copy2(pdf_path, upload_path)

            self._uploader.ensure_folder()
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
