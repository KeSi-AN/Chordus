"""One analysis job: fetch audio → harmony → draft sheet → vocal melody range."""

from __future__ import annotations

import logging
import sqlite3
import tempfile
from collections.abc import Callable
from pathlib import Path

from . import db as dbm
from .analysis import analyze_harmony
from .analysis.chords import ChordDetector
from .audio import load_mono, to_wav
from .config import Config
from .draft import build_draft
from .melody import separate_vocals, track_melody
from .storage import Storage
from .youtube import Extractor, YtDlpExtractor

log = logging.getLogger(__name__)

MIME_BY_EXT = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "webm": "audio/webm",
    "opus": "audio/ogg",
    "ogg": "audio/ogg",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "flac": "audio/flac",
}


class JobError(RuntimeError):
    """A failure the user should see as-is (bad source, unreadable audio, ...)."""


def run_analysis(
    conn: sqlite3.Connection,
    storage: Storage,
    cfg: Config,
    payload: dict,
    *,
    extractor: Extractor | None = None,
    detector: ChordDetector | None = None,
    separate: Callable[..., Path] = separate_vocals,
) -> None:
    analysis_id = payload["analysisId"]
    song_id = payload["songId"]
    source_id = payload["sourceId"]

    def progress(stage: str, frac: float) -> None:
        dbm.update_analysis(
            conn, analysis_id, status="running", stage=stage, progress=round(min(frac, 0.99), 3)
        )

    source = dbm.get_row(conn, "sources", source_id)
    if source is None or dbm.get_row(conn, "songs", song_id) is None:
        raise JobError("The song or its audio source no longer exists")

    with tempfile.TemporaryDirectory(prefix="chordus-") as tmp_dir:
        tmp = Path(tmp_dir)

        # 1. Audio file: already uploaded, or downloaded from YouTube now.
        if source["file_path"]:
            audio_path = storage.path_for(source["file_path"])
            if not audio_path.exists():
                raise JobError("The uploaded audio file is missing from storage")
        elif source["kind"] == "youtube" and source["youtube_video_id"]:
            progress("Downloading from YouTube", 0.02)
            res = (extractor or YtDlpExtractor()).extract(source["youtube_video_id"], tmp / "dl")
            key = f"audio/{song_id}/{source_id}.{res.ext}"
            storage.put_file(key, res.path)
            dbm.set_source_file(
                conn,
                source_id,
                key,
                MIME_BY_EXT.get(res.ext, "application/octet-stream"),
                f"{res.title}.{res.ext}",
            )
            dbm.update_song(conn, song_id, title=res.title, artist=res.artist)
            audio_path = storage.path_for(key)
        else:
            raise JobError("This source has no audio to analyze")

        # 2. Harmony.
        progress("Decoding audio", 0.15)
        wav44 = to_wav(audio_path, tmp / "mix.wav", sr=44100)
        y, sr = load_mono(wav44, sr=22050)
        if len(y) < sr * 5:
            raise JobError("The audio is shorter than 5 seconds")
        harmony = analyze_harmony(y, sr, detector, progress=lambda s, f: progress(s, 0.2 + 0.3 * f))
        timeline = [t.as_json() for t in harmony.bars]
        dbm.update_analysis(
            conn,
            analysis_id,
            key=harmony.key.key,
            key_confidence=harmony.key.confidence,
            bpm=harmony.bpm,
            chord_timeline=timeline,
        )
        dbm.update_song(
            conn,
            song_id,
            key=harmony.key.key,
            bpm=harmony.bpm,
            time_signature=harmony.time_signature,
            duration_sec=harmony.duration,
        )
        song = dbm.get_row(conn, "songs", song_id)
        draft = build_draft(
            harmony.bars,
            title=song["title"] if song else None,
            artist=(song["artist"] or None) if song else None,
            key=harmony.key.key,
            bpm=harmony.bpm,
            time_signature=harmony.time_signature,
        )
        dbm.save_detected_sheet(conn, song_id, draft)

        # 3. Vocal melody range (optional and non-fatal: chords are still useful without it).
        melody_fields: dict = {}
        stage_note = "Done"
        if cfg.enable_melody:
            try:
                progress("Isolating vocals (Demucs)", 0.55)
                vocals = separate(
                    wav44,
                    tmp / "vocals.wav",
                    model=cfg.demucs_model,
                    device=cfg.device,
                    progress=lambda f: progress("Isolating vocals (Demucs)", 0.55 + 0.35 * f),
                )
                stem_key = f"audio/{song_id}/{analysis_id}-vocals.wav"
                storage.put_file(stem_key, vocals)
                progress("Tracking the vocal melody", 0.92)
                rng = track_melody(vocals)
                melody_fields["vocal_stem_path"] = stem_key
                if rng:
                    melody_fields.update(
                        melody_low_midi=rng.low,
                        melody_high_midi=rng.high,
                        melody_p10_midi=rng.p10,
                        melody_p90_midi=rng.p90,
                    )
                else:
                    stage_note = "Done (not enough singing found for a melody range)"
            except Exception as exc:  # noqa: BLE001 - melody is best-effort
                log.exception("Melody analysis failed")
                stage_note = f"Done (melody range failed: {str(exc)[:120]})"

        dbm.update_analysis(
            conn,
            analysis_id,
            status="done",
            stage=stage_note,
            progress=1.0,
            error=None,
            **melody_fields,
        )
