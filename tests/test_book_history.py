import json
from datetime import datetime
from pathlib import Path

from nyt_crossword_remarkable.services.book_history import BookHistory, BookSendRecord


def _record(**overrides) -> BookSendRecord:
    fields = dict(
        book_id="5682489",
        title="Cats Cradle",
        author="Vonnegut, Kurt",
        format="epub",
        sent_at=datetime(2026, 7, 31, 10, 1, 31),
        status="success",
    )
    fields.update(overrides)
    return BookSendRecord(**fields)


class TestBookSendRecordSourceFields:
    """Resend needs the mirror coordinates. Without them the button cannot do
    anything but lie, because a title and author alone are not downloadable."""

    def test_record_round_trips_the_download_source(self, tmp_path: Path):
        path = tmp_path / "book_history.json"
        history = BookHistory(path=path)
        history.add(
            _record(
                md5="4da164f039001f180d75cbb903e1d44a",
                mirror_url="https://libgen.li/ads.php?md5=4da164f039001f180d75cbb903e1d44a",
            )
        )

        reloaded = BookHistory(path=path).recent()[0]
        assert reloaded.md5 == "4da164f039001f180d75cbb903e1d44a"
        assert reloaded.mirror_url.endswith("md5=4da164f039001f180d75cbb903e1d44a")

    def test_reads_records_written_before_these_fields_existed(self, tmp_path: Path):
        """The live book_history.json predates md5/mirror_url. Loading it must
        not blow up — it just cannot offer a resend for those rows."""
        path = tmp_path / "book_history.json"
        path.write_text(json.dumps([{
            "book_id": "5050912",
            "title": "Barbarian Days A Surfing Life",
            "author": "Finnegan, William",
            "format": "epub",
            "size": "7.6 MB",
            "folder": "/Books",
            "sent_at": "2026-04-25T16:17:25.723220",
            "status": "success",
            "error": None,
        }]))

        record = BookHistory(path=path).recent()[0]
        assert record.title == "Barbarian Days A Surfing Life"
        assert record.md5 == ""
        assert record.mirror_url == ""
