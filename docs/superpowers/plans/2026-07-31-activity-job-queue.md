# Activity Page and Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user press Send ten times and watch all ten jobs run in order, each showing download → prepare → upload and ending in a visible success or failure.

**Architecture:** A `JobQueue` service owns an ordered list of `Job` objects and drains them with exactly one worker task, so no two jobs ever share progress state. Each `Job` exposes the same `set_phase`/`add_log`/`complete` interface the orchestrators already call, so the orchestrators take a progress sink parameter instead of importing the global singleton. A new `/api/activity` endpoint merges live queue state with on-disk history, and a new Activity page renders it.

**Tech Stack:** Python 3.13, FastAPI, pytest (`asyncio_mode = "auto"`), React 18 + TypeScript, Vite.

## Global Constraints

- Run all Python commands with `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib` prefixed, or `pyexpat` fails to load on this machine.
- Use `.venv/bin/python -m pytest`, not a bare `pytest`.
- Statuses are exactly `queued` | `running` | `done` | `failed`. Job kinds are exactly `book` | `crossword`.
- `GET /api/fetch/status` must keep returning its existing shape (`{phase, progress, log, puzzle_date}`) — the Dashboard and Wizard read it and are not being rewritten.
- `POST /api/library/send` and `POST /api/fetch` must keep their existing response fields and add `job_id`.
- The frontend bundle in `src/nyt_crossword_remarkable/frontend/dist/` is gitignored by the `dist/` rule in `.gitignore`. It **must** be committed with `git add -f`, or `index.html` will reference a bundle that is not in the repo.
- Never commit to `main`. All work stays on the current branch.

---

### Task 1: Job model and queue ordering

**Files:**
- Create: `src/nyt_crossword_remarkable/services/job_queue.py`
- Test: `tests/test_job_queue.py`

**Interfaces:**
- Consumes: `FetchPhase` from `nyt_crossword_remarkable.services.fetch_state`.
- Produces: `Job` dataclass with fields `id: str`, `kind: str`, `label: str`, `status: str`, `phase: str`, `progress: int`, `log: list[dict]`, `error: str | None`, `created_at: datetime`, `finished_at: datetime | None`; methods `set_phase(phase, progress=0)`, `add_log(msg, kind="info")`, `complete()`, `to_dict()`. Class `JobQueue` with `enqueue(kind, label, runner) -> Job`, `get(job_id) -> Job | None`, `jobs(limit=50) -> list[Job]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_job_queue.py
import pytest

from nyt_crossword_remarkable.services.job_queue import Job, JobQueue


async def _noop(job: Job) -> None:
    return None


class TestJobQueueOrdering:
    def test_enqueue_returns_a_queued_job_with_an_id(self):
        queue = JobQueue()
        job = queue.enqueue("book", "Siddhartha", _noop)

        assert job.id
        assert job.kind == "book"
        assert job.label == "Siddhartha"
        assert job.status == "queued"

    def test_ten_rapid_enqueues_all_land_in_press_order(self):
        queue = JobQueue()
        for i in range(10):
            queue.enqueue("book", f"Book {i}", _noop)

        labels = [j.label for j in queue.jobs()]
        assert labels == [f"Book {i}" for i in range(10)]

    def test_jobs_are_addressable_by_id(self):
        queue = JobQueue()
        job = queue.enqueue("crossword", "2026-07-31", _noop)

        assert queue.get(job.id) is job
        assert queue.get("nope") is None

    def test_job_records_phase_and_log_like_the_progress_sink(self):
        job = Job(kind="book", label="Siddhartha")
        job.add_log("Fetching…")
        job.set_phase("download", 40)

        assert job.phase == "download"
        assert job.progress == 40
        assert job.log[0]["msg"] == "Fetching…"
        assert job.log[0]["kind"] == "info"
        assert "ts" in job.log[0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_job_queue.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'nyt_crossword_remarkable.services.job_queue'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/nyt_crossword_remarkable/services/job_queue.py
"""Ordered, one-at-a-time execution of delivery jobs."""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

JobRunner = Callable[["Job"], Awaitable[None]]


@dataclass
class Job:
    """One delivery: a book send or a crossword fetch.

    Exposes the same set_phase/add_log/complete surface as FetchProgress so the
    orchestrators can write into a job instead of the global singleton.
    """

    kind: str  # "book" | "crossword"
    label: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: str = "queued"  # queued | running | done | failed
    phase: str = "idle"
    progress: int = 0
    log: list[dict] = field(default_factory=list)
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    finished_at: Optional[datetime] = None

    def set_phase(self, phase, progress: int = 0) -> None:
        self.phase = getattr(phase, "value", phase)
        self.progress = progress

    def add_log(self, msg: str, kind: str = "info") -> None:
        self.log.append({
            "ts": datetime.now().strftime("%H:%M:%S"),
            "msg": msg,
            "kind": kind,
        })

    def complete(self) -> None:
        self.phase = "done"
        self.progress = 100

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "label": self.label,
            "status": self.status,
            "phase": self.phase,
            "progress": self.progress,
            "log": self.log,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }


class JobQueue:
    """Holds jobs in press order and runs them one at a time."""

    def __init__(self):
        self._jobs: list[Job] = []
        self._runners: dict[str, JobRunner] = {}
        self._wakeup: Optional[asyncio.Event] = None
        self._worker: Optional[asyncio.Task] = None

    def enqueue(self, kind: str, label: str, runner: JobRunner) -> Job:
        job = Job(kind=kind, label=label)
        self._jobs.append(job)
        self._runners[job.id] = runner
        if self._wakeup is not None:
            self._wakeup.set()
        return job

    def get(self, job_id: str) -> Optional[Job]:
        for job in self._jobs:
            if job.id == job_id:
                return job
        return None

    def runner_for(self, job_id: str) -> Optional[JobRunner]:
        """The callable a job was enqueued with, if it is still retryable."""
        return self._runners.get(job_id)

    def jobs(self, limit: int = 50) -> list[Job]:
        """Queued and running jobs in press order, then the most recent
        finished ones. Only finished jobs are ever truncated."""
        live = [j for j in self._jobs if j.status in ("queued", "running")]
        finished = [j for j in self._jobs if j.status in ("done", "failed")]
        return live + finished[-limit:]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_job_queue.py -v`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add tests/test_job_queue.py src/nyt_crossword_remarkable/services/job_queue.py
