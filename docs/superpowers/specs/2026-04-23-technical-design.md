# NYT Crossword to reMarkable — Technical Design Spec

## Overview

A self-hosted Python tool that automatically fetches the daily NYT crossword puzzle as a PDF and delivers it to a reMarkable tablet via the cloud. Distributed as `nyt-crossword-remarkable` on PyPI. Accessed via a React web dashboard over local network or Tailscale.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              nyt-crossword-remarkable                 │
│                                                      │
│  ┌────────────┐     ┌─────────────┐    ┌──────────┐ │
│  │   React    │────▶│   FastAPI   │───▶│  rmapi   │ │
│  │  Frontend  │ API │   Backend   │sub │  (Go)    │ │
│  │  (static)  │     │             │proc│          │ │
│  └────────────┘     └──────┬──────┘    └──────────┘ │
│                            │                         │
│                    ┌───────┴───────┐                 │
│                    │  APScheduler  │                 │
│                    │   (in-proc)   │                 │
│                    └───────┬───────┘                 │
│                            │                         │
│                    ┌───────┴───────┐                 │
│                    │  Config Store │                 │
│                    │  (JSON file)  │                 │
│                    └───────────────┘                 │
└──────────────────────────────────────────────────────┘
```

Single Python process. React frontend compiled to static files and served by FastAPI. Scheduler runs in-process. reMarkable uploads via `rmapi` subprocess.

---

## Components

### 1. NYT Crossword Fetcher

**Purpose:** Download the daily crossword PDF from the NYT.

**Endpoint:**
```
GET https://www.nytimes.com/svc/crosswords/v2/puzzle/print/{MMMddyy}.pdf
```
- Date format: 3-letter month + 2-digit day + 2-digit year (e.g., `Apr2326`)
- Requires `NYT-S` session cookie from a paid NYT Games subscription

**Authentication:**
- Cookie-based only. No OAuth, no API keys.
- The `NYT-S` cookie lasts approximately 6-12 months.
- Stored in the config file (encrypted at rest — see Security section).
- On 403 response: mark cookie as expired, notify user via the dashboard.

**Cookie Acquisition Flow:**
1. Tool opens a local proxy page in the user's browser.
2. Page redirects to NYT login at `https://myaccount.nytimes.com/auth/login`.
3. After login, the tool's local server intercepts the `NYT-S` cookie from the redirect/response.
4. Cookie is saved to config.
5. Fallback: if the proxy approach fails (NYT blocks framing), the UI provides instructions for manually extracting the cookie from browser DevTools and pasting it in.

**Cookie Health Check:**
- On each fetch attempt, check the response status.
- Periodic lightweight check: hit `https://www.nytimes.com/svc/crosswords/v6/puzzle/daily/{today}.json` with the cookie — 200 means valid, 403 means expired.
- Dashboard displays: `Connected` (green), `Expired` (red + re-auth prompt), or `Unknown` (gray, never checked).

**PDF Storage:**
- Downloaded PDFs are cached locally at `~/.config/nyt-crossword-remarkable/cache/{YYYY-MM-DD}.pdf`.
- Prevents re-downloading the same puzzle on retry/manual fetch.

### 2. reMarkable Uploader

**Purpose:** Upload the crossword PDF to the user's reMarkable tablet via the cloud.

