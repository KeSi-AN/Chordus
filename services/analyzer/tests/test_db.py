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


def test_exhausted_stale_job_is_failed_with_its_analysis(db):
    ids = make_song(db)
    t = 1_000_000_000_000
    step = (dbm.STALE_LOCK_SECONDS + 1) * 1000
    for attempt in range(dbm.MAX_ATTEMPTS):
        assert dbm.claim_job(db, now=t + attempt * step) is not None
    dbm.update_analysis(db, ids["analysis"], status="running", stage="Transcribing lyrics")
    # The analyzer died on the last attempt too: the job must not stay "running" forever.
    assert dbm.claim_job(db, now=t + dbm.MAX_ATTEMPTS * step) is None
    job = db.execute("SELECT status, error, locked_at FROM jobs WHERE id = ?", (ids["job"],))
    job = job.fetchone()
    assert job["status"] == "failed" and job["locked_at"] is None
    analysis = dbm.get_row(db, "analyses", ids["analysis"])
    assert analysis["status"] == "failed" and "stopped" in analysis["error"]


def test_touch_job_keeps_a_long_job_locked(db):
    ids = make_song(db)
    t = 1_000_000_000_000
    assert dbm.claim_job(db, now=t) is not None
    almost_stale = t + (dbm.STALE_LOCK_SECONDS - 1) * 1000
    dbm.touch_job(db, ids["job"], now=almost_stale)
    # Well past the original lock, but the heartbeat refreshed it.
    assert dbm.claim_job(db, now=t + (dbm.STALE_LOCK_SECONDS + 30) * 1000) is None
    dbm.finish_job(db, ids["job"])
    dbm.touch_job(db, ids["job"])
    row = db.execute("SELECT status, locked_at FROM jobs WHERE id = ?", (ids["job"],)).fetchone()
    assert (row["status"], row["locked_at"]) == ("done", None)


def _finished_analysis(db, song_id: str, key: str, bpm: float, time_signature: str) -> str:
    analysis_id = f"a-{key}-{bpm}"
    db.execute(
        "INSERT INTO analyses (id, song_id, status, progress, key, bpm, created_at, updated_at) "
        "VALUES (?, ?, 'done', 1, ?, ?, 0, 0)",
        (analysis_id, song_id, key, bpm),
    )
    dbm.save_detected_sheet(db, song_id, f"{{key: {key}}}\n{{time: {time_signature}}}\n[{key}]")
    return analysis_id


def test_reanalysis_replaces_detected_values_but_not_the_users(db):
    ids = make_song(db)
    song_id = ids["song"]
    first = dbm.previously_detected(db, song_id, ids["analysis"])
    dbm.update_song(db, song_id, key="C", bpm=152.0, time_signature="4/4", detected=first)
    _finished_analysis(db, song_id, "C", 152.0, "4/4")

    # A second analysis corrects all three, because the first one wrote them.
    again = dbm.previously_detected(db, song_id, "new")
    assert (again.keys, again.bpms, again.time_signatures) == ({"C"}, {152.0}, {"4/4"})
    dbm.update_song(db, song_id, key="G", bpm=76.0, time_signature="3/4", detected=again)
    song = dbm.get_row(db, "songs", song_id)
    assert (song["original_key"], song["bpm"], song["time_signature"]) == ("G", 76.0, "3/4")
    _finished_analysis(db, song_id, "G", 76.0, "3/4")

    # The user then sets their own values: a third analysis leaves those alone.
    db.execute(
        "UPDATE songs SET original_key = 'Em', bpm = 80, time_signature = '6/8' WHERE id = ?",
        (song_id,),
    )
    third = dbm.previously_detected(db, song_id, "newer")
    dbm.update_song(db, song_id, key="D", bpm=100.0, time_signature="4/4", detected=third)
    song = dbm.get_row(db, "songs", song_id)
    assert (song["original_key"], song["bpm"], song["time_signature"]) == ("Em", 80.0, "6/8")


def test_user_reset_to_four_four_survives_reanalysis(db):
    ids = make_song(db)
    _finished_analysis(db, ids["song"], "G", 90.0, "3/4")
    # Detected 3/4 earlier; the song says 4/4, so the user changed it back.
    detected = dbm.previously_detected(db, ids["song"], "new")
    dbm.update_song(db, ids["song"], time_signature="3/4", detected=detected)
    assert dbm.get_row(db, "songs", ids["song"])["time_signature"] == "4/4"
