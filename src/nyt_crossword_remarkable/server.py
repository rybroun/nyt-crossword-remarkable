"""FastAPI server — serves the API and (eventually) the React frontend."""
import logging
from apscheduler import AsyncScheduler, ConflictPolicy
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from nyt_crossword_remarkable.api.routes_health import router as health_router
from nyt_crossword_remarkable.api.routes_history import router as history_router
from nyt_crossword_remarkable.api.routes_fetch import router as fetch_router
from nyt_crossword_remarkable.api.routes_schedule import router as schedule_router
from nyt_crossword_remarkable.api.routes_settings import router as settings_router
from nyt_crossword_remarkable.api.routes_auth import router as auth_router
from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="NYT Crossword → reMarkable", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(health_router)
    app.include_router(history_router)
    app.include_router(fetch_router)
    app.include_router(schedule_router)
    app.include_router(settings_router)
    app.include_router(auth_router)

    scheduler: AsyncScheduler | None = None

    @app.on_event("startup")
    async def startup():
        nonlocal scheduler
        config = load_config()
        if config.schedule.enabled:
            trigger = build_cron_trigger(config.schedule)
            scheduler = AsyncScheduler()
            await scheduler.__aenter__()
            await scheduler.add_schedule(scheduled_fetch, trigger, id="daily_fetch", conflict_policy=ConflictPolicy.replace)
            logger.info(f"Scheduler started: {config.schedule.days} at {config.schedule.time} {config.schedule.timezone}")
        else:
            logger.info("Scheduler disabled in config")

    @app.on_event("shutdown")
    async def shutdown():
        nonlocal scheduler
        if scheduler is not None:
            await scheduler.__aexit__(None, None, None)

    return app
