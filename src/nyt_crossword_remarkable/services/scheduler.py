"""Scheduler for automatic daily crossword fetching."""

import logging
from datetime import date

from apscheduler.triggers.cron import CronTrigger

from nyt_crossword_remarkable.config import Config, ScheduleConfig, load_config, DEFAULT_CACHE_DIR, DEFAULT_HISTORY_PATH
from nyt_crossword_remarkable.services.orchestrator import Orchestrator

logger = logging.getLogger(__name__)


def build_cron_trigger(schedule: ScheduleConfig) -> CronTrigger:
    """Build an APScheduler CronTrigger from the schedule config."""
    hour, minute = schedule.time.split(":")
    return CronTrigger(
        day_of_week=",".join(schedule.days),
        hour=int(hour),
        minute=int(minute),
        timezone=schedule.timezone,
    )


async def scheduled_fetch() -> None:
    """Job function called by the scheduler. Loads config fresh each run."""
    config = load_config()

    if not config.nyt.cookie:
        logger.error("Scheduled fetch skipped: no NYT cookie configured")
        return

    orchestrator = Orchestrator(
        nyt_cookie=config.nyt.cookie,
        remarkable_folder=config.remarkable.folder,
        file_pattern=config.remarkable.file_pattern,
        cache_dir=DEFAULT_CACHE_DIR,
        history_path=DEFAULT_HISTORY_PATH,
    )

    puzzle_date = date.today()
    logger.info(f"Scheduled fetch starting for {puzzle_date.isoformat()}")

    record = await orchestrator.fetch_and_upload(puzzle_date)

    if record.status == "success":
        logger.info(f"Scheduled fetch succeeded for {puzzle_date.isoformat()}")
    else:
        logger.error(f"Scheduled fetch failed for {puzzle_date.isoformat()}: {record.error}")
