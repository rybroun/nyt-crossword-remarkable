import pytest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from nyt_crossword_remarkable.services.orchestrator import Orchestrator
from nyt_crossword_remarkable.services.nyt_fetcher import NytAuthError
from nyt_crossword_remarkable.services.remarkable import RemarkableUploadError


@pytest.fixture
def orchestrator(tmp_path: Path):
    return Orchestrator(
        nyt_cookie="test-cookie",
        remarkable_folder="/Crosswords",
        file_pattern="NYT Crossword - {Mon DD, YYYY}",
        cache_dir=tmp_path / "cache",
        history_path=tmp_path / "history.json",
    )


@pytest.mark.asyncio
async def test_fetch_and_upload_success(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload"
    ) as mock_upload:
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "success"
    assert result.error is None
    mock_upload.assert_called_once()
    uploaded_path = mock_upload.call_args[0][0]
    assert "NYT Crossword" in uploaded_path.name


@pytest.mark.asyncio
async def test_fetch_and_upload_nyt_auth_error(orchestrator):
    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock,
        side_effect=NytAuthError("cookie expired")
    ):
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "error"
    assert "cookie" in result.error.lower()


@pytest.mark.asyncio
async def test_fetch_and_upload_remarkable_error(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload",
        side_effect=RemarkableUploadError("network error")
    ):
        result = await orchestrator.fetch_and_upload(date(2026, 4, 23))

    assert result.status == "error"
    assert "network error" in result.error.lower()


@pytest.mark.asyncio
async def test_fetch_and_upload_records_history(orchestrator, tmp_path: Path):
    pdf_path = tmp_path / "cache" / "2026-04-23.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(b"%PDF fake")

    with patch.object(
        orchestrator._fetcher, "fetch_pdf", new_callable=AsyncMock, return_value=pdf_path
    ), patch.object(
        orchestrator._uploader, "upload"
    ):
        await orchestrator.fetch_and_upload(date(2026, 4, 23))

    records = orchestrator._history.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)