git commit -m "feat: add Job model and ordered JobQueue"
```

---

### Task 2: Sequential worker with failure isolation

**Files:**
- Modify: `src/nyt_crossword_remarkable/services/job_queue.py`
- Test: `tests/test_job_queue.py`

**Interfaces:**
- Consumes: `Job`, `JobQueue` from Task 1.
- Produces: `JobQueue.start()` and `JobQueue.stop()` coroutines; a worker that sets `status` to `running`, then `done` or `failed`, and sets `finished_at` and `error`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_job_queue.py
import asyncio


class TestJobQueueWorker:
    async def _drain(self, queue: JobQueue, expected: int, timeout: float = 2.0):
        """Wait until `expected` jobs have reached a terminal status."""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            done = [j for j in queue.jobs() if j.status in ("done", "failed")]
            if len(done) >= expected:
                return done
            await asyncio.sleep(0.01)
        raise AssertionError(
            f"only {len([j for j in queue.jobs() if j.status in ('done','failed')])} "
            f"of {expected} jobs finished"
        )

    @pytest.mark.asyncio
    async def test_jobs_run_in_press_order(self):
        queue = JobQueue()
        order = []

        def runner_for(name):
            async def run(job):
                order.append(name)
            return run

        await queue.start()
        try:
            for i in range(10):
                queue.enqueue("book", f"Book {i}", runner_for(i))
            await self._drain(queue, 10)
        finally:
            await queue.stop()

        assert order == list(range(10))

    @pytest.mark.asyncio
    async def test_only_one_job_runs_at_a_time(self):
        queue = JobQueue()
        concurrent = 0
        peak = 0

        async def run(job):
            nonlocal concurrent, peak
            concurrent += 1
            peak = max(peak, concurrent)
            await asyncio.sleep(0.02)
            concurrent -= 1

        await queue.start()
        try:
            for i in range(5):
                queue.enqueue("book", f"Book {i}", run)
            await self._drain(queue, 5)
        finally:
            await queue.stop()

        assert peak == 1, f"{peak} jobs ran concurrently"

    @pytest.mark.asyncio
    async def test_a_failing_job_does_not_stop_the_queue(self):
        queue = JobQueue()
        ran = []

        async def boom(job):
            raise RuntimeError("mirror exploded")

        async def fine(job):
            ran.append(job.label)

        await queue.start()
        try:
            queue.enqueue("book", "Bad", boom)
            queue.enqueue("book", "Good", fine)
            await self._drain(queue, 2)
        finally:
            await queue.stop()

        jobs = {j.label: j for j in queue.jobs()}
        assert jobs["Bad"].status == "failed"
        assert "mirror exploded" in jobs["Bad"].error
        assert jobs["Good"].status == "done"
        assert ran == ["Good"]

    @pytest.mark.asyncio
    async def test_finished_jobs_stay_readable(self):
        queue = JobQueue()

        async def run(job):
            job.add_log("Delivered", "ok")

        await queue.start()
        try:
            job = queue.enqueue("book", "Siddhartha", run)
            await self._drain(queue, 1)
        finally:
            await queue.stop()

        assert job.status == "done"
        assert job.finished_at is not None
        assert job.log[-1]["msg"] == "Delivered"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_job_queue.py::TestJobQueueWorker -v`
Expected: FAIL with `AttributeError: 'JobQueue' object has no attribute 'start'`

- [ ] **Step 3: Write minimal implementation**

Add to `JobQueue` in `src/nyt_crossword_remarkable/services/job_queue.py`:

