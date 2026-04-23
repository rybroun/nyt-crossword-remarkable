"""Health check endpoints."""
from fastapi import APIRouter
from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader, RmapiNotFoundError

router = APIRouter(prefix="/api/health", tags=["health"])

@router.get("")
async def health():
    return {"status": "ok"}

@router.get("/nyt")
async def health_nyt():
    config = load_config()
    if not config.nyt.cookie:
        return {"status": "not_configured", "cookie_age_days": None}
    fetcher = NytFetcher(cookie=config.nyt.cookie)
    valid = await fetcher.check_cookie()
    age_days = None
    if config.nyt.cookie_set_at:
        from datetime import datetime
        age_days = (datetime.now() - config.nyt.cookie_set_at).days
    return {"status": "ok" if valid else "expired", "cookie_age_days": age_days}

@router.get("/remarkable")
async def health_remarkable():
    config = load_config()
    try:
        uploader = RemarkableUploader(folder=config.remarkable.folder)
        uploader.check_rmapi()
        connected = uploader.check_connection()
        return {"status": "ok" if connected else "disconnected", "folder": config.remarkable.folder}
    except RmapiNotFoundError:
        return {"status": "not_installed", "folder": config.remarkable.folder}
