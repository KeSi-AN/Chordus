"""Configuration from environment variables (shared repo-root .env with the web app)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def find_repo_root(start: Path | None = None) -> Path:
    """Walk up until a directory containing pnpm-workspace.yaml is found."""
    here = (start or Path(__file__)).resolve()
    for d in [here, *here.parents]:
        if (d / "pnpm-workspace.yaml").exists():
            return d
    return Path.cwd()


def resolve_file_url(url: str, root: Path) -> str:
    """Resolve a relative `file:` URL against the repo root (mirrors apps/web/src/server/env.ts)."""
    if not url.startswith("file:"):
        return url
    p = url[len("file:") :]
    if p == ":memory:" or Path(p).is_absolute():
        return url
    return "file:" + (root / p).resolve().as_posix()


@dataclass(frozen=True)
class Config:
    database_url: str
    data_dir: Path
    poll_interval: float
    host: str
    port: int
    #: "auto" picks CUDA when available.
    device: str
    demucs_model: str
    enable_melody: bool
    enable_lyrics: bool = True
    whisper_model: str = "medium"

    @property
    def sqlite_path(self) -> Path:
        if not self.database_url.startswith("file:"):
            raise RuntimeError(
                "The analyzer currently supports local SQLite (file:) databases only. "
                "Turso support arrives with hosting (Phase 6)."
            )
        return Path(self.database_url[len("file:") :])


def load_config(env: dict[str, str] | None = None) -> Config:
    root = find_repo_root()
    if env is None:
        load_dotenv(root / ".env")
        env = dict(os.environ)
    return Config(
        database_url=resolve_file_url(env.get("DATABASE_URL") or "file:./data/app.db", root),
        data_dir=(root / (env.get("DATA_DIR") or "data")).resolve(),
        poll_interval=float(env.get("ANALYZER_POLL_SECONDS") or 2),
        host=env.get("ANALYZER_HOST") or "127.0.0.1",
        port=int(env.get("ANALYZER_PORT") or 8000),
        device=env.get("ANALYZER_DEVICE") or "auto",
        demucs_model=env.get("DEMUCS_MODEL") or "htdemucs",
        enable_melody=(env.get("ANALYZER_MELODY") or "1") not in ("0", "false", "no"),
        enable_lyrics=(env.get("ANALYZER_LYRICS") or "1") not in ("0", "false", "no"),
        whisper_model=env.get("WHISPER_MODEL") or "medium",
    )
