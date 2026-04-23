"""FastAPI server — serves the API and (eventually) the React frontend."""

import logging

from apscheduler import AsyncScheduler, ConflictPolicy
from fastapi import FastAPI

from nyt_crossword_remarkable.config import load_config
from nyt_crossword_remarkable.services.scheduler import build_cron_trigger, scheduled_fetch

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="NYT Crossword → reMarkable", version="0.1.0")

    # APScheduler v4: AsyncScheduler is used as an async context manager
    # We hold a reference to the scheduler instance for lifecycle management
    scheduler: AsyncScheduler | None = None

    @app.on_event("startup")
    async def startup():
        nonlocal scheduler
        config = load_config()
        if config.schedule.enabled:
            trigger = build_cron_trigger(config.schedule)
            scheduler = AsyncScheduler()
            await scheduler.__aenter__()
            await scheduler.add_schedule(
                scheduled_fetch,
                trigger,
                id="daily_fetch",
                conflict_policy=ConflictPolicy.replace,
            )
            logger.info(
                f"Scheduler started: {config.schedule.days} at {config.schedule.time} "
                f"{config.schedule.timezone}"
            )
        else:
            logger.info("Scheduler disabled in config")

    @app.on_event("shutdown")
    async def shutdown():
        nonlocal scheduler
        if scheduler is not None:
            await scheduler.__aexit__(None, None, None)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app
