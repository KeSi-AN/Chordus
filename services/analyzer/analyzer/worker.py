"""Polls the DB-backed job table and runs analysis jobs one at a time."""

from __future__ import annotations

import logging
import threading
import time
import traceback

from . import db as dbm
from .config import Config
from .pipeline import JobError, run_analysis
from .storage import LocalStorage

log = logging.getLogger(__name__)


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
        return True

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
