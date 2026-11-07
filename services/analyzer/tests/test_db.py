from __future__ import annotations

import json
from pathlib import Path

import pytest

from analyzer import db as dbm
from analyzer.config import load_config, resolve_file_url
from analyzer.storage import LocalStorage

from .conftest import make_song


def test_claim_job_is_exclusive_and_ordered(db):
    first = make_song(db)
    second = make_song(db)
    job = dbm.claim_job(db)
    assert job is not None
    assert job.id == first["job"]
    assert job.payload["analysisId"] == first["analysis"]
    assert job.attempts == 1
    assert dbm.claim_job(db).id == second["job"]
    assert dbm.claim_job(db) is None


def test_stale_running_jobs_are_retried_until_max_attempts(db):
    ids = make_song(db)
    t0 = 1_000_000_000_000
    assert dbm.claim_job(db, now=t0).id == ids["job"]
    assert dbm.claim_job(db, now=t0 + 1000) is None  # still locked
    later = t0 + (dbm.STALE_LOCK_SECONDS + 1) * 1000
    assert dbm.claim_job(db, now=later).attempts == 2
    assert dbm.claim_job(db, now=later * 2).attempts == 3
    assert dbm.claim_job(db, now=later * 3) is None  # gave up


def test_finish_and_requeue(db):
    ids = make_song(db)
    job = dbm.claim_job(db)
    dbm.finish_job(db, job.id, error="boom")
    row = db.execute("SELECT status, error FROM jobs WHERE id = ?", (ids["job"],)).fetchone()
    assert (row["status"], row["error"]) == ("failed", "boom")
    dbm.requeue_job(db, job.id, "retry")
    assert dbm.claim_job(db).id == ids["job"]


def test_update_analysis_serializes_timeline_and_rejects_unknown_columns(db):
    ids = make_song(db)
    timeline = [{"start": 0, "end": 2, "chord": "G", "confidence": 0.9}]
    dbm.update_analysis(db, ids["analysis"], status="done", chord_timeline=timeline, bpm=120.0)
    row = dbm.get_row(db, "analyses", ids["analysis"])
    assert row["status"] == "done"
    assert json.loads(row["chord_timeline"]) == timeline
    with pytest.raises(ValueError):
        dbm.update_analysis(db, ids["analysis"], evil="1")


def test_update_song_fills_blanks_only(db):
    ids = make_song(db)
    dbm.update_song(
        db, ids["song"], key="G", bpm=97.04, title="Real Title", artist="Band", duration_sec=200
    )
    song = dbm.get_row(db, "songs", ids["song"])
    assert (song["original_key"], song["bpm"], song["title"], song["artist"]) == (
        "G",
        97.0,
        "Real Title",
        "Band",
    )
    dbm.update_song(db, ids["song"], key="A", title="Other", artist="Other")
    song = dbm.get_row(db, "songs", ids["song"])
    assert (song["original_key"], song["title"], song["artist"]) == ("G", "Real Title", "Band")


def test_detected_sheet_does_not_replace_a_user_sheet(db):
    ids = make_song(db)
    dbm.save_detected_sheet(db, ids["song"], "[G]")
    dbm.save_detected_sheet(db, ids["song"], "[A]")
    primary = db.execute(
        "SELECT chordpro FROM chord_sheets WHERE song_id = ? AND is_primary = 1", (ids["song"],)
    ).fetchall()
    assert [r["chordpro"] for r in primary] == ["[A]"]

    db.execute(
        "INSERT INTO chord_sheets (id, song_id, chordpro, origin, is_primary, created_at) "
        "VALUES ('mine', ?, '[C]', 'pasted', 1, 0)",
        (ids["song"],),
    )
    db.execute("UPDATE chord_sheets SET is_primary = 0 WHERE id != 'mine'")
    dbm.save_detected_sheet(db, ids["song"], "[D]")
    primary = db.execute(
        "SELECT id FROM chord_sheets WHERE song_id = ? AND is_primary = 1", (ids["song"],)
    ).fetchall()
    assert [r["id"] for r in primary] == ["mine"]


def test_config_resolves_relative_paths(tmp_path):
    root = Path("C:/repo") if Path("C:/").exists() else Path("/repo")
    assert resolve_file_url("file:./data/app.db", root).endswith("/repo/data/app.db")
    assert resolve_file_url("libsql://x.turso.io", root) == "libsql://x.turso.io"
    cfg = load_config({"DATABASE_URL": "file:./data/x.db", "ANALYZER_MELODY": "0"})
    assert cfg.sqlite_path.name == "x.db"
    assert cfg.enable_melody is False
    assert cfg.port == 8000


def test_local_storage_rejects_traversal(tmp_path):
    s = LocalStorage(tmp_path)
    src = tmp_path / "x.bin"
    src.write_bytes(b"abc")
    assert s.put_file("audio/a/b.bin", src) == 3
    assert s.exists("audio/a/b.bin")
    for bad in ("../x", "audio/../../x", "C:/x", "/etc/passwd"):
        with pytest.raises(ValueError):
            s.path_for(bad)
