"""Orchestrates the book search-download-sanitize-upload pipeline."""

import shutil
from datetime import datetime
from pathlib import Path

from nyt_crossword_remarkable.config import DEFAULT_BOOK_CACHE_DIR, DEFAULT_BOOK_HISTORY_PATH
from nyt_crossword_remarkable.services.book_history import BookSendRecord, BookHistory
from nyt_crossword_remarkable.services.file_scanner import FileScanner, FileScanError
from nyt_crossword_remarkable.services.fetch_state import FetchPhase, fetch_state
from nyt_crossword_remarkable.services.libgen import (
    BookResult,
    LibgenService,
    LibgenDownloadError,
)
from nyt_crossword_remarkable.services.remarkable import (
    RemarkableUploader,
    RemarkableAuthError,
    RemarkableUploadError,
)


class BookOrchestrator:
    def __init__(
        self,
        mirror: str = "libgen.rs",
        books_folder: str = "/Books",
        cache_dir: Path = DEFAULT_BOOK_CACHE_DIR,
        history_path: Path = DEFAULT_BOOK_HISTORY_PATH,
    ):
        self._libgen = LibgenService(mirror=mirror)
        self._uploader = RemarkableUploader(folder=books_folder)
        self._scanner = FileScanner()
        self._history = BookHistory(path=history_path)
        self._books_folder = books_folder
        self._cache_dir = cache_dir

    async def send_book(self, book: BookResult) -> BookSendRecord:
        """Download, validate, sanitize, and upload a book to the reMarkable."""
        record = BookSendRecord(
            book_id=book.id,
            title=book.title,
            author=book.author,
            format=book.format,
            size=book.size,
            folder=self._books_folder,
            sent_at=datetime.now(),
            status="success",
        )

        try:
            # Phase 1: Download
            fetch_state.set_phase(FetchPhase.DOWNLOAD, 0)
            fetch_state.add_log(f'Fetching "{book.title}" from mirror…')

            file_path = await self._libgen.download(book, cache_dir=self._cache_dir)

            fetch_state.set_phase(FetchPhase.DOWNLOAD, 100)
            size_kb = file_path.stat().st_size / 1024
            size_str = f"{size_kb:.0f} KB" if size_kb < 1024 else f"{size_kb / 1024:.1f} MB"
            fetch_state.add_log(f"Downloaded · {size_str}", "ok")
            record.size = size_str

            # Phase 2: Validate & sanitize
            fetch_state.set_phase(FetchPhase.PREPARE, 0)
            fetch_state.add_log(f"Validating {book.format.upper()} structure…")

            clean_path = self._scanner.validate_and_sanitize(file_path, book.format)

            fetch_state.set_phase(FetchPhase.PREPARE, 100)
            fetch_state.add_log("File validated ✓", "ok")

            # Rename to a human-readable filename for upload
            upload_name = f"{book.title}.{book.format}"
            upload_name = upload_name.replace("/", "-").replace("\\", "-")
            upload_path = clean_path.parent / upload_name
            if upload_path != clean_path:
                shutil.copy2(clean_path, upload_path)

            # Phase 3: Upload
            fetch_state.set_phase(FetchPhase.UPLOAD, 0)
            fetch_state.add_log(f"rmapi put {self._books_folder}/{upload_name}")

            self._uploader.ensure_folder()
            self._uploader.upload(upload_path)

            # Verify the file landed on the device
            fetch_state.add_log("Verifying upload…")
            if self._uploader.verify_file(upload_name):
                fetch_state.set_phase(FetchPhase.UPLOAD, 100)
                fetch_state.add_log("Delivered ✓ · verified on device", "ok")
            else:
                raise RemarkableUploadError(
                    f"Upload appeared to succeed but '{upload_name}' not found on device"
                )

        except LibgenDownloadError as e:
            record.status = "error"
            record.error = str(e)
            fetch_state.add_log(str(e), "err")
        except FileScanError as e:
            record.status = "error"
            record.error = f"File validation failed: {e}"
            fetch_state.add_log(str(e), "err")
        except (RemarkableAuthError, RemarkableUploadError) as e:
            record.status = "error"
            record.error = str(e)
            fetch_state.add_log(str(e), "err")
        except Exception as e:
            record.status = "error"
            record.error = f"Unexpected error: {e}"
            fetch_state.add_log(f"Error: {e}", "err")

        self._history.add(record)

        if record.status == "success":
            fetch_state.complete()
        else:
            fetch_state.set_phase(FetchPhase.DONE, 0)

        return record
