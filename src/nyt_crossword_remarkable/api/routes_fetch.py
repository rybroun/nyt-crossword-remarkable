"""Fetch endpoints — trigger and monitor crossword fetches."""
import asyncio
from datetime import date
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from nyt_crossword_remarkable.config import load_config, DEFAULT_CACHE_DIR, DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.fetch_state import fetch_state, FetchPhase
from nyt_crossword_remarkable.services.orchestrator import Orchestrator

router = APIRouter(prefix="/api/fetch", tags=["fetch"])

class FetchRequest(BaseModel):
    date: str

def run_fetch_in_background(puzzle_date: date) -> None:
    config = load_config()
    fetch_state.reset()
    fetch_state.puzzle_date = puzzle_date.isoformat()

    async def _run():
        fetch_state.set_phase(FetchPhase.DOWNLOAD, 0)
        fetch_state.add_log(f"Fetching puzzle for {puzzle_date.isoformat()}")
        orchestrator = Orchestrator(
            nyt_cookie=config.nyt.cookie,
            remarkable_folder=config.remarkable.folder,
            file_pattern=config.remarkable.file_pattern,
            cache_dir=DEFAULT_CACHE_DIR,
            history_path=DEFAULT_HISTORY_PATH,
        )
        fetch_state.set_phase(FetchPhase.DOWNLOAD, 30)
        record = await orchestrator.fetch_and_upload(puzzle_date)
        if record.status == "success":
            fetch_state.set_phase(FetchPhase.DONE, 100)
            fetch_state.add_log("Delivered successfully", kind="ok")
        else:
            fetch_state.set_phase(FetchPhase.DONE, 100)
            fetch_state.add_log(f"Failed: {record.error}", kind="err")

    asyncio.run(_run())

@router.post("", status_code=202)
async def trigger_fetch(req: FetchRequest, background_tasks: BackgroundTasks):
    if fetch_state.phase not in (FetchPhase.IDLE, FetchPhase.DONE):
        return {"status": "already_running", "phase": fetch_state.phase.value}
    puzzle_date = date.fromisoformat(req.date)
    background_tasks.add_task(run_fetch_in_background, puzzle_date)
    return {"status": "started", "date": req.date}

@router.get("/status")
async def fetch_status():
    return fetch_state.to_dict()
