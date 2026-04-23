# NYT Crossword to reMarkable — UI Design Brief

## What This Tool Does

A self-hosted web dashboard that automatically delivers the daily NYT crossword puzzle (as a PDF) to a reMarkable tablet via the cloud. It runs as a single Python process on a home server (Mac Mini) and is accessed over Tailscale from any device — laptop, phone, etc.

This is an open-source project (`pip install nyt-crossword-remarkable`), so the UI should feel polished enough to be credible but not over-designed.

## Target User

Crossword enthusiasts who own a reMarkable tablet and have an NYT Games subscription. Technically comfortable (they're self-hosting), but the UI should make day-to-day use effortless.

## Screens / Functional Requirements

### 1. Dashboard (Main Screen)

The primary view. Everything the user needs at a glance.

**Health Status** — two connection indicators:
- **NYT Connection** — is the auth cookie valid? Shows: connected (with expiry estimate if possible), expired, or unknown. When expired, provides a clear action to re-authenticate.
- **reMarkable Connection** — is `rmapi` authenticated and can reach the cloud? Shows: connected, disconnected, or not configured.

**Manual Fetch Controls:**
- "Fetch Today" — prominent action to grab today's puzzle and send it to the reMarkable immediately.
- Date picker — select a past date to fetch that day's puzzle instead. Should prevent selecting future dates or dates before the NYT crossword archive begins.
- Feedback on fetch progress: downloading PDF → uploading to reMarkable → done/error.

**Schedule Overview:**
- Shows the current auto-fetch schedule at a glance (e.g., "Every day at 10:00 PM ET" or "Mon, Wed, Fri at 10:00 PM ET").
- Quick link/button to edit the schedule.

**Recent History:**
- Last 5-10 fetches with: date of puzzle, timestamp of fetch, success/failure status.
- Failed fetches should show the reason (cookie expired, network error, etc.).

### 2. Settings

Can be a separate page, a slide-out panel, or a section — design decision is yours.

**Schedule Configuration:**
- Which days of the week to auto-fetch (default: every day).
- What time to run (default: 10:00 PM ET — when the next day's puzzle drops).
- Timezone selector.

**reMarkable Settings:**
- Destination folder on the reMarkable (e.g., `/Crosswords`).
- File naming pattern (e.g., `NYT Crossword - Apr 23, 2026`).

**NYT Authentication:**
- Current cookie status (valid/expired).
- "Re-authenticate" action that walks the user through the browser-based cookie refresh flow.

### 3. First-Run / Setup Flow

For new users who just installed the tool. Needs to guide them through:

1. **NYT Login** — authenticate with their NYT account to capture the session cookie.
2. **reMarkable Connection** — walk through the one-time device registration (user gets an 8-char code from remarkable.com, pastes it into the tool).
3. **Schedule** — pick their preferred fetch schedule.
4. **Destination folder** — choose or create the reMarkable folder.

This could be a wizard/stepper or a checklist — up to the designer.

## Design Constraints

- **Responsive** — must work well on both desktop and mobile (phone access over Tailscale is a primary use case).
- **React** — frontend framework is React (specific meta-framework TBD — could be Vite, Next.js static export, or plain CRA).
- **Static build** — the React app is compiled to static files and served by the Python backend. No SSR needed.
- **Single page feel** — this is a simple tool, not a complex app. Minimal navigation. Dashboard should be the landing page with settings easily accessible.

## Design-Open Questions (Your Call)

- Overall visual style and personality — minimal? Editorial/NYT-inspired? Playful?
- Light mode, dark mode, or both?
- Layout approach — single scrollable page? Tabs? Sidebar?
- How health status is visualized — cards, badges, a status bar, colored dots?
- Schedule picker UX — day-of-week checkboxes? Toggle switches? Calendar?
- History presentation — table, timeline, cards?
- How the setup wizard flows
- How errors and empty states are communicated
- Typography and color palette
- Any micro-interactions or transitions

## Technical Context (For Reference)

- Backend: Python (FastAPI), serves the React static build and a REST API.
- reMarkable uploads: via `rmapi` (Go CLI tool, called from Python).
- NYT puzzle source: PDF downloaded from NYT's print endpoint with a session cookie.
- Scheduling: APScheduler running in-process.
- Config: JSON file at `~/.config/nyt-crossword-remarkable/config.json`.
- Hosting: user's own machine (Mac Mini, Raspberry Pi, etc.), accessed over local network or Tailscale.
