"""Search and download ebooks from Library Genesis mirrors."""

import time
from pathlib import Path
from typing import Optional

import httpx
from pydantic import BaseModel

from nyt_crossword_remarkable.config import DEFAULT_BOOK_CACHE_DIR


MIRRORS = ["libgen.rs", "libgen.li", "libgen.is"]


class BookResult(BaseModel):
    id: str
    title: str
    author: str
    publisher: str = ""
    year: str = ""
    pages: str = ""
    language: str = ""
    size: str = ""
    format: str = ""  # epub, pdf
    isbn: str = ""
    md5: str = ""
    mirror_url: str = ""
    sources: int = 1


class MirrorStatus(BaseModel):
    status: str  # "ok", "slow", "unreachable"
    mirror: str
    ping_ms: Optional[int] = None


class LibgenSearchError(Exception):
    """Search failed."""


class LibgenDownloadError(Exception):
    """Download failed."""


class LibgenService:
    def __init__(self, mirror: str = "libgen.rs"):
        self.mirror = mirror

    async def search(self, query: str, format_filter: str = "any") -> list[BookResult]:
        """Search libgen for books matching the query."""
        try:
            from libgen_api_enhanced import LibgenSearch

            # LibgenSearch expects just the TLD suffix (e.g. "rs", "li", "is")
            tld = self.mirror.replace("libgen.", "").rstrip(".")
            searcher = LibgenSearch(mirror=tld)
            # Search by title first, then by author
            title_results = searcher.search_title(query)

            results = []
            seen_md5 = set()
            for item in (title_results or []):
                fmt = getattr(item, "extension", "").lower()
                if format_filter != "any" and fmt != format_filter:
                    continue
                if fmt not in ("epub", "pdf"):
                    continue

                md5 = getattr(item, "md5", "")
                if md5 in seen_md5:
                    continue
                seen_md5.add(md5)

                mirrors = getattr(item, "mirrors", [])
                mirror_url = mirrors[0] if mirrors else ""

                results.append(BookResult(
                    id=getattr(item, "id", ""),
                    title=getattr(item, "title", "Unknown"),
                    author=getattr(item, "author", "Unknown"),
                    publisher=getattr(item, "publisher", ""),
                    year=getattr(item, "year", ""),
                    pages=getattr(item, "pages", ""),
                    language=getattr(item, "language", ""),
                    size=getattr(item, "size", ""),
                    format=fmt,
                    isbn="",
                    md5=md5,
                    mirror_url=mirror_url,
                    sources=len(mirrors),
                ))

            # Convert raw filesize to human-readable
            for r in results:
                if r.size and r.size.isdigit():
                    size_bytes = int(r.size)
                    if size_bytes > 1_048_576:
                        r.size = f"{size_bytes / 1_048_576:.1f} MB"
                    elif size_bytes > 1024:
                        r.size = f"{size_bytes / 1024:.0f} KB"

            return results[:20]  # Cap at 20 results

        except ImportError:
            raise LibgenSearchError("libgen-api-enhanced is not installed")
        except Exception as e:
            raise LibgenSearchError(f"Search failed: {e}")

    async def resolve_download_url(self, book: BookResult) -> str:
        """Resolve the actual download URL from a mirror page."""
        if not book.mirror_url:
            raise LibgenDownloadError("No mirror URL available")

        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(book.mirror_url)
            if resp.status_code != 200:
                raise LibgenDownloadError(f"Mirror page returned {resp.status_code}")

            text = resp.text
            import re
            from urllib.parse import urlparse, urljoin

            base_url = str(resp.url)  # Use final URL after redirects

            # Try common download link patterns from libgen mirror pages
            for pattern in [
                r'href="(get\.php[^"]*)"',
                r'href="(/get\.php[^"]*)"',
                r'href="(https?://[^"]+/get\.php[^"]*)"',
                r'<a[^>]+href="([^"]*)"[^>]*>\s*<h2>GET</h2>',
                r'href="(https?://download[^"]+)"',
                r'href="(https?://[^"]+\.epub)"',
                r'href="(https?://[^"]+\.pdf)"',
            ]:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    url = match.group(1)
                    # Resolve relative URLs against the page base
                    url = urljoin(base_url, url)
                    return url

            raise LibgenDownloadError("Could not find download link on mirror page")

    async def download(self, book: BookResult, cache_dir: Path = DEFAULT_BOOK_CACHE_DIR) -> Path:
        """Download a book file to the cache directory."""
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Use MD5 as cache key to avoid re-downloading
        filename = f"{book.md5}.{book.format}"
        cached_path = cache_dir / filename
        if cached_path.exists():
            return cached_path

        download_url = await self.resolve_download_url(book)

        async with httpx.AsyncClient(follow_redirects=True, timeout=120) as client:
            resp = await client.get(download_url)
            if resp.status_code != 200:
                raise LibgenDownloadError(f"Download failed: HTTP {resp.status_code}")

            cached_path.write_bytes(resp.content)

        return cached_path

    async def check_mirror(self) -> MirrorStatus:
        """Check if the configured mirror is reachable."""
        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"https://{self.mirror}")
            elapsed_ms = int((time.monotonic() - start) * 1000)

            if resp.status_code == 200:
                if elapsed_ms > 3000:
                    return MirrorStatus(status="slow", mirror=self.mirror, ping_ms=elapsed_ms)
                return MirrorStatus(status="ok", mirror=self.mirror, ping_ms=elapsed_ms)
            return MirrorStatus(status="unreachable", mirror=self.mirror)
        except Exception:
            return MirrorStatus(status="unreachable", mirror=self.mirror)