```python
    async def start(self) -> None:
        """Start the single worker that drains the queue."""
        if self._worker is not None and not self._worker.done():
            return
        self._wakeup = asyncio.Event()
        self._worker = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        if self._worker is None:
            return
        self._worker.cancel()
        try:
            await self._worker
        except asyncio.CancelledError:
            pass
        self._worker = None

    def _next_queued(self) -> Optional[Job]:
        for job in self._jobs:
            if job.status == "queued":
                return job
        return None

    async def _run_forever(self) -> None:
        while True:
            job = self._next_queued()
            if job is None:
                self._wakeup.clear()
                await self._wakeup.wait()
                continue
            await self._run_one(job)

    async def _run_one(self, job: Job) -> None:
        runner = self._runners.get(job.id)
        job.status = "running"
        try:
            if runner is not None:
                await runner(job)
            job.status = "done"
            job.complete()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            # One bad job must not stop the queue — the rest still run.
            logger.exception("Job %s (%s) failed", job.id, job.label)
            job.status = "failed"
            job.error = str(e)
            job.add_log(str(e), "err")
        finally:
            job.finished_at = datetime.now()
            self._runners.pop(job.id, None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_job_queue.py -v`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add tests/test_job_queue.py src/nyt_crossword_remarkable/services/job_queue.py
git commit -m "feat: drain the job queue with a single sequential worker"
```

---

### Task 3: Let orchestrators write into a job

**Files:**
- Modify: `src/nyt_crossword_remarkable/services/book_orchestrator.py`
- Modify: `src/nyt_crossword_remarkable/services/orchestrator.py`
- Test: `tests/test_job_queue.py`

**Interfaces:**
- Consumes: `Job` from Task 1.
- Produces: `BookOrchestrator(..., progress=None)` and `Orchestrator(..., progress=None)`. When `progress` is `None` they keep using the global `fetch_state`, so existing callers are unaffected.

**Context:** `book_orchestrator.py` currently imports `fetch_state` at module level and calls `fetch_state.set_phase(...)` / `fetch_state.add_log(...)` throughout `send_book`. Replace those calls with `self._progress.set_phase(...)` / `self._progress.add_log(...)`. Check `orchestrator.py` for the same pattern and apply it there too; if it does not touch `fetch_state`, only add the constructor parameter and leave the body alone.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_job_queue.py
from nyt_crossword_remarkable.services.book_orchestrator import BookOrchestrator


class TestOrchestratorProgressSink:
    def test_book_orchestrator_accepts_a_job_as_its_progress_sink(self):
        job = Job(kind="book", label="Siddhartha")
        orchestrator = BookOrchestrator(progress=job)

        orchestrator._progress.add_log("Fetching…")
        orchestrator._progress.set_phase("download", 30)

        assert job.log[0]["msg"] == "Fetching…"
        assert job.phase == "download"
        assert job.progress == 30

    def test_book_orchestrator_defaults_to_the_global_progress(self):
        from nyt_crossword_remarkable.services.fetch_state import fetch_state

        orchestrator = BookOrchestrator()
        assert orchestrator._progress is fetch_state
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_job_queue.py::TestOrchestratorProgressSink -v`
Expected: FAIL with `TypeError: BookOrchestrator.__init__() got an unexpected keyword argument 'progress'`

- [ ] **Step 3: Write minimal implementation**

In `book_orchestrator.py`, add the parameter to `__init__` and store it:

```python
    def __init__(
        self,
        mirror: str = "libgen.rs",
        books_folder: str = "/Books",
        cache_dir: Path = DEFAULT_BOOK_CACHE_DIR,
        history_path: Path = DEFAULT_BOOK_HISTORY_PATH,
        progress=None,
    ):
        ...
        # Where phase and log updates go. Defaults to the global singleton so
        # existing callers keep working; the job queue passes the Job itself.
        self._progress = progress if progress is not None else fetch_state
```

Then replace every `fetch_state.set_phase(` with `self._progress.set_phase(` and every `fetch_state.add_log(` with `self._progress.add_log(` inside `send_book`, including the final `fetch_state.complete()` / `fetch_state.set_phase(FetchPhase.DONE, 0)` calls.

Apply the same constructor change to `Orchestrator` in `orchestrator.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/ -v`
Expected: PASS for the new tests; the 3 pre-existing stale failures in `test_nyt_fetcher.py` and `test_remarkable.py` remain and are not your concern.

- [ ] **Step 5: Commit**

```bash
git add tests/test_job_queue.py src/nyt_crossword_remarkable/services/book_orchestrator.py src/nyt_crossword_remarkable/services/orchestrator.py
git commit -m "refactor: let orchestrators write progress into an injected sink"
```

---

### Task 4: Route book sends and crossword fetches through the queue

**Files:**
- Create: `src/nyt_crossword_remarkable/api/deps.py`
- Modify: `src/nyt_crossword_remarkable/api/routes_library.py:40-70`
- Modify: `src/nyt_crossword_remarkable/api/routes_fetch.py`
- Modify: `src/nyt_crossword_remarkable/server.py:22-32`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `JobQueue` from Tasks 1-2, `BookOrchestrator(progress=...)` from Task 3.
- Produces: module-level singleton `job_queue` in `deps.py`. `POST /api/library/send` returns `{"status": "started", "title": …, "job_id": …}`. `POST /api/fetch` returns `{"status": "started", "date": …, "job_id": …}`.

