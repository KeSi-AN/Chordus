"""SQLite access for the analyzer: job queue claiming and writing analysis results.

The web app owns the schema (Drizzle migrations in apps/web/drizzle). The analyzer only reads
and writes rows. Timestamps are milliseconds since the epoch, like Drizzle's timestamp_ms.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MAX_ATTEMPTS = 3
#: A running job whose lock is older than this is considered abandoned and is retried.
STALE_LOCK_SECONDS = 30 * 60


def now_ms() -> int:
    return int(time.time() * 1000)


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@dataclass
class Job:
    id: str
    type: str
    payload: dict[str, Any]
    attempts: int


def claim_job(conn: sqlite3.Connection, now: int | None = None) -> Job | None:
    """Atomically take the oldest queued job (or an abandoned running one)."""
    now = now or now_ms()
    stale = now - STALE_LOCK_SECONDS * 1000
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            """
            SELECT id, type, payload, attempts FROM jobs
            WHERE attempts < ? AND (status = 'queued' OR (status = 'running' AND locked_at < ?))
            ORDER BY created_at LIMIT 1
            """,
            (MAX_ATTEMPTS, stale),
        ).fetchone()
        if row is None:
            conn.execute("COMMIT")
            return None
        conn.execute(
            "UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1, "
            "updated_at = ? WHERE id = ?",
            (now, now, row["id"]),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return Job(
        id=row["id"],
        type=row["type"],
        payload=json.loads(row["payload"] or "{}"),
        attempts=row["attempts"] + 1,
    )


def finish_job(conn: sqlite3.Connection, job_id: str, error: str | None = None) -> None:
    status = "failed" if error else "done"
    conn.execute(
        "UPDATE jobs SET status = ?, error = ?, locked_at = NULL, updated_at = ? WHERE id = ?",
        (status, error, now_ms(), job_id),
    )


def requeue_job(conn: sqlite3.Connection, job_id: str, error: str) -> None:
    conn.execute(
        "UPDATE jobs SET status = 'queued', error = ?, locked_at = NULL, updated_at = ? "
        "WHERE id = ?",
        (error, now_ms(), job_id),
    )


_ANALYSIS_COLUMNS = {
    "status",
    "stage",
    "progress",
    "error",
    "key",
    "key_confidence",
    "bpm",
    "chord_timeline",
    "melody_low_midi",
    "melody_high_midi",
    "melody_p10_midi",
    "melody_p90_midi",
    "vocal_stem_path",
}


def update_analysis(conn: sqlite3.Connection, analysis_id: str, **fields: Any) -> None:
    unknown = set(fields) - _ANALYSIS_COLUMNS
    if unknown:
        raise ValueError(f"Unknown analysis columns: {unknown}")
    if "chord_timeline" in fields and not isinstance(fields["chord_timeline"], str | None):
        fields["chord_timeline"] = json.dumps(fields["chord_timeline"])
    cols = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(
        f"UPDATE analyses SET {cols}, updated_at = ? WHERE id = ?",  # noqa: S608 - whitelisted
        (*fields.values(), now_ms(), analysis_id),
    )


def get_row(conn: sqlite3.Connection, table: str, row_id: str) -> sqlite3.Row | None:
    if table not in {"songs", "sources", "analyses"}:
        raise ValueError(table)
    return conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()  # noqa: S608


def set_source_file(
    conn: sqlite3.Connection,
    source_id: str,
    file_path: str,
    mime_type: str,
    original_filename: str | None,
) -> None:
    conn.execute(
        "UPDATE sources SET file_path = ?, mime_type = ?, "
        "original_filename = COALESCE(original_filename, ?) WHERE id = ?",
        (file_path, mime_type, original_filename, source_id),
    )


def update_song(
    conn: sqlite3.Connection,
    song_id: str,
    *,
    key: str | None = None,
    bpm: float | None = None,
    time_signature: str | None = None,
    duration_sec: float | None = None,
    title: str | None = None,
    artist: str | None = None,
) -> None:
    """Fill in analysis results without overwriting what the user typed."""
    song = get_row(conn, "songs", song_id)
    if song is None:
        return
    sets: dict[str, Any] = {}
    if key and not song["original_key"]:
        sets["original_key"] = key
    if bpm and not song["bpm"]:
        sets["bpm"] = round(bpm, 1)
    if duration_sec:
        sets["duration_sec"] = round(duration_sec, 2)
    if time_signature and song["time_signature"] in (None, "4/4") and time_signature != "4/4":
        sets["time_signature"] = time_signature
    # Placeholder titles from the import form are replaced by real metadata.
    if title and (not song["title"] or song["title"].startswith("Untitled")):
        sets["title"] = title
    if artist and not song["artist"]:
        sets["artist"] = artist
    if not sets:
        return
    sets["updated_at"] = now_ms()
    cols = ", ".join(f"{k} = ?" for k in sets)
    conn.execute(f"UPDATE songs SET {cols} WHERE id = ?", (*sets.values(), song_id))  # noqa: S608


def save_detected_sheet(conn: sqlite3.Connection, song_id: str, chordpro: str) -> str:
    """Store a detected sheet. It becomes primary unless the user already has a sheet."""
    has_user_sheet = conn.execute(
        "SELECT 1 FROM chord_sheets WHERE song_id = ? AND is_primary = 1 AND origin != 'detected'",
        (song_id,),
    ).fetchone()
    sheet_id = str(uuid.uuid4())
    conn.execute("BEGIN IMMEDIATE")
    try:
        if not has_user_sheet:
            conn.execute("UPDATE chord_sheets SET is_primary = 0 WHERE song_id = ?", (song_id,))
        conn.execute(
            "INSERT INTO chord_sheets (id, song_id, chordpro, origin, is_primary, created_at) "
            "VALUES (?, ?, ?, 'detected', ?, ?)",
            (sheet_id, song_id, chordpro, 0 if has_user_sheet else 1, now_ms()),
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return sheet_id
