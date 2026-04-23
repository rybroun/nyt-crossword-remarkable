import httpx
import pytest
import respx
from datetime import date
from pathlib import Path

from nyt_crossword_remarkable.services.nyt_fetcher import (
    NytFetcher,
    NytAuthError,
    NytFetchError,
    format_puzzle_date,
)


def test_format_puzzle_date():
    assert format_puzzle_date(date(2026, 4, 23)) == "Apr2326"
    assert format_puzzle_date(date(2026, 1, 5)) == "Jan0526"
    assert format_puzzle_date(date(2026, 12, 31)) == "Dec3126"


def test_format_puzzle_date_single_digit_day():
    assert format_puzzle_date(date(2026, 3, 1)) == "Mar0126"


class TestNytFetcher:
    def setup_method(self):
        self.fetcher = NytFetcher(cookie="test-nyt-s-cookie")

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_success(self, tmp_path: Path):
        pdf_bytes = b"%PDF-1.4 fake pdf content"
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(200, content=pdf_bytes))

        result = await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

        assert result.exists()
        assert result.read_bytes() == pdf_bytes
        assert result.name == "2026-04-23.pdf"

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_uses_cache(self, tmp_path: Path):
        cached = tmp_path / "2026-04-23.pdf"
        cached.write_bytes(b"%PDF cached")

        result = await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

        assert result == cached
        assert result.read_bytes() == b"%PDF cached"
        assert respx.calls.call_count == 0

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_auth_error(self, tmp_path: Path):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(403))

        with pytest.raises(NytAuthError):
            await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

    @respx.mock
    @pytest.mark.asyncio
    async def test_fetch_pdf_not_found(self, tmp_path: Path):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v2/puzzle/print/Apr2326.pdf"
        ).mock(return_value=httpx.Response(404))

        with pytest.raises(NytFetchError, match="404"):
            await self.fetcher.fetch_pdf(date(2026, 4, 23), cache_dir=tmp_path)

    @respx.mock
    @pytest.mark.asyncio
    async def test_check_cookie_valid(self):
        respx.get(
            "https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/2026-04-23.json"
        ).mock(return_value=httpx.Response(200, json={"status": "OK"}))

        result = await self.fetcher.check_cookie()
        assert result is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_check_cookie_expired(self):
        respx.get(
            url__regex=r".*/svc/crosswords/v6/puzzle/daily/.*\.json"
        ).mock(return_value=httpx.Response(403))

        result = await self.fetcher.check_cookie()
        assert result is False
