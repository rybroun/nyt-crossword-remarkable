# Roadmap — remarkable_server

**Updated:** 2026-07-31 · **Lead:** unassigned

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
| Fix reMarkable cloud sync (rmapi v0.0.32 → v0.0.34) | 2026-07-31 | Root cause of delivery failure. v0.0.32 failed every sync with `mirror was not ok: status 400`; the cloud API changed. v0.0.34 adds the `.docSchema` extension in Mirror/BuildTree. Verified end-to-end: `Friday Jul 31, 2026` delivered to `/Crosswords`, `/api/health/remarkable` now `ok`. |
| Libgen search and send-to-tablet | 2026-04-25 | On the feature branch, not yet on `main`. |
| Web dashboard with activity grid and click-to-fetch | 2026-04 | |
| Automatic nightly crossword delivery | 2026-04 | Core loop. |
