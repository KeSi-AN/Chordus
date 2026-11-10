from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from analyzer import db as dbm
from analyzer.audio import write_wav
from analyzer.config import Config
from analyzer.lyrics import LyricLine, Transcript, Word
from analyzer.melody import StemPaths
from analyzer.server import create_app
from analyzer.synth import render_song
from analyzer.worker import Worker
from analyzer.youtube import ExtractResult

from .conftest import make_song


@pytest.fixture(scope="module")
def song_wav(tmp_path_factory) -> Path:
    s = render_song([(c, 4) for c in ["G", "D", "Em", "C"] * 3], bpm=100, key="G", seed=2)
    return write_wav(tmp_path_factory.mktemp("audio") / "song.wav", s.audio, s.sr)


class FakeExtractor:
    def __init__(self, wav: Path) -> None:
        self.wav = wav

    def extract(self, video_id: str, out_dir: Path) -> ExtractResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        dst = out_dir / f"{video_id}.wav"
        dst.write_bytes(self.wav.read_bytes())
        return ExtractResult(dst, "Real Song", "Real Artist", 30.0, "wav")


def fake_separate(wav: Path, out: Path, **kwargs) -> StemPaths:
    """Stand-in for Demucs: a steady 'voice' between A3 and E4, plus the song as other/bass."""
    sr = 16000
    t = np.arange(sr * 12) / sr
    f = np.where(t < 6, 220.0, 329.63)
    y = 0.3 * np.sin(2 * np.pi * np.cumsum(f) / sr)
    kwargs.get("progress", lambda _f: None)(1.0)
    vocals = write_wav(out / "vocals.wav", y.astype(np.float32), sr)
    return StemPaths(vocals=vocals, drums=wav, bass=wav, other=wav)


def fake_transcribe(_vocals: Path, **_kwargs) -> Transcript:
    words = [Word(5 + i * 2.4, 5 + i * 2.4 + 2, f"word{i}") for i in range(6)]
    return Transcript("en", [LyricLine(words[:3]), LyricLine(words[3:])])


def cfg_for(tmp_path: Path, melody: bool) -> Config:
    return Config(
        database_url=f"file:{(tmp_path / 'test.db').as_posix()}",
        data_dir=tmp_path / "data",
        poll_interval=0.01,
        host="127.0.0.1",
        port=0,
        device="cpu",
        demucs_model="htdemucs",
        enable_melody=melody,
    )


def test_youtube_job_end_to_end(db, tmp_path, song_wav):
    ids = make_song(db)
    worker = Worker(
        cfg_for(tmp_path, melody=True),
        extractor=FakeExtractor(song_wav),
        separate=fake_separate,
        transcriber=fake_transcribe,
    )
    assert worker.run_once() is True
    assert worker.run_once() is False

    job = db.execute("SELECT status, error FROM jobs WHERE id = ?", (ids["job"],)).fetchone()
    assert (job["status"], job["error"]) == ("done", None)

    a = dbm.get_row(db, "analyses", ids["analysis"])
    assert a["status"] == "done" and a["progress"] == 1.0
    assert a["key"] in ("G", "Em")
    timeline = json.loads(a["chord_timeline"])
    assert {t["chord"] for t in timeline} >= {"G", "D", "C"}
    assert round(a["melody_p10_midi"]) == 57 and round(a["melody_p90_midi"]) == 64
    assert a["vocal_stem_path"].endswith("-vocals.wav")

    src = dbm.get_row(db, "sources", ids["source"])
    assert src["file_path"] == f"audio/{ids['song']}/{ids['source']}.wav"
    assert (tmp_path / "data" / src["file_path"]).exists()
    assert src["mime_type"] == "audio/wav"

    song = dbm.get_row(db, "songs", ids["song"])
    assert (song["title"], song["artist"], song["original_key"]) == (
        "Real Song",
        "Real Artist",
        a["key"],
    )
    assert abs(song["bpm"] - 100) < 4

    sheet = db.execute(
        "SELECT chordpro, origin, is_primary FROM chord_sheets "
        "WHERE song_id = ? AND is_primary = 1",
        (ids["song"],),
    ).fetchone()
    assert sheet["origin"] == "detected" and sheet["is_primary"] == 1
    assert "{title: Real Song}" in sheet["chordpro"]
    assert "word0" in sheet["chordpro"] and "word5" in sheet["chordpro"]
    tokens = sheet["chordpro"].count("[")
    assert tokens == len(timeline)


def test_melody_failure_is_not_fatal(db, tmp_path, song_wav):
    ids = make_song(db)

    def broken(*_a, **_k):
        raise RuntimeError("out of memory")

    Worker(
        cfg_for(tmp_path, melody=True), extractor=FakeExtractor(song_wav), separate=broken
    ).run_once()
    a = dbm.get_row(db, "analyses", ids["analysis"])
    assert a["status"] == "done"
    assert "stem separation failed" in a["stage"]
    assert a["melody_p10_midi"] is None
    assert json.loads(a["chord_timeline"])  # chords still came from the mix