**Context:** `routes_library.send_book` currently guards on `fetch_state.phase` and calls `asyncio.create_task(_run())`. Delete the guard entirely — the queue is what serialises now, and the guard was racy. `routes_fetch.trigger_fetch` uses `BackgroundTasks` and a `run_fetch_in_background` that calls `asyncio.run` — replace with an enqueue.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_api.py
class TestQueueRoutes:
    BOOK = {"id": "1", "title": "Siddhartha", "author": "Hesse, Hermann"}

    def test_ten_rapid_sends_are_all_accepted(self, client):
        with patch("nyt_crossword_remarkable.api.routes_library.BookOrchestrator"):
            responses = [
                client.post("/api/library/send", json={"book": self.BOOK})
                for _ in range(10)
            ]

        assert all(r.status_code == 200 for r in responses)
        bodies = [r.json() for r in responses]
        assert all(b["status"] == "started" for b in bodies), bodies
        job_ids = {b["job_id"] for b in bodies}
        assert len(job_ids) == 10, "each send must get its own job"

    def test_send_never_returns_already_running(self, client):
        with patch("nyt_crossword_remarkable.api.routes_library.BookOrchestrator"):
            first = client.post("/api/library/send", json={"book": self.BOOK}).json()
            second = client.post("/api/library/send", json={"book": self.BOOK}).json()

        assert first["status"] == "started"
        assert second["status"] == "started"

    def test_trigger_fetch_returns_a_job_id_and_keeps_its_shape(self, client):
        r = client.post("/api/fetch", json={"date": "2026-04-23"})
        assert r.status_code == 202
        body = r.json()
        assert body["status"] == "started"
        assert body["date"] == "2026-04-23"
        assert body["job_id"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_api.py::TestQueueRoutes -v`
Expected: FAIL with `KeyError: 'job_id'`

- [ ] **Step 3: Write minimal implementation**

Create `src/nyt_crossword_remarkable/api/deps.py`:

```python
"""Shared singletons for the API layer."""

from nyt_crossword_remarkable.services.job_queue import JobQueue

# One queue for the whole process. Started on app startup in server.py.
job_queue = JobQueue()
```

Replace the body of `send_book` in `routes_library.py` (drop the `fetch_state` guard and the `asyncio.create_task` block):

```python
@router.post("/send")
async def send_book(req: SendRequest):
    config = load_config()

    async def _run(job):
        orchestrator = BookOrchestrator(
            mirror=config.library.mirror,
            books_folder=config.library.books_folder,
            progress=job,
        )
        record = await orchestrator.send_book(req.book)
        if record.status == "error":
            raise RuntimeError(record.error or "Send failed")

    job = job_queue.enqueue("book", req.book.title, _run)
    return {"status": "started", "title": req.book.title, "job_id": job.id}
```

Add `from nyt_crossword_remarkable.api.deps import job_queue` to the imports and drop the now-unused `fetch_state`/`FetchPhase`/`asyncio` imports.

Replace `trigger_fetch` in `routes_fetch.py`:

```python
@router.post("", status_code=202)
async def trigger_fetch(req: FetchRequest):
    puzzle_date = date.fromisoformat(req.date)
    config = load_config()

    async def _run(job):
        orchestrator = Orchestrator(
            nyt_cookie=config.nyt.cookie,
            remarkable_folder=config.remarkable.folder,
            file_pattern=config.remarkable.file_pattern,
            cache_dir=DEFAULT_CACHE_DIR,
            history_path=DEFAULT_HISTORY_PATH,
            progress=job,
        )
        job.add_log(f"Fetching puzzle for {puzzle_date.isoformat()}")
        record = await orchestrator.fetch_and_upload(puzzle_date)
        if record.status == "error":
            raise RuntimeError(record.error or "Fetch failed")
        job.add_log("Delivered successfully", "ok")

    job = job_queue.enqueue("crossword", puzzle_date.isoformat(), _run)
    return {"status": "started", "date": req.date, "job_id": job.id}
```

In `server.py`, start the worker on startup. Add next to the existing `@app.on_event` handlers:

```python
    @app.on_event("startup")
    async def _start_job_queue():
        from nyt_crossword_remarkable.api.deps import job_queue
        await job_queue.start()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/ -v`
Expected: PASS for the new tests. `TestLibraryRoutes::test_send_book_rejected_while_a_fetch_is_in_flight` will now fail because nothing is ever rejected — **delete that test**, its behaviour is intentionally gone. Keep `test_send_book_allowed_after_a_completed_crossword_fetch`.

- [ ] **Step 5: Commit**

```bash
git add tests/test_api.py src/nyt_crossword_remarkable/api/
git commit -m "feat: enqueue book sends and crossword fetches instead of racing"
```

---

### Task 5: The /api/activity endpoint

**Files:**
- Create: `src/nyt_crossword_remarkable/api/routes_activity.py`
- Modify: `src/nyt_crossword_remarkable/server.py` (include the router)
- Modify: `src/nyt_crossword_remarkable/api/routes_fetch.py` (`/status` shim)
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `job_queue` from Task 4.
- Produces: `GET /api/activity` returning `{"jobs": [...]}`; `POST /api/activity/{job_id}/retry` returning `{"status": "started", "job_id": …}` or 404.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_api.py
class TestActivityRoutes:
    BOOK = {"id": "1", "title": "Siddhartha", "author": "Hesse, Hermann"}

    def test_activity_lists_enqueued_jobs_newest_work_first(self, client):
        with patch("nyt_crossword_remarkable.api.routes_library.BookOrchestrator"):
            client.post("/api/library/send", json={"book": self.BOOK})

        r = client.get("/api/activity")
        assert r.status_code == 200
        jobs = r.json()["jobs"]
        assert any(j["label"] == "Siddhartha" and j["kind"] == "book" for j in jobs)

    def test_activity_job_carries_the_fields_the_page_renders(self, client):
        with patch("nyt_crossword_remarkable.api.routes_library.BookOrchestrator"):
            client.post("/api/library/send", json={"book": self.BOOK})

        job = client.get("/api/activity").json()["jobs"][0]
        for key in ("id", "kind", "label", "status", "phase", "progress", "log", "error"):
            assert key in job, f"missing {key}"

    def test_retry_of_an_unknown_job_is_a_404(self, client):
        r = client.post("/api/activity/does-not-exist/retry")
        assert r.status_code == 404

    def test_fetch_status_shim_still_returns_its_old_shape(self, client):
        r = client.get("/api/fetch/status")
        assert r.status_code == 200
        body = r.json()
        for key in ("phase", "progress", "log"):
            assert key in body
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_api.py::TestActivityRoutes -v`
Expected: FAIL with 404 on `/api/activity`

- [ ] **Step 3: Write minimal implementation**

Create `src/nyt_crossword_remarkable/api/routes_activity.py`:

```python
"""Activity endpoints — what is running, queued, and already delivered."""

from fastapi import APIRouter, HTTPException

from nyt_crossword_remarkable.api.deps import job_queue

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
async def activity():
    """Running and queued jobs first, then the most recent finished ones."""
    return {"jobs": [j.to_dict() for j in job_queue.jobs()]}


@router.post("/{job_id}/retry")
async def retry(job_id: str):
    job = job_queue.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job")
    runner = job_queue.runner_for(job_id)
    if runner is None:
        raise HTTPException(status_code=409, detail="This job cannot be retried")
    new_job = job_queue.enqueue(job.kind, job.label, runner)
    return {"status": "started", "job_id": new_job.id}
```

Retry re-runs the original callable, so a failed job must keep its runner.
Change the `finally` block in `JobQueue._run_one` (Task 2) to only discard the
runner on success:

```python
        finally:
            job.finished_at = datetime.now()
            if job.status == "done":
                self._runners.pop(job.id, None)
```

Register the router in `server.py` next to the others:

```python
from nyt_crossword_remarkable.api.routes_activity import router as activity_router
...
    app.include_router(activity_router)
```

Rewrite `/api/fetch/status` in `routes_fetch.py` as a shim over the queue:

```python
@router.get("/status")
async def fetch_status():
    """Compatibility shim — the Dashboard and Wizard still read this shape."""
    live = [j for j in job_queue.jobs() if j.status in ("queued", "running")]
    job = live[0] if live else None
    if job is None:
        finished = [j for j in job_queue.jobs() if j.status in ("done", "failed")]
        job = finished[-1] if finished else None
    if job is None:
        return {"phase": "idle", "progress": 0, "log": [], "puzzle_date": None}
    return {
        "phase": job.phase,
        "progress": job.progress,
        "log": job.log,
        "puzzle_date": job.label if job.kind == "crossword" else None,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/ -v`
Expected: PASS, aside from the 3 known stale failures

- [ ] **Step 5: Commit**

```bash
git add tests/test_api.py src/nyt_crossword_remarkable/api/
git commit -m "feat: add /api/activity and keep /api/fetch/status as a shim"
```

- [ ] **Step 6: Write the failing test for on-disk history**

The queue only knows about jobs from the current process. Deliveries from
before the last restart live in `book_history.json` and `history.json`, and the
spec requires them in the feed — that is how a failure from last night is still
visible this morning.

```python
# append to tests/test_api.py, inside TestActivityRoutes
    def test_activity_includes_deliveries_from_disk(self, client, tmp_path):
        import json
        book_history = tmp_path / "book_history.json"
        book_history.write_text(json.dumps([{
            "book_id": "5050912",
            "title": "Barbarian Days A Surfing Life",
            "author": "Finnegan, William",
            "format": "epub",
            "size": "7.6 MB",
            "folder": "/Books",
            "sent_at": "2026-04-25T16:17:25.723220",
            "status": "success",
            "error": None,
        }]))

        with patch(
            "nyt_crossword_remarkable.api.routes_activity.DEFAULT_BOOK_HISTORY_PATH",
            book_history,
        ):
            jobs = client.get("/api/activity").json()["jobs"]

        past = [j for j in jobs if j["label"] == "Barbarian Days A Surfing Life"]
        assert past, "past book deliveries must appear in the feed"
        assert past[0]["kind"] == "book"
        assert past[0]["status"] == "done"

    def test_a_failed_past_delivery_keeps_its_error(self, client, tmp_path):
        import json
        crossword_history = tmp_path / "history.json"
        crossword_history.write_text(json.dumps([{
            "puzzle_date": "2026-04-28",
            "fetched_at": "2026-04-27T20:24:50.264393",
            "status": "error",
            "error": "Failed to fetch puzzle: HTTP 401",
            "size_bytes": None,
            "filename": None,
        }]))

        with patch(
            "nyt_crossword_remarkable.api.routes_activity.DEFAULT_HISTORY_PATH",
            crossword_history,
        ):
            jobs = client.get("/api/activity").json()["jobs"]

        failed = [j for j in jobs if j["status"] == "failed"]
        assert failed, "failed past deliveries must appear"
        assert failed[0]["kind"] == "crossword"
        assert failed[0]["error"] == "Failed to fetch puzzle: HTTP 401"
```

- [ ] **Step 7: Run test to verify it fails**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/test_api.py::TestActivityRoutes -v`
Expected: FAIL with `AttributeError: module ... has no attribute 'DEFAULT_BOOK_HISTORY_PATH'`

- [ ] **Step 8: Implement the merge**

Rewrite `routes_activity.py`'s `activity` handler. Past records become
read-only pseudo-jobs — they have no live phase or log, and their ids are
prefixed so they can never collide with a real queue job or be retried.

```python
"""Activity endpoints — what is running, queued, and already delivered."""

from fastapi import APIRouter, HTTPException

from nyt_crossword_remarkable.api.deps import job_queue
from nyt_crossword_remarkable.config import (
    DEFAULT_BOOK_HISTORY_PATH,
    DEFAULT_HISTORY_PATH,
)
from nyt_crossword_remarkable.services.book_history import BookHistory
from nyt_crossword_remarkable.services.history import History

router = APIRouter(prefix="/api/activity", tags=["activity"])


def _past_jobs() -> list[dict]:
    """Deliveries from before this process started, as read-only rows."""
    rows: list[dict] = []

    try:
        for r in BookHistory(path=DEFAULT_BOOK_HISTORY_PATH).recent(limit=50):
            rows.append({
                "id": f"past-book-{r.sent_at.isoformat()}",
                "kind": "book",
                "label": r.title,
                "status": "done" if r.status == "success" else "failed",
                "phase": "done",
                "progress": 100,
                "log": [],
                "error": r.error,
                "created_at": r.sent_at.isoformat(),
                "finished_at": r.sent_at.isoformat(),
            })
    except Exception:
        pass

    try:
        for r in History(path=DEFAULT_HISTORY_PATH).recent(limit=50):
            rows.append({
                "id": f"past-crossword-{r.fetched_at.isoformat()}",
                "kind": "crossword",
                "label": r.puzzle_date.isoformat(),
                "status": "done" if r.status == "success" else "failed",
                "phase": "done",
                "progress": 100,
                "log": [],
                "error": r.error,
                "created_at": r.fetched_at.isoformat(),
                "finished_at": r.fetched_at.isoformat(),
            })
    except Exception:
        pass

    return rows


@router.get("")
async def activity():
    """Running and queued jobs first, then finished work newest-first —
    this run's jobs and everything already on disk."""
    live = [j.to_dict() for j in job_queue.jobs() if j.status in ("queued", "running")]
    done = [j.to_dict() for j in job_queue.jobs() if j.status in ("done", "failed")]
    done.extend(_past_jobs())
    done.sort(key=lambda j: j["finished_at"] or j["created_at"], reverse=True)
    return {"jobs": live + done[:50]}


@router.post("/{job_id}/retry")
async def retry(job_id: str):
    job = job_queue.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job")
    runner = job_queue.runner_for(job_id)
    if runner is None:
        raise HTTPException(status_code=409, detail="This job cannot be retried")
    new_job = job_queue.enqueue(job.kind, job.label, runner)
    return {"status": "started", "job_id": new_job.id}
```

Note the two `except Exception: pass` blocks are deliberate and narrow: a
malformed or missing history file must not take down the Activity page, which is
the one screen the user checks when something has gone wrong.

- [ ] **Step 9: Run tests and commit**

Run: `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib .venv/bin/python -m pytest tests/ -v`
Expected: PASS, aside from the 3 known stale failures

```bash
git add tests/test_api.py src/nyt_crossword_remarkable/api/routes_activity.py
git commit -m "feat: merge on-disk delivery history into the activity feed"
```

---

### Task 6: Frontend types and API client

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts:59-67`

**Interfaces:**
- Produces: `ActivityJob` interface; `api.activity.list()` and `api.activity.retry(id)`.

- [ ] **Step 1: Add the type**

```typescript
// frontend/src/types.ts
export interface ActivityJob {
  id: string;
  kind: 'book' | 'crossword';
  label: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  phase: string;
  progress: number;
  log: { ts: string; msg: string; kind?: string }[];
  error?: string | null;
  created_at: string;
  finished_at?: string | null;
}
```

- [ ] **Step 2: Add the client methods**

```typescript
// frontend/src/api.ts — inside the `api` object, alongside `library`
  activity: {
    list: () => get<{ jobs: ActivityJob[] }>('/activity'),
    retry: (id: string) =>
      post<{ status: string; job_id: string }>(`/activity/${id}/retry`, {}),
  },
```

Add `ActivityJob` to the existing type import at the top of `api.ts`.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: add ActivityJob type and activity API client"
```

---

### Task 7: The Activity page component

**Files:**
- Create: `frontend/src/activity/Activity.tsx`
- Create: `frontend/src/activity/Activity.css`

**Interfaces:**
- Consumes: `ActivityJob`, `api.activity` from Task 6.
- Produces: `export default function Activity({ addToast }: { addToast: (msg: string) => void })`.

**Behaviour:** Polls `api.activity.list()` every 500 ms while any job is `queued` or `running`; falls back to a 5 s poll when everything is idle so history stays fresh. Groups into NOW (running), QUEUED, and DONE. Failed jobs show `error` text and a Retry button.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from 'react';
import type { ActivityJob } from '../types';
import { api } from '../api';
import './Activity.css';

const PHASES = [
  { key: 'download', num: '01', name: 'Download' },
  { key: 'prepare', num: '02', name: 'Prepare' },
  { key: 'upload', num: '03', name: 'Upload' },
];

export default function Activity({ addToast }: { addToast: (msg: string) => void }) {
  const [jobs, setJobs] = useState<ActivityJob[]>([]);

  const busy = jobs.some(j => j.status === 'queued' || j.status === 'running');

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      api.activity.list()
        .then(r => { if (!cancelled) setJobs(r.jobs); })
        .catch(() => {});
    };
    tick();
    const interval = setInterval(tick, busy ? 500 : 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [busy]);

  const running = jobs.filter(j => j.status === 'running');
  const queued = jobs.filter(j => j.status === 'queued');
  const finished = jobs.filter(j => j.status === 'done' || j.status === 'failed')
                       .slice().reverse();

  const onRetry = async (job: ActivityJob) => {
    try {
      await api.activity.retry(job.id);
      addToast(`Retrying ${job.label}…`);
    } catch {
      addToast(`Can't retry ${job.label}`);
    }
  };

  return (
    <section className="section activity-section">
      <div className="section-head">
        <h2>Activity</h2>
        <div className="kicker">Everything sent to your tablet</div>
      </div>

      {running.length === 0 && queued.length === 0 && (
        <p className="activity-idle">Nothing running. Send a book from the Library.</p>
      )}

      {running.map(job => (
        <div key={job.id} className="activity-now">
          <div className="activity-row-head">
            <span className="activity-label">{job.label}</span>
            <span className={`activity-tag ${job.kind}`}>{job.kind}</span>
          </div>
          <div className="activity-phases">
            {PHASES.map(p => {
              const idx = PHASES.findIndex(x => x.key === job.phase);
              const thisIdx = PHASES.findIndex(x => x.key === p.key);
              const done = idx > thisIdx;
              const active = job.phase === p.key;
              return (
                <div key={p.key} className="activity-phase">
                  <span className="num">{p.num}</span>
                  <div className="name">{p.name}</div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill"
                         style={{ width: done ? '100%' : active ? `${job.progress}%` : '0%' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="activity-log">
            {job.log.map((l, i) => (
              <div key={i} className={l.kind || ''}>{l.ts} &middot; {l.msg}</div>
            ))}
          </div>
        </div>
      ))}

      {queued.length > 0 && (
        <div className="activity-queued">
          <div className="activity-group-title">Queued &middot; {queued.length}</div>
          <ul>
            {queued.map((job, i) => (
              <li key={job.id}>
                <span className="activity-queue-num">{i + 1}</span>
                <span className="activity-label">{job.label}</span>
                <span className={`activity-tag ${job.kind}`}>{job.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {finished.length > 0 && (
        <div className="activity-history">
          <div className="activity-group-title">Done</div>
          <ul>
            {finished.map(job => (
              <li key={job.id} className={job.status}>
                <span className="activity-mark">{job.status === 'done' ? '✓' : '✗'}</span>
                <div className="activity-history-meta">
                  <span className="activity-label">{job.label}</span>
                  {job.status === 'failed' && job.error && (
                    <div className="activity-error">{job.error}</div>
                  )}
                </div>
                <span className={`activity-tag ${job.kind}`}>{job.kind}</span>
                {job.status === 'failed' && (
                  <button className="btn sm" onClick={() => onRetry(job)}>Retry</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/activity/Activity.css`. `.progress-bar` and
`.progress-bar-fill` are already defined globally by `ProgressStrip.css` and are
reused as-is — do not redefine them. Every colour comes from `tokens.css`; do
not introduce hard-coded values.

```css
.activity-section { padding-bottom: 32px; }

.activity-idle {
  font-family: var(--serif); font-style: italic;
  color: var(--ink-3); padding: 24px 0;
}

.activity-group-title {
  font-family: var(--mono); font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--ink-3);
  margin: 24px 0 8px; padding-bottom: 4px;
  border-bottom: 1px solid var(--rule);
}

.activity-now { border: 1px solid var(--rule); padding: 16px; margin-top: 16px; }

.activity-row-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}

.activity-label { font-family: var(--serif); font-size: 15px; font-weight: 500; }

.activity-tag {
  font-family: var(--mono); font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 2px 6px; border: 1px solid var(--rule);
  color: var(--ink-3);
}
.activity-tag.book { border-color: var(--rule-strong); }

.activity-phases { display: flex; gap: 16px; margin-bottom: 12px; }
.activity-phase { flex: 1; }
.activity-phase .num {
  font-family: var(--mono); font-size: 11px; color: var(--ink-3);
}
.activity-phase .name {
  font-family: var(--serif); font-size: 14px; font-weight: 500;
}

.activity-log {
  font-family: var(--mono); font-size: 11px; color: var(--ink-2);
  max-height: 120px; overflow-y: auto; line-height: 1.6;
}
.activity-log .ok { color: var(--ok); }
.activity-log .err { color: var(--err); }

.activity-queued ul, .activity-history ul { list-style: none; margin: 0; padding: 0; }

.activity-queued li, .activity-history li {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--rule-2);
}

.activity-queue-num {
  font-family: var(--mono); font-size: 11px; color: var(--ink-4);
  min-width: 20px;
}

.activity-mark { font-family: var(--mono); font-size: 13px; min-width: 16px; }
.activity-history li.done .activity-mark { color: var(--ok); }
.activity-history li.failed .activity-mark { color: var(--err); }

.activity-history-meta { flex: 1; min-width: 0; }

.activity-error {
  font-family: var(--mono); font-size: 11px; color: var(--err);
  margin-top: 2px; word-break: break-word;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/activity/
git commit -m "feat: add the Activity page component"
```

---

### Task 8: Navigation, wiring, and the rebuilt bundle

**Files:**
- Modify: `frontend/src/App.tsx:10-50`
- Modify: `frontend/src/library/Library.tsx` (drop local phase gating)
- Modify: `src/nyt_crossword_remarkable/frontend/dist/` (rebuilt bundle)
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: `Activity` from Task 7.

**Context:** There is no router. `App` renders `Masthead` then `Dashboard`, and `Dashboard` renders `Library` inline. Add a `view` state in `App` and a two-item nav.

- [ ] **Step 1: Add the view toggle to App.tsx**

```tsx
const [view, setView] = useState<'dashboard' | 'activity'>('dashboard');
```

Render a nav under `<Masthead />`, then switch:

```tsx
      <nav className="app-nav">
        <button className={view === 'dashboard' ? 'active' : ''}
                onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={view === 'activity' ? 'active' : ''}
                onClick={() => setView('activity')}>Activity</button>
      </nav>
      {view === 'dashboard' ? (
        <Dashboard {...existingProps} />
      ) : (
        <Activity addToast={addToast} />
      )}
```

Import `Activity` from `./activity/Activity`. Add minimal `.app-nav` styling to `frontend/src/global.css` using the existing tokens.

- [ ] **Step 2: Stop the Library gating sends on phase**

In `frontend/src/library/Library.tsx`, the `busy` constant added earlier disabled Send while a job ran. The queue now accepts every press, so change it to always allow sending:

```tsx
  // The queue serialises sends now, so every press is accepted.
  const busy = false;
```

Leave the rest of the component alone. After a successful send, point the user at the new page:

```tsx
      await api.library.send(book);
      addToast(`Queued "${book.title}" — see Activity`);
```

- [ ] **Step 3: Build the frontend**

```bash
cd frontend && npm run build
```

Expected: `tsc` passes and Vite emits a new `index-*.js` into `src/nyt_crossword_remarkable/frontend/dist/assets/`.

- [ ] **Step 4: Restart and verify by hand**

```bash
launchctl kickstart -k gui/$(id -u)/com.nyt-crossword-remarkable
sleep 6
curl -s --max-time 20 http://100.104.214.92:8742/api/health
curl -s --max-time 20 http://100.104.214.92:8742/api/activity
```

Expected: health `{"status":"ok"}` and activity returns a `jobs` array.

Then queue several sends at once and confirm they run one at a time rather than colliding:

```bash
for i in 1 2 3; do
  curl -s --max-time 20 -X POST http://100.104.214.92:8742/api/library/send \
    -H 'Content-Type: application/json' \
    -d '{"book":{"id":"5682489","title":"Cats Cradle","author":"Vonnegut, Kurt","format":"epub","size":"1.9 MB","md5":"51c5904091d02f4056026ca15981bcf0","mirror_url":"https://libgen.li/ads.php?md5=51c5904091d02f4056026ca15981bcf0","sources":1}}'
  echo
done
curl -s --max-time 20 http://100.104.214.92:8742/api/activity
```

Expected: three distinct `job_id` values, none rejected, and at most one job with `"status": "running"` at any moment.

- [ ] **Step 5: Update the roadmap and commit**

Add a Shipped row to `ROADMAP.md` describing the Activity page and job queue, and bump `**Updated:**` to the current date. Then:

```bash
git add frontend/src src/nyt_crossword_remarkable/frontend/dist/index.html ROADMAP.md
git add -f src/nyt_crossword_remarkable/frontend/dist/assets/
git commit -m "feat: add the Activity page and route sends through the job queue"
```

Verify the committed bundle matches what `index.html` references — the `dist/` gitignore rule silently drops it otherwise:

```bash
grep -o 'index-[A-Za-z0-9]*\.js' src/nyt_crossword_remarkable/frontend/dist/index.html
git ls-tree -r HEAD --name-only -- src/nyt_crossword_remarkable/frontend/dist/assets | grep '\.js$'
```

Expected: the two commands print the same filename.
