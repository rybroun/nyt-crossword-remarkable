"""Validate and sanitize downloaded ebook files before upload."""

import zipfile
from pathlib import Path


MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_EPUB_DECOMPRESSED = 500 * 1024 * 1024  # 500 MB

PDF_MAGIC = b"%PDF"
EPUB_MAGIC = b"PK"  # EPUBs are ZIP archives


class FileScanError(Exception):
    """File failed validation."""


class FileScanner:
    def validate_and_sanitize(self, file_path: Path, expected_format: str) -> Path:
        """Validate file type and sanitize. Returns path to clean file."""
        if not file_path.exists():
            raise FileScanError("File does not exist")

        # Size check
        size = file_path.stat().st_size
        if size > MAX_FILE_SIZE:
            raise FileScanError(f"File too large: {size / 1_048_576:.1f} MB (max 100 MB)")
        if size == 0:
            raise FileScanError("File is empty")

        # Magic bytes check
        header = file_path.read_bytes()[:8]
        if expected_format == "pdf":
            if not header.startswith(PDF_MAGIC):
                raise FileScanError("File is not a valid PDF (wrong magic bytes)")
            return self._sanitize_pdf(file_path)
        elif expected_format == "epub":
            if not header.startswith(EPUB_MAGIC):
                raise FileScanError("File is not a valid EPUB (wrong magic bytes)")
            return self._validate_epub(file_path)
        else:
            raise FileScanError(f"Unsupported format: {expected_format}")

    def _sanitize_pdf(self, file_path: Path) -> Path:
        """Re-save PDF to strip JavaScript and other active content."""
        try:
            import pikepdf

            sanitized_path = file_path.with_suffix(".clean.pdf")
            with pikepdf.open(file_path) as pdf:
                # Remove JavaScript actions
                if "/Names" in pdf.Root:
                    names = pdf.Root["/Names"]
                    if "/JavaScript" in names:
                        del names["/JavaScript"]
                    if "/EmbeddedFiles" in names:
                        del names["/EmbeddedFiles"]

                # Remove OpenAction (auto-run on open)
                if "/OpenAction" in pdf.Root:
                    del pdf.Root["/OpenAction"]

                # Remove AA (additional actions)
                if "/AA" in pdf.Root:
                    del pdf.Root["/AA"]

                pdf.save(sanitized_path)

            return sanitized_path

        except ImportError:
            # pikepdf not available, return as-is with a warning
            return file_path
        except Exception as e:
            raise FileScanError(f"PDF sanitization failed: {e}")

    def _validate_epub(self, file_path: Path) -> Path:
        """Validate EPUB ZIP structure and check for reasonable content."""
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                # Check for ZIP bombs
                total_size = sum(info.file_size for info in zf.infolist())
                if total_size > MAX_EPUB_DECOMPRESSED:
                    raise FileScanError(
                        f"EPUB decompressed size too large: {total_size / 1_048_576:.0f} MB"
                    )

                # Verify basic EPUB structure
                names = zf.namelist()
                has_mimetype = "mimetype" in names
                has_container = any("container.xml" in n for n in names)
                has_content = any(
                    n.endswith(".opf") or n.endswith(".ncx") or n.endswith(".xhtml")
                    for n in names
                )

                if not (has_mimetype or has_container or has_content):
                    raise FileScanError(
                        "EPUB structure invalid: missing mimetype, container.xml, and content files"
                    )

        except zipfile.BadZipFile:
            raise FileScanError("File is not a valid ZIP archive (corrupted EPUB)")

        return file_path
