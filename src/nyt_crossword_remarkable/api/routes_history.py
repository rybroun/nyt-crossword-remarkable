"""History endpoints."""
from fastapi import APIRouter, Query
from nyt_crossword_remarkable.config import DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.history import History

router = APIRouter(prefix="/api/history", tags=["history"])

@router.get("")
async def get_history(year: int = Query(...)):
    history = History(path=DEFAULT_HISTORY_PATH)
    records = history.by_year(year)
    return [
        {
            "puzzle_date": r.puzzle_date.isoformat(),
            "fetched_at": r.fetched_at.isoformat(),
            "status": r.status,
            "error": r.error,
            "size_bytes": r.size_bytes,
            "filename": r.filename,
        }
        for r in records
    ]
