# Activity Page and Job Queue — Design Spec

**Date:** 2026-07-31
**Status:** approved, pending implementation plan

## Problem

Pressing "Send to tablet" gives no feedback. The book downloads, gets validated,
uploads, and is verified on the device — and the user sees none of it. Once the
button is pressed, the outcome is invisible.

Three causes, all confirmed against the running service:

1. **Polling never starts.** `Dashboard.tsx:37` returns early when the phase is
   `idle` or `done`, and `Library.handleSend` never moves the phase locally. The
   poll loop exits immediately on every book send.
2. **The progress strip is on the wrong page.** `ProgressStrip` renders inside
   `Dashboard`, not `Library`, so even a working strip updates somewhere the user
   is not looking after pressing Send.
3. **The result is erased after 3 seconds.** `routes_library._run`'s `finally`
   block resets `fetch_state`, wiping success or failure before it can be read.

A fourth defect surfaced while testing and drives the architecture:

4. **Sends are not serialized.** Two `POST /api/library/send` calls one second
   apart both returned `started`. The guard reads `fetch_state.phase` before the
   background task has set it, so the check is racy and ineffective. Concurrent
   jobs then share one global progress object and overwrite each other's phase
   and log — the "weird order" the user reported. Evidence: 16 send requests in
   the access log against 11 history records.

## Model

- **Job** — one unit of work: a book send or a crossword fetch. Download →
  prepare → upload.
- **Queue** — jobs waiting to run, in press order.
- **History** — jobs that finished. Already persisted on disk
  (`book_history.json`, `history.json`).
- **Activity** — the page showing all three.

The user must be able to press Send ten times and have all ten complete in
order, with each outcome visible.

## Architecture

A `JobQueue` service replaces the single global `fetch_state` as the source of
truth for in-flight work.

```
POST /api/library/send ─┐
POST /api/fetch ────────┴──▶ JobQueue.enqueue() ──▶ [job, job, job, …]
                                                          │
                                              single worker task
                                              drains sequentially
                                                          │
                                    ┌─────────────────────┴──────────┐
                                    ▼                                ▼
                            BookOrchestrator                 Orchestrator
                                    │                                │
                                    └────────▶ on-disk history ◀─────┘
```

### JobQueue

**Purpose:** Own job ordering, execution, and live state.

**Job fields:** `id`, `kind` (`book` | `crossword`), `label`, `status`
(`queued` | `running` | `done` | `failed`), `progress`, `log` (list of
`{ts, msg, kind}`), `error`.

**Behaviour:**

- `enqueue(job)` appends and returns the job id immediately. Never rejects.
- **Exactly one worker** drains the queue. One job runs at a time — which is
  what rmapi and the libgen mirrors want anyway, and what removes the shared
  state collisions entirely.
- Each job owns its own `log` and `progress`. No global progress object.
- A failed job does **not** stop the queue. Remaining jobs continue.
- Finished jobs stay in the in-memory list so their outcome remains readable,
  and are also written to the existing on-disk history.
- No auto-retry. Retry is an explicit user action that enqueues a new job.

**Dependencies:** `BookOrchestrator`, `Orchestrator`. No I/O of its own, so it
is directly testable.

### API

- `GET /api/activity` — queue plus history, merged, newest first, capped at the
  50 most recent finished jobs. Queued and running jobs are never truncated.
- `POST /api/library/send` — enqueues a book job. Response keeps its existing
  `{"status": "started", "title": …}` shape with a `job_id` added, so the
  current Library code keeps working.
- `POST /api/fetch` — enqueues a crossword job. Response keeps its existing
  `{"status": "started", "date": …}` shape with a `job_id` added, so the current
  Dashboard keeps working.
- `POST /api/activity/{id}/retry` — re-enqueues a failed job.
- `GET /api/fetch/status` — **retained unchanged** so the existing Dashboard
  strip and Wizard keep working.

### Frontend

New `Activity` page:

- **NOW** — the running job, with phase bars and its live log.
- **QUEUED** — jobs waiting, in order.
- **TODAY / EARLIER** — history, with failures showing their real error text.

Each row carries a `BOOK` or `CROSSWORD` tag. Polls while anything is running or
queued; stops when everything is idle.

The Library's Send button enqueues and stops caring — no local phase tracking,
which is what broke it in the first place.

## Testing

The queue is plain Python with no I/O:

- Ten rapid enqueues all land, none rejected.
- Jobs execute in press order.
- Only one job runs at a time.
- A failing job does not stop the queue; later jobs still run.
- A finished job's outcome stays readable.
- Failure records carry the real error text.

API level: enqueue returns immediately rather than blocking, and `/api/activity`
merges queue and history correctly.

## Trade-offs and scope

- **Replaces `fetch_state`**, which `Dashboard` and `Wizard` both read. This
  touches more than the Library. `/api/fetch/status` is kept as a compatibility
  shim so those keep working without being rewritten.
- **The queue is in memory.** History persists, but jobs still queued when the
  server restarts are lost. Durable queueing is real extra work and is
  explicitly out of scope.
- **Sequential by design.** Parallel sends would be faster but reintroduce the
  collision problem and pressure the mirrors. Not doing it.

## Out of scope

- Durable/restart-surviving queue.
- Parallel job execution.
- Push notifications for failures that happen while nobody is watching. The
  Activity page records them; surfacing them elsewhere is a separate piece of
  work.
