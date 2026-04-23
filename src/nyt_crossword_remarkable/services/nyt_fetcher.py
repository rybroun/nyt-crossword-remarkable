"""Fetch NYT crossword PDFs using the undocumented print endpoint."""

from datetime import date
from pathlib import Path

import httpx

from nyt_crossword_remarkable.config import DEFAULT_CACHE_DIR

NYT_PRINT_URL = "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/{date_code}.pdf"
NYT_PUZZLE_URL = "https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/{iso_date}.json"


class NytAuthError(Exception):
    """Raised when the NYT cookie is expired or invalid."""


class NytFetchError(Exception):
    """Raised when fetching the puzzle fails for non-auth reasons."""


def format_puzzle_date(d: date) -> str:
    """Format a date for the NYT print URL: MMMddyy (e.g., Apr2326)."""
    return d.strftime("%b%d%y")


class NytFetcher:
    def __init__(self, cookie: str):
        self.cookie = cookie

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(cookies={"NYT-S": self.cookie})

    async def fetch_pdf(self, puzzle_date: date, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
        """Download the crossword PDF for the given date. Returns path to the cached file."""
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached_path = cache_dir / f"{puzzle_date.isoformat()}.pdf"

        if cached_path.exists():
            return cached_path

        date_code = format_puzzle_date(puzzle_date)
        url = NYT_PRINT_URL.format(date_code=date_code)

        async with self._client() as client:
            response = await client.get(url)

        if response.status_code == 403:
            raise NytAuthError("NYT cookie is expired or invalid. Re-authenticate to continue.")
        if response.status_code != 200:
            raise NytFetchError(f"Failed to fetch puzzle: HTTP {response.status_code}")

        cached_path.write_bytes(response.content)
        return cached_path

    async def check_cookie(self) -> bool:
        """Check if the stored NYT cookie is still valid."""
        iso_date = date.today().isoformat()
        url = NYT_PUZZLE_URL.format(iso_date=iso_date)

        async with self._client() as client:
            response = await client.get(url)

        return response.status_code == 200