**Method:** Shell out to [`ddvk/rmapi`](https://github.com/ddvk/rmapi) — the actively maintained Go CLI that supports reMarkable's current sync15 protocol.

**Commands used:**
```bash
rmapi put <pdf_path> /<destination_folder>     # upload PDF
rmapi ls /                                      # list folders (for folder picker)
rmapi mkdir /<folder_name>                      # create folder
rmapi version                                   # verify rmapi is installed
```

**Authentication:**
- One-time device registration: user gets an 8-char code from `https://my.remarkable.com/connect/desktop`, enters it into the tool's setup wizard.
- `rmapi` stores its device token at `~/.config/rmapi/rmapi.conf`. After initial setup, token refresh is automatic.
- The tool does NOT manage rmapi's auth directly — it delegates to rmapi and checks for errors.

**Health Check:**
- Run `rmapi ls /` — success means connected, failure means auth issue or network problem.
- Dashboard displays: `Connected` (green), `Disconnected` (red + instructions), or `Not Configured` (gray).

**Upload behavior:**
- File naming: configurable pattern, default `NYT Crossword - {Mon DD, YYYY}` (e.g., `NYT Crossword - Apr 23, 2026`).
- Destination folder: configurable, default `/Crosswords`.
- If the file already exists on the reMarkable (same name in same folder), skip upload. Avoids duplicates on retry.

### 3. Scheduler

**Purpose:** Automatically fetch and deliver the crossword on a user-defined schedule.

**Implementation:** [APScheduler](https://apscheduler.readthedocs.io/) running in the FastAPI process.

**Default schedule:** Every day at 10:00 PM ET (when the next day's puzzle typically drops).

**User-configurable:**
- Days of the week (e.g., only weekends, every day, specific days).
- Time of day.
- Timezone.

**Job execution flow:**
1. Check if today's puzzle is already cached and uploaded → skip if so.
2. Fetch PDF from NYT.
3. Upload to reMarkable via rmapi.
4. Log result (success/failure + reason) to fetch history.
5. On failure: retry up to 3 times with exponential backoff (30s, 2min, 10min). If all retries fail, log the error.

**Schedule persistence:** Stored in config file. Loaded on startup.

### 4. FastAPI Backend

**Purpose:** REST API serving the React frontend and orchestrating all operations.

**API Endpoints:**

```
# Health
GET  /api/health                    → { nyt: status, remarkable: status }
GET  /api/health/nyt                → { status, cookie_age_days, expires_estimate }
GET  /api/health/remarkable         → { status, folder_exists }

# Fetch
POST /api/fetch                     → { job_id }
     body: { date: "2026-04-23" }   (defaults to today)
GET  /api/fetch/{job_id}/status     → { status, progress, error }

# History
GET  /api/history                   → [{ date, fetched_at, status, error }]
     query: ?limit=20&offset=0

# Schedule
GET  /api/schedule                  → { days, time, timezone, enabled }
PUT  /api/schedule                  → updated schedule
     body: { days: ["mon","wed","fri"], time: "22:00", timezone: "America/New_York", enabled: true }

# Settings
GET  /api/settings                  → { remarkable_folder, file_naming_pattern }
PUT  /api/settings                  → updated settings

# Auth - NYT
GET  /api/auth/nyt/status           → { authenticated, cookie_age_days }
POST /api/auth/nyt/start            → { auth_url } (starts browser auth flow)
POST /api/auth/nyt/cookie           → accepts manually pasted cookie
     body: { cookie: "NYT-S=..." }

# Auth - reMarkable
GET  /api/auth/remarkable/status    → { authenticated, device_name }
POST /api/auth/remarkable/register  → register with one-time code
     body: { code: "apwngead" }

# Static frontend
GET  /                              → serves React app
GET  /assets/*                      → serves static assets
```

**Server config:**
- Default bind: `0.0.0.0:8080` (accessible over network/Tailscale).
- Configurable via CLI flags or env vars: `--host`, `--port`.

### 5. React Frontend

**Purpose:** Web dashboard for controlling the tool.

**Screens:** See [UI Design Brief](./2026-04-23-ui-design-brief.md) for full functional requirements and design-open questions.

Summary:
- **Dashboard** — health indicators, fetch controls (today + date picker), schedule overview, recent history.
- **Settings** — schedule config, reMarkable folder, file naming, NYT auth management.
- **Setup Wizard** — first-run flow: NYT login → reMarkable registration → schedule → folder.

**Build:**
- React app built with Vite to static files.
- Output goes into the Python package at `nyt_crossword_remarkable/frontend/dist/`.
- FastAPI serves these files. No SSR.
- Frontend framework/library decisions (component library, state management, etc.) TBD after design mocks.

### 6. Config Store

**Location:** `~/.config/nyt-crossword-remarkable/config.json`

**Schema:**
```json
{
  "nyt": {
    "cookie": "<encrypted NYT-S value>",
    "cookie_set_at": "2026-04-23T22:00:00Z"
  },
  "remarkable": {
    "folder": "/Crosswords",
    "file_pattern": "NYT Crossword - {Mon DD, YYYY}"
  },
  "schedule": {
    "enabled": true,
    "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    "time": "22:00",
    "timezone": "America/New_York"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 8080
  }
}
```

**Fetch history** stored separately at `~/.config/nyt-crossword-remarkable/history.json` to keep config file clean.

---

## User Flows

### First-Run Setup

1. User installs: `pip install nyt-crossword-remarkable`
2. User installs rmapi: `go install github.com/ddvk/rmapi@latest` (or downloads binary)
3. User runs: `nyt-crossword-remarkable serve`
4. Browser opens to `http://localhost:8080`
5. Setup wizard detects no config exists → guides through:
   - **Step 1: NYT Login** — opens NYT login in browser, captures cookie (or manual paste fallback)
   - **Step 2: reMarkable** — instructions to get code from `my.remarkable.com/connect/desktop`, user pastes code, tool calls `rmapi` to register
   - **Step 3: Schedule** — pick days and time
   - **Step 4: Folder** — pick or create reMarkable folder (lists existing via `rmapi ls`)
6. Config saved. Dashboard loads. First fetch triggered if a puzzle is available.

### Daily Auto-Fetch (Happy Path)

1. APScheduler fires at configured time.
2. Backend checks if today's puzzle is already cached → skip if yes.
3. Fetches PDF from NYT with stored cookie → saves to cache.
4. Uploads PDF to reMarkable via `rmapi put`.
5. Logs success to history.

### Manual Fetch

1. User opens dashboard in browser.
2. Clicks "Fetch Today" or picks a past date.
3. Frontend POSTs to `/api/fetch` with the date.
4. Backend runs fetch + upload, returns job ID.
5. Frontend polls `/api/fetch/{job_id}/status` for progress.
6. Dashboard shows result: success or error with reason.

### Cookie Expired

1. Scheduled fetch returns 403 from NYT.
2. Backend marks NYT status as expired, logs the failure.
3. Dashboard shows red health indicator: "NYT cookie expired."
4. User clicks "Re-authenticate" → same flow as first-run NYT login.
5. New cookie saved. User can retry the failed fetch.

### reMarkable Disconnected

1. Upload fails (rmapi returns error).
2. Backend logs failure, marks reMarkable status as disconnected.
3. Dashboard shows red indicator with instructions.
4. If it's an auth issue: user re-registers with a new code.
5. If it's transient: retry button, or wait for next scheduled attempt.

---

## CLI Interface

```bash
# Start the server (primary usage)
nyt-crossword-remarkable serve [--host 0.0.0.0] [--port 8080]

# One-off fetch without the server (convenience)
nyt-crossword-remarkable fetch [--date 2026-04-23]

# Check health status
nyt-crossword-remarkable status

# Open setup wizard in browser
nyt-crossword-remarkable setup
```

Entry point defined in `pyproject.toml` as a console script.

---

## Security Considerations

- **NYT cookie encryption:** The `NYT-S` cookie is a session credential. Stored encrypted in the config file using a machine-specific key (e.g., via `keyring` library or a local secret). At minimum, the config file should have `600` permissions.
- **No secrets in source control:** `.gitignore` must exclude config directory.
- **Network binding:** Default `0.0.0.0:8080` is intentional (Tailscale access), but documentation should warn that this exposes the UI to the local network. Users behind Tailscale are fine; others should bind to `127.0.0.1`.
- **No auth on the web UI itself:** Assumed to be on a trusted network (Tailscale, LAN). Could add optional basic auth as a future enhancement.
- **Open-source considerations:** The tool itself is legal to distribute. Users must supply their own NYT subscription credentials. README must clearly state this and note that the NYT API is undocumented/unofficial.

---

## Dependencies

### Python (pip)
- `fastapi` — web framework
- `uvicorn` — ASGI server
- `httpx` — async HTTP client (for NYT fetches)
- `apscheduler` — in-process cron scheduling
- `pydantic` — config/request validation (comes with FastAPI)
- `keyring` (optional) — secure credential storage
- `click` or `typer` — CLI interface

### External
- `rmapi` — Go binary, installed separately. The tool checks for its presence on startup and provides install instructions if missing.

### Frontend (npm, dev only)
- `react`, `vite`, and UI libraries TBD after design phase.
- Built to static files, bundled into the Python package at publish time.

---

## Project Structure

```
nyt-crossword-remarkable/
├── pyproject.toml
├── README.md
├── LICENSE
├── .gitignore
├── src/
│   └── nyt_crossword_remarkable/
│       ├── __init__.py
│       ├── __main__.py              # CLI entry point
│       ├── cli.py                   # click/typer CLI commands
│       ├── server.py                # FastAPI app setup + static file serving
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes_health.py
│       │   ├── routes_fetch.py
│       │   ├── routes_schedule.py
│       │   ├── routes_settings.py
│       │   └── routes_auth.py
│       ├── services/
│       │   ├── __init__.py
│       │   ├── nyt_fetcher.py       # NYT PDF download + cookie management
│       │   ├── remarkable.py        # rmapi wrapper
│       │   └── scheduler.py         # APScheduler setup
│       ├── config.py                # Config load/save/schema
│       └── frontend/
│           └── dist/                # Built React static files (gitignored, built at publish)
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── api/                     # API client hooks
│   └── ...
├── tests/
│   ├── test_nyt_fetcher.py
│   ├── test_remarkable.py
│   ├── test_scheduler.py
│   └── test_api.py
└── docs/
    └── superpowers/
        └── specs/
            ├── 2026-04-23-ui-design-brief.md
            └── 2026-04-23-technical-design.md
```

---

## Distribution

- **PyPI:** `pip install nyt-crossword-remarkable`
- **Build pipeline:** GitHub Actions workflow on tagged releases:
  1. Build React frontend (`npm run build`)
  2. Copy built files into Python package
  3. Build Python wheel
  4. Publish to PyPI
- **rmapi:** Documented as a prerequisite. Install via `go install github.com/ddvk/rmapi@latest` or download from GitHub releases.
- **Future:** Homebrew formula that installs both the Python package and rmapi together.

---

## Testing Strategy

- **Unit tests:** NYT fetcher (mock HTTP responses), config management, date formatting.
- **Integration tests:** rmapi wrapper (mock subprocess calls), API endpoints (TestClient).
- **Manual testing:** Full flow on a real reMarkable + NYT subscription during development.
- **CI:** GitHub Actions running pytest on push/PR.

---

## Open Questions

1. **NYT auth proxy flow** — needs prototyping. The browser-based cookie capture may require a local proxy or browser extension approach. Manual paste is the guaranteed fallback.
2. **React meta-framework** — Vite is the likely choice, but finalize after design mocks.
3. **Cookie encryption** — `keyring` vs. simpler approach (Fernet with machine-derived key). Decide during implementation.
4. **rmapi as a Python library** — there's an outside chance of writing a pure-Python reMarkable cloud client, but this is significant scope. Stick with subprocess for v1.
5. **Notifications** — not in v1. Could add macOS notifications, email, or webhooks for failures in a future version.
