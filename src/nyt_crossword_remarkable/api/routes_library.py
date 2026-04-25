"""Library (Libgen) endpoints — search, send, history, mirror health."""

import asyncio
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.book_history import BookHistory
from nyt_crossword_remarkable.services.book_orchestrator import BookOrchestrator
from nyt_crossword_remarkable.services.fetch_state import FetchPhase, fetch_state
from nyt_crossword_remarkable.services.libgen import BookResult, LibgenService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/library", tags=["library"])


class SearchRequest(BaseModel):
    query: str
    format: str = "any"


class SendRequest(BaseModel):
    book: BookResult


@router.post("/search")
async def search_books(req: SearchRequest):
    config = load_config()
    service = LibgenService(mirror=config.library.mirror)
    try:
        results = await service.search(req.query, req.format)
        return {"status": "ok", "results": [r.model_dump() for r in results]}
    except Exception as e:
        return {"status": "error", "error": str(e), "results": []}


@router.post("/send")
async def send_book(req: SendRequest):
    if fetch_state.phase != FetchPhase.IDLE:
        return {
            "status": "already_running",
            "phase": fetch_state.phase.value,
        }

    config = load_config()
    orchestrator = BookOrchestrator(
        mirror=config.library.mirror,
        books_folder=config.library.books_folder,
    )

    async def _run():
        try:
            record = await orchestrator.send_book(req.book)
            if record.status == "error":
                logger.error("Book send failed: %s", record.error)
        except Exception:
            logger.exception("Book send task crashed")
        finally:
            await asyncio.sleep(3)
            fetch_state.reset()

    asyncio.create_task(_run())
    return {"status": "started", "title": req.book.title}


@router.get("/recent")
async def recent_books():
    history = BookHistory()
    records = history.recent(limit=10)
    return [r.model_dump() for r in records]


@router.post("/reset-mirror")
async def reset_mirror():
    config = load_config()
    service = LibgenService(mirror=config.library.mirror)
    status = await service.check_mirror()
    return {"status": status.status, "mirror": status.mirror, "ping_ms": status.ping_ms}
