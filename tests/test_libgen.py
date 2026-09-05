import asyncio
import threading
import time
from unittest.mock import patch

import httpx
import pytest
import respx

from nyt_crossword_remarkable.services.libgen import (
    BROWSER_UA,
    BookResult,
    LibgenDownloadError,
    LibgenSearchError,
    LibgenService,
)


class _FakeItem:
    """Minimal stand-in for a libgen_api_enhanced result row."""

    def __init__(self, md5="abc123"):
        self.id = "1"
        self.title = "Siddhartha"
        self.author = "Hesse, Hermann"
        self.publisher = ""
        self.year = ""
        self.pages = ""
        self.language = ""
        self.size = "1048577"
        self.extension = "epub"
        self.md5 = md5
        self.mirrors = ["https://libgen.li/ads.php?md5=abc123"]


def _searcher_sleeping(seconds: float):
    """Build a fake LibgenSearch whose search_title blocks the calling thread."""

    class _FakeSearch:
        def __init__(self, mirror=None):
            self.mirror = mirror

        def search_title(self, query):
            time.sleep(seconds)
            return [_FakeItem()]

        # search() defaults to mode="all", which routes here.
        search_default = search_title
        search_author = search_title

    return _FakeSearch


class TestLibgenSearchConcurrency:
    """search() wraps a synchronous, requests-based library. It must never
    execute that call directly on the event loop — a slow mirror would freeze
    every other request, including /api/health and the crossword delivery."""

    @pytest.mark.asyncio
    async def test_search_does_not_block_the_event_loop(self):
        service = LibgenService(mirror="libgen.li")
        ticks = 0

        async def ticker():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.02)
                ticks += 1

        with patch(
            "libgen_api_enhanced.LibgenSearch", _searcher_sleeping(0.5)
        ):
            tick_task = asyncio.create_task(ticker())
            try:
                results = await service.search("siddhartha", "epub")
            finally:
                tick_task.cancel()

        assert results
        # A 0.5s blocking call leaves room for ~25 ticks if the loop stays
        # free. If search_title ran on the loop, ticks would be 0.
        assert ticks >= 5, f"event loop was blocked during search (ticks={ticks})"

    @pytest.mark.asyncio
    async def test_search_gives_up_on_a_hanging_mirror(self):
        service = LibgenService(mirror="libgen.li")
        # Released in the finally below so the worker thread doesn't outlive
        # the test — wait_for abandons the thread, it cannot cancel it.
        released = threading.Event()

        class _HangingSearch:
            def __init__(self, mirror=None):
                self.mirror = mirror

            def search_title(self, query):
                released.wait(timeout=10)
                return []

            # search() defaults to mode="all", which routes here.
            search_default = search_title
            search_author = search_title

        try:
            with patch("libgen_api_enhanced.LibgenSearch", _HangingSearch):
                with patch(
                    "nyt_crossword_remarkable.services.libgen.SEARCH_TIMEOUT", 0.3
                ):
                    start = time.monotonic()
                    with pytest.raises(LibgenSearchError) as excinfo:
                        await service.search("siddhartha", "epub")
                    elapsed = time.monotonic() - start
        finally:
            released.set()

        assert elapsed < 2, f"search hung for {elapsed:.1f}s instead of timing out"
        assert "timed out" in str(excinfo.value).lower()