def test_lyrics_failure_keeps_the_chord_draft(db, tmp_path, song_wav):
    ids = make_song(db)

    def broken(*_a, **_k):
        raise RuntimeError("whisper exploded")

    Worker(
        cfg_for(tmp_path, melody=True),
        extractor=FakeExtractor(song_wav),
        separate=fake_separate,
        transcriber=broken,
    ).run_once()
    a = dbm.get_row(db, "analyses", ids["analysis"])
    assert a["status"] == "done" and "lyrics failed" in a["stage"]
    sheet = db.execute(
        "SELECT chordpro FROM chord_sheets WHERE song_id = ? AND is_primary = 1", (ids["song"],)
    ).fetchone()
    assert sheet["chordpro"].count("[") == len(json.loads(a["chord_timeline"]))


def test_failed_job_records_error(db, tmp_path):
    ids = make_song(db, kind="file", youtube_id=None)
    Worker(cfg_for(tmp_path, melody=False)).run_once()
    a = dbm.get_row(db, "analyses", ids["analysis"])
    job = db.execute("SELECT status, error FROM jobs WHERE id = ?", (ids["job"],)).fetchone()
    assert a["status"] == "failed" and "no audio" in a["error"]
    assert job["status"] == "failed"


def test_health_endpoint(tmp_path):
    client = TestClient(create_app(cfg_for(tmp_path, melody=False), start_worker=False))
    body = client.get("/health").json()
    assert body["ok"] is True and body["worker"] is False and body["device"] == "cpu"


def test_heartbeat_refreshes_the_job_lock(db, tmp_path):
    import time

    from analyzer.worker import Heartbeat

    ids = make_song(db)
    long_ago = 1_000_000_000_000
    assert dbm.claim_job(db, now=long_ago) is not None
    with Heartbeat(tmp_path / "test.db", ids["job"], interval=0.05):
        time.sleep(0.5)
    locked_at = db.execute("SELECT locked_at FROM jobs WHERE id = ?", (ids["job"],)).fetchone()[0]
    assert locked_at > long_ago
    assert dbm.claim_job(db) is None  # a live job is not handed to a second worker


def test_reanalysis_updates_the_song_and_drops_the_old_stem(db, tmp_path, song_wav):
    ids = make_song(db)
    cfg = cfg_for(tmp_path, melody=True)
    kwargs = dict(
        extractor=FakeExtractor(song_wav), separate=fake_separate, transcriber=fake_transcribe
    )
    Worker(cfg, **kwargs).run_once()
    first = dbm.get_row(db, "analyses", ids["analysis"])
    first_stem = tmp_path / "data" / first["vocal_stem_path"]
    assert first_stem.exists()
    # Pretend the first run got the tempo and key wrong (as an older detector version did).
    db.execute("UPDATE songs SET bpm = 200, original_key = 'F#' WHERE id = ?", (ids["song"],))
    db.execute("UPDATE analyses SET bpm = 200, key = 'F#' WHERE id = ?", (ids["analysis"],))

    second = "analysis-2"
    db.execute(
        "INSERT INTO analyses (id, song_id, source_id, status, progress, created_at, updated_at) "
        "VALUES (?, ?, ?, 'queued', 0, 1, 1)",
        (second, ids["song"], ids["source"]),
    )
    payload = json.dumps({"analysisId": second, "songId": ids["song"], "sourceId": ids["source"]})
    db.execute(
        "INSERT INTO jobs (id, type, payload, status, attempts, created_at, updated_at) "
        "VALUES ('job-2', 'analyze', ?, 'queued', 0, 1, 1)",
        (payload,),
    )
    Worker(cfg, **kwargs).run_once()

    song = dbm.get_row(db, "songs", ids["song"])
    again = dbm.get_row(db, "analyses", second)
    assert again["status"] == "done"
    assert song["original_key"] == again["key"] and abs(song["bpm"] - 100) < 4
    assert not first_stem.exists()
    assert dbm.get_row(db, "analyses", ids["analysis"])["vocal_stem_path"] is None
    assert (tmp_path / "data" / again["vocal_stem_path"]).exists()


def test_song_deleted_during_analysis_leaves_no_files(db, tmp_path, song_wav):
    ids = make_song(db)

    class DeletingExtractor(FakeExtractor):
        def extract(self, video_id: str, out_dir: Path) -> ExtractResult:
            db.execute("DELETE FROM songs WHERE id = ?", (ids["song"],))
            return super().extract(video_id, out_dir)

    Worker(cfg_for(tmp_path, melody=False), extractor=DeletingExtractor(song_wav)).run_once()
    job = db.execute("SELECT status FROM jobs WHERE id = ?", (ids["job"],)).fetchone()
    assert job["status"] == "failed"
    assert not (tmp_path / "data" / "audio" / ids["song"]).exists()
