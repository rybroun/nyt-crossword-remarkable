from datetime import date, datetime
from pathlib import Path

from nyt_crossword_remarkable.services.history import FetchRecord, History


def test_empty_history(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    assert history.recent(10) == []


def test_add_and_retrieve(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
    ))

    records = history.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)
    assert records[0].status == "success"


def test_add_failure(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="error",
        error="NYT cookie expired",
    ))

    records = history.recent(10)
    assert records[0].error == "NYT cookie expired"


def test_recent_limit(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    for i in range(20):
        history.add(FetchRecord(
            puzzle_date=date(2026, 1, i + 1),
            fetched_at=datetime(2026, 1, i + 1, 22, 0, 0),
            status="success",
        ))

    records = history.recent(5)
    assert len(records) == 5
    assert records[0].puzzle_date == date(2026, 1, 20)


def test_persistence(tmp_path: Path):
    path = tmp_path / "history.json"
    history1 = History(path=path)
    history1.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
    ))

    history2 = History(path=path)
    records = history2.recent(10)
    assert len(records) == 1
    assert records[0].puzzle_date == date(2026, 4, 23)


def test_fetch_record_with_size(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="success",
        size_bytes=223744,
        filename="NYT Crossword - Apr 23, 2026.pdf",
    ))
    records = history.recent(10)
    assert records[0].size_bytes == 223744
    assert records[0].filename == "NYT Crossword - Apr 23, 2026.pdf"


def test_by_year(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    history.add(FetchRecord(
        puzzle_date=date(2025, 12, 31),
        fetched_at=datetime(2025, 12, 31, 22, 0, 0),
        status="success",
    ))
    history.add(FetchRecord(
        puzzle_date=date(2026, 1, 1),
        fetched_at=datetime(2026, 1, 1, 22, 0, 0),
        status="success",
    ))
    history.add(FetchRecord(
        puzzle_date=date(2026, 4, 23),
        fetched_at=datetime(2026, 4, 23, 22, 0, 0),
        status="error",
        error="cookie expired",
    ))
    records_2026 = history.by_year(2026)
    assert len(records_2026) == 2
    assert all(r.puzzle_date.year == 2026 for r in records_2026)
    records_2025 = history.by_year(2025)
    assert len(records_2025) == 1


def test_by_year_empty(tmp_path: Path):
    history = History(path=tmp_path / "history.json")
    assert history.by_year(2026) == []
