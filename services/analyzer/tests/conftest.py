from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest

from analyzer.config import find_repo_root
from analyzer.db import connect, now_ms

MIGRATIONS = find_repo_root() / "apps" / "web" / "drizzle"


def apply_migrations(conn: sqlite3.Connection) -> None:
    """Apply the web app's Drizzle migrations so tests run against the real schema."""
    journal = json.loads((MIGRATIONS / "meta" / "_journal.json").read_text())
    for entry in journal["entries"]:
        sql = (MIGRATIONS / f"{entry['tag']}.sql").read_text(encoding="utf-8")
        for stmt in sql.split("--> statement-breakpoint"):
            if stmt.strip():
                conn.execute(stmt)


@pytest.fixture
def db(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    conn = connect(tmp_path / "test.db")
    apply_migrations(conn)
    conn.execute("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Me', ?)", (now_ms(),))
    yield conn
    conn.close()


def make_song(
    conn: sqlite3.Connection,
    *,
    title: str = "Untitled (YouTube)",
    kind: str = "youtube",
    youtube_id: str | None = "dQw4w9WgXcQ",
) -> dict[str, str]:
    """Insert song + source + queued analysis + job, the way the web app's import API does."""
    ids = {k: str(uuid.uuid4()) for k in ("song", "source", "analysis", "job")}
    t = now_ms()
    conn.execute(
        "INSERT INTO songs (id, user_id, title, artist, time_signature, vocalist_hint, created_at, "
        "updated_at) VALUES (?, 'u1', ?, '', '4/4', 'unknown', ?, ?)",
        (ids["song"], title, t, t),
    )
    conn.execute(
        "INSERT INTO sources (id, song_id, kind, youtube_video_id, created_at) VALUES (?,?,?,?,?)",
        (ids["source"], ids["song"], kind, youtube_id, t),
    )
    conn.execute(
        "INSERT INTO analyses (id, song_id, source_id, status, progress, created_at, updated_at) "
        "VALUES (?, ?, ?, 'queued', 0, ?, ?)",
        (ids["analysis"], ids["song"], ids["source"], t, t),
    )
    payload = json.dumps(
        {"analysisId": ids["analysis"], "songId": ids["song"], "sourceId": ids["source"]}
    )
    conn.execute(
        "INSERT INTO jobs (id, type, payload, status, attempts, created_at, updated_at) "
        "VALUES (?, 'analyze', ?, 'queued', 0, ?, ?)",
        (ids["job"], payload, t, t),
    )
    return ids
