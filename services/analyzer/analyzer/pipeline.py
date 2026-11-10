"""One analysis job: fetch audio → stems → chords → melody range → timed lyrics → draft sheet."""

from __future__ import annotations

import logging
import sqlite3
import tempfile
from collections.abc import Callable
from pathlib import Path

from . import db as dbm
from .aligned_sheet import build_aligned_sheet
from .analysis import analyze_harmony
from .analysis.chords import ChordDetector
from .analysis.chords_stems import StemChordDetector
from .audio import load_mono, to_wav
from .config import Config
from .draft import build_draft
from .lyrics import Transcript, transcribe
from .melody import StemPaths, separate_stems, track_melody
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
    separate: Callable[..., StemPaths] = separate_stems,
    transcriber: Callable[..., Transcript | None] = transcribe,
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

        # 2. Stems (best-effort: without them chords use the full mix and there are no lyrics).
        progress("Decoding audio", 0.1)
        wav44 = to_wav(audio_path, tmp / "mix.wav", sr=44100)
        y, sr = load_mono(wav44, sr=22050)
        if len(y) < sr * 5:
            raise JobError("The audio is shorter than 5 seconds")
        notes: list[str] = []
        stems = None
        if cfg.enable_melody:
            try:
                progress("Separating vocals and instruments", 0.12)
                stems = separate(
                    wav44,
                    tmp / "stems",
                    model=cfg.demucs_model,
                    device=cfg.device,
                    progress=lambda f: progress(
                        "Separating vocals and instruments", 0.12 + 0.2 * f
                    ),
                )
            except Exception as exc:  # noqa: BLE001 - the mix still gives usable chords
                log.exception("Stem separation failed")
                notes.append(f"stem separation failed: {str(exc)[:100]}")

        # 3. Harmony, from the instrumental stems when we have them.
        harmonic = None
        chord_detector = detector
        if stems is not None:
            other, _ = load_mono(stems.other, sr=sr)
            bass, _ = load_mono(stems.bass, sr=sr)
            n = min(len(other), len(bass))
            other, bass = other[:n], bass[:n]
            harmonic = other + 0.5 * bass
            chord_detector = detector or StemChordDetector(harmonic, bass)
        harmony = analyze_harmony(
            y,
            sr,
            chord_detector,
            progress=lambda s, f: progress(s, 0.32 + 0.18 * f),
            key_audio=harmonic,
        )
        dbm.update_song(
            conn,
            song_id,
            key=harmony.key.key,
            bpm=harmony.bpm,
            time_signature=harmony.time_signature,
            duration_sec=harmony.duration,
            # Values an earlier analysis filled in are replaced; the user's own are kept.
            detected=dbm.previously_detected(conn, song_id, analysis_id),
        )
        song = dbm.get_row(conn, "songs", song_id)
        meta = {
            "title": song["title"] if song else None,
            "artist": (song["artist"] or None) if song else None,
            "key": harmony.key.key,
            "bpm": harmony.bpm,
            "time_signature": harmony.time_signature,
        }
        # A chords-only draft right away; the lyric version replaces it below.
        dbm.update_analysis(
            conn,
            analysis_id,
            key=harmony.key.key,
            key_confidence=harmony.key.confidence,
            bpm=harmony.bpm,
            chord_timeline=[t.as_json() for t in harmony.bars],
        )
        dbm.save_detected_sheet(conn, song_id, build_draft(harmony.bars, **meta))

        # 4. Vocal melody range (best-effort).
        melody_fields: dict = {}
        if stems is not None:
            try:
                progress("Tracking the vocal melody", 0.52)
                stem_key = f"audio/{song_id}/{analysis_id}-vocals.wav"
                storage.put_file(stem_key, stems.vocals)
                melody_fields["vocal_stem_path"] = stem_key
                rng = track_melody(stems.vocals)
                if rng:
                    melody_fields.update(
                        melody_low_midi=rng.low,
                        melody_high_midi=rng.high,
                        melody_p10_midi=rng.p10,
                        melody_p90_midi=rng.p90,
                    )
                else:
                    notes.append("not enough singing found for a melody range")
            except Exception as exc:  # noqa: BLE001
                log.exception("Melody analysis failed")
                notes.append(f"melody range failed: {str(exc)[:100]}")

        # 5. Lyrics, with each chord placed on the word being sung (best-effort).
        if stems is not None and cfg.enable_lyrics:
            try:
                progress("Transcribing lyrics (Whisper)", 0.6)
                transcript = transcriber(
                    stems.vocals, model_name=cfg.whisper_model, device=cfg.device
                )
                if transcript and transcript.lines:
                    aligned = build_aligned_sheet(
                        harmony.spans,
                        transcript.lines,
                        harmony.bars,
                        duration=harmony.duration,
                        **meta,
                    )
                    dbm.save_detected_sheet(conn, song_id, aligned.chordpro)
                    melody_fields["chord_timeline"] = [t.as_json() for t in aligned.timeline]
                else:
                    notes.append("no lyrics could be transcribed")
            except Exception as exc:  # noqa: BLE001 - the chords-only draft is still there
                log.exception("Lyrics transcription failed")
                notes.append(f"lyrics failed: {str(exc)[:100]}")

        stage = f"Done ({'; '.join(notes)})" if notes else "Done"
        dbm.update_analysis(
            conn, analysis_id, status="done", stage=stage, progress=1.0, error=None, **melody_fields
        )
        # Only the newest vocal stem is kept: they are large and nothing reads the old ones.
        for old_stem in dbm.superseded_vocal_stems(conn, song_id, analysis_id):
            try:
                storage.delete(old_stem)
            except (OSError, ValueError):
                log.warning("Could not delete old vocal stem %s", old_stem, exc_info=True)