class TestBrowserUserAgent:
    """libgen.li answers clients that identify as python-requests or
    python-httpx with a 641-byte empty shell under HTTP 200 — no results table
    and no download link. Every request we make must look like a browser or the
    feature silently returns nothing."""

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_download_url_sends_a_browser_user_agent(self):
        route = respx.get("https://libgen.li/ads.php").mock(
            return_value=httpx.Response(
                200, text='<a href="get.php?md5=abc&key=1"><h2>GET</h2></a>'
            )
        )
        service = LibgenService(mirror="libgen.li")
        book = BookResult(
            id="1",
            title="Siddhartha",
            author="Hesse",
            md5="abc",
            mirror_url="https://libgen.li/ads.php?md5=abc",
        )

        await service.resolve_download_url(book)

        sent = route.calls[0].request
        assert sent.headers["user-agent"] == BROWSER_UA

    @pytest.mark.asyncio
    @respx.mock
    async def test_download_sends_a_browser_user_agent(self, tmp_path):
        respx.get("https://libgen.li/ads.php").mock(
            return_value=httpx.Response(
                200, text='<a href="get.php?md5=abc&key=1"><h2>GET</h2></a>'
            )
        )
        route = respx.get("https://libgen.li/get.php").mock(
            return_value=httpx.Response(200, content=b"PK\x03\x04epub-bytes")
        )
        service = LibgenService(mirror="libgen.li")
        book = BookResult(
            id="1",
            title="Siddhartha",
            author="Hesse",
            format="epub",
            md5="abc",
            mirror_url="https://libgen.li/ads.php?md5=abc",
        )

        await service.download(book, cache_dir=tmp_path)

        sent = route.calls[0].request
        assert sent.headers["user-agent"] == BROWSER_UA

    @pytest.mark.asyncio
    @respx.mock
    async def test_check_mirror_sends_a_browser_user_agent(self):
        route = respx.get("https://libgen.li").mock(
            return_value=httpx.Response(200, text="ok")
        )
        service = LibgenService(mirror="libgen.li")

        await service.check_mirror()

        sent = route.calls[0].request
        assert sent.headers["user-agent"] == BROWSER_UA

    def test_requests_default_user_agent_is_overridden_for_the_search_library(self):
        """libgen_api_enhanced calls requests.get() with no headers and exposes
        no way to pass any, so the only lever is the library-wide default."""
        import requests.utils

        from nyt_crossword_remarkable.services.libgen import force_browser_ua_for_requests

        force_browser_ua_for_requests()

        assert requests.utils.default_headers()["User-Agent"] == BROWSER_UA


class TestSearchMode:
    """The search box has always promised 'title, author, or ISBN' but only
    ever called search_title. Mode selects which of the library's search
    methods runs."""

    def _recording_searcher(self, calls):
        class _FakeSearch:
            def __init__(self, mirror=None):
                self.mirror = mirror

            def search_title(self, query):
                calls.append(("title", query))
                return [_FakeItem()]

            def search_author(self, query):
                calls.append(("author", query))
                return [_FakeItem()]

            def search_default(self, query):
                calls.append(("default", query))
                return [_FakeItem()]

        return _FakeSearch

    @pytest.mark.asyncio
    async def test_author_mode_searches_authors(self):
        calls = []
        service = LibgenService(mirror="libgen.li")
        with patch("libgen_api_enhanced.LibgenSearch", self._recording_searcher(calls)):
            await service.search("emily wilson", "any", mode="author")

        assert calls == [("author", "emily wilson")]

    @pytest.mark.asyncio
    async def test_title_mode_searches_titles(self):
        calls = []
        service = LibgenService(mirror="libgen.li")
        with patch("libgen_api_enhanced.LibgenSearch", self._recording_searcher(calls)):
            await service.search("odyssey", "any", mode="title")

        assert calls == [("title", "odyssey")]

    @pytest.mark.asyncio
    async def test_default_mode_searches_every_column(self):
        """'all' is the default, so the placeholder's promise holds without
        the user touching anything."""
        calls = []
        service = LibgenService(mirror="libgen.li")
        with patch("libgen_api_enhanced.LibgenSearch", self._recording_searcher(calls)):
            await service.search("emily wilson", "any")

        assert calls == [("default", "emily wilson")]

    @pytest.mark.asyncio
    async def test_an_unknown_mode_falls_back_to_searching_everything(self):
        calls = []
        service = LibgenService(mirror="libgen.li")
        with patch("libgen_api_enhanced.LibgenSearch", self._recording_searcher(calls)):
            await service.search("homer", "any", mode="nonsense")

        assert calls == [("default", "homer")]
