"""Authentication endpoints."""
import subprocess
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from nyt_crossword_remarkable.config import load_config, save_config
from nyt_crossword_remarkable.services.nyt_fetcher import NytFetcher, NytLoginError
from nyt_crossword_remarkable.services.remarkable import RemarkableUploader
from nyt_crossword_remarkable.services.rmapi_installer import get_rmapi_path

router = APIRouter(prefix="/api/auth", tags=["auth"])

class NytLoginRequest(BaseModel):
    email: str
    password: str

class NytCookieRequest(BaseModel):
    cookie: str

class RemarkablePairRequest(BaseModel):
    code: str

@router.post("/nyt/login")
async def nyt_login(req: NytLoginRequest):
    try:
        cookie = await NytFetcher.login(req.email, req.password)
    except NytLoginError as e:
        return {"status": "error", "error": str(e)}
    config = load_config()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    return {"status": "ok"}

@router.post("/nyt/cookie")
async def nyt_cookie_paste(req: NytCookieRequest):
    cookie = req.cookie.removeprefix("NYT-S=").strip()
    config = load_config()
    config.nyt.cookie = cookie
    config.nyt.cookie_set_at = datetime.now()
    save_config(config)
    return {"status": "ok"}

@router.post("/remarkable/pair")
async def remarkable_pair(req: RemarkablePairRequest):
    rmapi_path = get_rmapi_path()
    result = subprocess.run(
        [rmapi_path],
        input=req.code + "\nquit\n",
        capture_output=True,
        text=True,
        timeout=30,
    )
    uploader = RemarkableUploader()
    connected = uploader.check_connection()
    if connected:
        return {"status": "ok"}
    else:
        return {"status": "error", "error": result.stderr.strip() or "Pairing failed. Check the code and try again."}
