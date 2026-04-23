"""Settings endpoints."""
from fastapi import APIRouter
from pydantic import BaseModel
from nyt_crossword_remarkable.config import load_config, save_config

router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    user_name: str
    remarkable_folder: str
    file_pattern: str

@router.get("")
async def get_settings():
    config = load_config()
    return {
        "user_name": config.user_name,
        "remarkable_folder": config.remarkable.folder,
        "file_pattern": config.remarkable.file_pattern,
    }

@router.put("")
async def update_settings(update: SettingsUpdate):
    config = load_config()
    config.user_name = update.user_name
    config.remarkable.folder = update.remarkable_folder
    config.remarkable.file_pattern = update.file_pattern
    save_config(config)
    return {"status": "ok"}
