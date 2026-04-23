"""FastAPI server — serves the API and the React frontend."""
import logging
from pathlib import Path
from apscheduler import AsyncScheduler, ConflictPolicy
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

    # Serve React frontend static files
    frontend_dir = Path(__file__).parent / "frontend" / "dist"
    if frontend_dir.exists():
        # Serve static assets (JS, CSS, etc.)
        assets_dir = frontend_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{path:path}")
        async def serve_frontend(path: str):
            """Serve the React SPA — all non-API routes return index.html."""
            file_path = frontend_dir / path
            if file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(frontend_dir / "index.html")

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
