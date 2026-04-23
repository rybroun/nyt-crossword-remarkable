"""Schedule endpoints."""
from fastapi import APIRouter
from pydantic import BaseModel
from nyt_crossword_remarkable.config import load_config, save_config

router = APIRouter(prefix="/api/schedule", tags=["schedule"])

class ScheduleUpdate(BaseModel):
    days: list[str]
    time: str
    timezone: str
    enabled: bool

@router.get("")
async def get_schedule():
    config = load_config()
    return {
        "days": config.schedule.days,
        "time": config.schedule.time,
        "timezone": config.schedule.timezone,
        "enabled": config.schedule.enabled,
    }

@router.put("")
async def update_schedule(update: ScheduleUpdate):
    config = load_config()
    config.schedule.days = update.days
    config.schedule.time = update.time
    config.schedule.timezone = update.timezone
    config.schedule.enabled = update.enabled
    save_config(config)
    return {"status": "ok"}

@router.post("/pause")
async def pause_schedule():
    config = load_config()
    config.schedule.enabled = False
    save_config(config)
    return {"status": "paused"}
