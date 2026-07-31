import asyncio
import threading
import time
from unittest.mock import patch

import pytest

from nyt_crossword_remarkable.services.libgen import (
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
