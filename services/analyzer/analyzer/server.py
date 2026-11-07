"""FastAPI app: health/status endpoint, with the job worker running in a background thread."""

from __future__ import annotations

import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Config, load_config
from .melody import pick_device
from .worker import Worker


def create_app(cfg: Config | None = None, *, start_worker: bool = True) -> FastAPI:
    cfg = cfg or load_config()
    state: dict = {"worker": None, "thread": None, "started": time.time()}

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if start_worker:
            worker = Worker(cfg)
            thread = threading.Thread(
                target=worker.run_forever, name="analyzer-worker", daemon=True
            )
            thread.start()
            state.update(worker=worker, thread=thread)
        yield
        if state["worker"]:
            state["worker"].stop()
            state["thread"].join(timeout=5)

    app = FastAPI(title="Chordus analyzer", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict:
        worker: Worker | None = state["worker"]
        thread: threading.Thread | None = state["thread"]
        return {
            "ok": True,
            "worker": bool(thread and thread.is_alive()),
            "currentJob": worker.current_job if worker else None,
            "lastPoll": worker.last_poll if worker else None,
            "device": pick_device(cfg.device),
            "melody": cfg.enable_melody,
            "uptimeSeconds": round(time.time() - state["started"]),
        }

    return app
