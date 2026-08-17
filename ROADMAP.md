# Roadmap — remarkable_server

**Updated:** 2026-08-17 · **Lead:** unassigned

Nightly NYT crossword delivery to a reMarkable tablet, plus Libgen send-to-tablet. Feature
work is finished but stranded on a branch; the next milestone is getting it onto `main` and
reachable from Ryan's phone over Tailscale.

> **Seeded by the butler on 2026-07-25 from repo state, not from Ryan.** Items below are
> inferred from git history and the README. Confirm or rewrite them before trusting this.

## Now

| Item | Status | Updated | Notes |
|---|---|---|---|
| Land `ryan/ui-fixes-and-rmapi-compat` on `main` | blocked | 2026-07-31 | Investigated: branch is **finished**, not abandoned — it is the code currently running in production (editable install). Libgen works end-to-end. Blocked only on Ryan saying "merge"; he has not answered yet. |
| Harden the LaunchAgent bind address | planned | 2026-07-31 | Plist hardcodes `--host 100.104.214.92` (Tailscale IP), overriding `config.json`'s `0.0.0.0`. Any Tailscale outage means uvicorn cannot bind → exit 1 → `KeepAlive` crash loop (2,559 restarts observed). Fix is to bind `0.0.0.0`. |
| Fix 3 stale tests | planned | 2026-07-31 | Not product bugs. 2 in `test_remarkable.py` assert the pre-`--force` rmapi call signature from before c81c095; 1 in `test_nyt_fetcher.py` hardcodes date `2026-04-23` against `date.today()`, so it fails every day since April. 75 pass. |
| Serve the web dashboard over Tailscale | planned | 2026-07-31 | Unblocked — `tailscaled` is live again. Server already binds the tailnet IP on :8742. Ports 4200/8888/443 are taken by other services; never run `tailscale serve reset`. |

## Next

| Item | Status | Updated | Notes |
|---|---|---|---|
| Libgen search — verify still working post-rmapi changes | planned | 2026-07-25 | Last feature added before the branch was parked. |

## Later

| Item | Status | Updated | Notes |
|---|---|---|---|
| | | | |

## Shipped

| Item | Shipped | Notes |
|---|---|---|
| Search by author (and every field) | 2026-08-17 | The search box always promised "title, author, or ISBN" but only ever called `search_title` — author queries found nothing. `search()` takes a `mode` of `all`/`title`/`author`, mapping to the library's `search_default`/`search_title`/`search_author`, with chips in the UI. Defaults to `all`, so the placeholder is finally true without touching anything. |
| Fix Libgen search and download blocked by User-Agent | 2026-08-16 | The mirrors began answering `python-requests`/`python-httpx` clients with a ~640-byte empty page under HTTP 200 — no results table, no download link, nothing raised. Search silently returned zero results for every query and downloads failed with "Could not find download link". All our httpx calls now send a browser UA, and `force_browser_ua_for_requests()` overrides the default for `libgen_api_enhanced`, which calls `requests.get()` with no header hook. Verified live: 4 results for "siddhartha hesse" and an uncached book downloaded and delivered end-to-end. |
| Fix Send buttons dying after any crossword fetch | 2026-07-31 | `Library.tsx` disabled every Send button whenever `fetchState.phase !== 'idle'`, and a finished crossword fetch parks it at `done` forever. Tapping Send issued no request at all — confirmed in the access log, which shows many searches and no sends. Frontend twin of the `routes_library` guard; the backend fix alone was invisible without it. |
| Fix "Resend" doing nothing | 2026-07-31 | The button only fired a `Resending…` toast — it never called the API. `BookSendRecord` also lacked `md5`/`mirror_url`, so a resend had nothing to download from; both are now recorded and the button actually sends. Rows written before this show an honest "no source saved" message instead of a fake toast. |
| Fix Libgen search freezing the whole server | 2026-07-31 | `LibgenService.search()` ran the synchronous `libgen_api_enhanced` call directly on the event loop with no timeout, so one unresponsive mirror hung every endpoint — `/api/health` included — until a restart. Reproduced live (server wedged at 0% CPU with the mirror socket still open). Now runs via `asyncio.to_thread` under a 45s timeout. First tests for the Libgen feature, which shipped with none. |
| Fix book sends blocked after any crossword fetch | 2026-07-31 | `routes_library.send_book` required `fetch_state` to be `IDLE`, but a finished crossword fetch parks it at `DONE` and nothing resets it — so "send to tablet" silently returned `already_running` until the next restart. Now matches the guard in `routes_fetch`. |
| Fix reMarkable cloud sync (rmapi v0.0.32 → v0.0.34) | 2026-07-31 | Root cause of delivery failure. v0.0.32 failed every sync with `mirror was not ok: status 400`; the cloud API changed. v0.0.34 adds the `.docSchema` extension in Mirror/BuildTree. Verified end-to-end: `Friday Jul 31, 2026` delivered to `/Crosswords`, `/api/health/remarkable` now `ok`. |
| Libgen search and send-to-tablet | 2026-04-25 | On the feature branch, not yet on `main`. |
| Web dashboard with activity grid and click-to-fetch | 2026-04 | |
| Automatic nightly crossword delivery | 2026-04 | Core loop. |
