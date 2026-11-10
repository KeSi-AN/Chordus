"""SQLite access for the analyzer: job queue claiming and writing analysis results.

The web app owns the schema (Drizzle migrations in apps/web/drizzle). The analyzer only reads
and writes rows. Timestamps are milliseconds since the epoch, like Drizzle's timestamp_ms.
"""

from __future__ import annotations

import json
import re
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MAX_ATTEMPTS = 3
#: The worker refreshes a running job's lock this often (see worker.Heartbeat).
HEARTBEAT_SECONDS = 20
#: A running job whose lock is older than this is considered abandoned (the analyzer was
#: stopped or crashed mid-job) and is retried. Kept short because the lock is refreshed.
STALE_LOCK_SECONDS = 2 * 60


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


def fail_exhausted_jobs(conn: sqlite3.Connection, now: int | None = None) -> int:
    """Give up on abandoned jobs that have used all their attempts.

    Without this they would stay `running` forever: never claimed again, with the song page
    showing a spinner and refusing to start another analysis.
    """
    now = now or now_ms()
    stale = now - STALE_LOCK_SECONDS * 1000
    rows = conn.execute(
        "SELECT id, payload FROM jobs WHERE status = 'running' AND locked_at < ? AND attempts >= ?",
        (stale, MAX_ATTEMPTS),
    ).fetchall()
    message = f"The analyzer stopped while working on this {MAX_ATTEMPTS} times. Try again."
    for row in rows:
        conn.execute(
            "UPDATE jobs SET status = 'failed', error = ?, locked_at = NULL, updated_at = ? "
            "WHERE id = ? AND status = 'running'",
            (message, now, row["id"]),
        )
        analysis_id = json.loads(row["payload"] or "{}").get("analysisId")
        if analysis_id:
            conn.execute(
                "UPDATE analyses SET status = 'failed', stage = 'Failed', error = ?, "
                "updated_at = ? WHERE id = ? AND status IN ('queued', 'running')",
                (message, now, analysis_id),
            )
    return len(rows)


def touch_job(conn: sqlite3.Connection, job_id: str, now: int | None = None) -> None:
    """Refresh a running job's lock so it is not mistaken for an abandoned one."""
    conn.execute(
        "UPDATE jobs SET locked_at = ? WHERE id = ? AND status = 'running'",
        (now or now_ms(), job_id),
    )


def claim_job(conn: sqlite3.Connection, now: int | None = None) -> Job | None:
    """Atomically take the oldest queued job (or an abandoned running one)."""
    now = now or now_ms()
    stale = now - STALE_LOCK_SECONDS * 1000
    conn.execute("BEGIN IMMEDIATE")
    try:
        fail_exhausted_jobs(conn, now)
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


_TIME_DIRECTIVE = re.compile(r"^\{time:\s*([^}]+?)\s*\}", re.MULTILINE)


@dataclass
class Detected:
    """Values earlier analyses of a song detected (so a re-analysis may replace them)."""

    keys: set[str] = field(default_factory=set)
    bpms: set[float] = field(default_factory=set)
    time_signatures: set[str] = field(default_factory=set)


def previously_detected(conn: sqlite3.Connection, song_id: str, analysis_id: str) -> Detected:
    """What other analyses of this song wrote. Call before saving the new draft sheet."""
    out = Detected()
    for row in conn.execute(
        "SELECT key, bpm FROM analyses WHERE song_id = ? AND id != ?", (song_id, analysis_id)
    ):
        if row["key"]:
            out.keys.add(row["key"])
        if row["bpm"]:
            out.bpms.add(round(row["bpm"], 1))
    for row in conn.execute(
        "SELECT chordpro FROM chord_sheets WHERE song_id = ? AND origin = 'detected'", (song_id,)
    ):
        m = _TIME_DIRECTIVE.search(row["chordpro"])
        if m:
            out.time_signatures.add(m.group(1))
    return out


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
    detected: Detected | None = None,
) -> None:
    """Fill in analysis results without overwriting what the user typed.

    A value is replaced when it is blank, or when it is what an earlier analysis detected
    (`detected`): otherwise re-analyzing a song could never correct its key, tempo or meter.
    """
    song = get_row(conn, "songs", song_id)
    if song is None:
        return
    detected = detected or Detected()
    sets: dict[str, Any] = {}
    if key and (not song["original_key"] or song["original_key"] in detected.keys):
        sets["original_key"] = key
    if bpm and (not song["bpm"] or round(song["bpm"], 1) in detected.bpms):
        sets["bpm"] = round(bpm, 1)
    if duration_sec:
        sets["duration_sec"] = round(duration_sec, 2)
    if time_signature:
        current = song["time_signature"]
        untouched_default = current in (None, "4/4") and not detected.time_signatures
        if untouched_default or current in detected.time_signatures:
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


def superseded_vocal_stems(
    conn: sqlite3.Connection, song_id: str, keep_analysis_id: str
) -> list[str]:
    """Forget the vocal stems of a song's older analyses and return their storage keys.

    Each stem is ~10 MB per minute of audio and only the newest one is of any use.
    """
    rows = conn.execute(
        "SELECT id, vocal_stem_path FROM analyses "
        "WHERE song_id = ? AND id != ? AND vocal_stem_path IS NOT NULL",
        (song_id, keep_analysis_id),
    ).fetchall()
    for row in rows:
        conn.execute("UPDATE analyses SET vocal_stem_path = NULL WHERE id = ?", (row["id"],))
    return [row["vocal_stem_path"] for row in rows]
