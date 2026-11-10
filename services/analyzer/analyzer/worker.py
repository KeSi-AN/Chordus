"""Polls the DB-backed job table and runs analysis jobs one at a time."""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
import traceback
from pathlib import Path

from . import db as dbm
from .config import Config
from .pipeline import JobError, run_analysis
from .storage import LocalStorage

log = logging.getLogger(__name__)


class Heartbeat:
    """Keeps a running job's lock fresh from a background thread.

    Stages such as stem separation and transcription run for minutes without touching the
    database, so the lock cannot be refreshed from the pipeline itself. With a fresh lock, a job
    whose lock *is* old really was abandoned, and can be retried after two minutes instead of
    the half hour a fixed timeout would need.
    """

    def __init__(self, path: Path, job_id: str, interval: float = dbm.HEARTBEAT_SECONDS) -> None:
        self.path = path
        self.job_id = job_id
        self.interval = interval
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="job-heartbeat", daemon=True)

    def _run(self) -> None:
        # SQLite connections are not shared between threads: this one belongs to the heartbeat.
        conn = dbm.connect(self.path)
        try:
            while not self._stop.wait(self.interval):
                try:
                    dbm.touch_job(conn, self.job_id)
                except sqlite3.Error:
                    log.warning("Could not refresh the lock of job %s", self.job_id, exc_info=True)
        finally:
            conn.close()

    def __enter__(self) -> Heartbeat:
        self._thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._stop.set()
        self._thread.join(timeout=5)


class Worker:
    def __init__(self, cfg: Config, **pipeline_kwargs) -> None:
        self.cfg = cfg
        self.conn = dbm.connect(cfg.sqlite_path)
        self.storage = LocalStorage(cfg.data_dir)
        self.stop_event = threading.Event()
        self.current_job: str | None = None
        self.last_poll: float | None = None
        self.pipeline_kwargs = pipeline_kwargs

    def run_once(self) -> bool:
        """Process at most one job. Returns True if a job was handled."""
        self.last_poll = time.time()
        job = dbm.claim_job(self.conn)
        if job is None:
            return False
        self.current_job = job.id
        analysis_id = job.payload.get("analysisId")
        log.info("Job %s (%s) attempt %d", job.id, job.type, job.attempts)
        try:
            if job.type != "analyze":
                raise JobError(f"Unknown job type {job.type}")
            with Heartbeat(self.cfg.sqlite_path, job.id):
                run_analysis(self.conn, self.storage, self.cfg, job.payload, **self.pipeline_kwargs)
            dbm.finish_job(self.conn, job.id)
        except Exception as exc:  # noqa: BLE001 - every failure is recorded on the job
            message = str(exc) if isinstance(exc, JobError) else f"{type(exc).__name__}: {exc}"
            log.error("Job %s failed: %s\n%s", job.id, message, traceback.format_exc())
            if analysis_id:
                dbm.update_analysis(
                    self.conn, analysis_id, status="failed", stage="Failed", error=message[:500]
                )
            dbm.finish_job(self.conn, job.id, error=message[:500])
        finally:
            self.current_job = None
            self._clean_up_deleted_song(job.payload.get("songId"))
        return True

    def _clean_up_deleted_song(self, song_id: object) -> None:
        """A song deleted while it was being analyzed would otherwise leave its files behind."""
        if not isinstance(song_id, str) or dbm.get_row(self.conn, "songs", song_id) is not None:
            return
        try:
            self.storage.delete_prefix(f"audio/{song_id}")
        except (OSError, ValueError):
            log.warning("Could not remove files of deleted song %s", song_id, exc_info=True)

    def run_forever(self) -> None:
        log.info("Worker polling %s every %.1fs", self.cfg.sqlite_path, self.cfg.poll_interval)
        while not self.stop_event.is_set():
            try:
                handled = self.run_once()
            except Exception:  # noqa: BLE001 - keep the loop alive (e.g. DB briefly locked)
                log.exception("Worker loop error")
                handled = False
            if not handled:
                self.stop_event.wait(self.cfg.poll_interval)

    def stop(self) -> None:
        self.stop_event.set()
