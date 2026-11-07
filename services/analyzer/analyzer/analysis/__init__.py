"""Harmonic analysis: tempo, beat grid, meter, key and chords for one audio file."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .bars import BarToken, bar_starts, bar_tokens, merge_segments
from .chords import NO_CHORD, BeatChords, ChordDetector, LibrosaHmmDetector, beat_sync_chroma
from .key import KeyResult, detect_key
from .rhythm import downbeat_phase, estimate_meter, track_beats

Progress = Callable[[str, float], None]


@dataclass
class HarmonyResult:
    duration: float
    bpm: float
    beats_per_bar: int
    key: KeyResult
    beat_chords: BeatChords
    bars: list[BarToken]

    @property
    def time_signature(self) -> str:
        return f"{self.beats_per_bar}/4"


def _noop(_stage: str, _p: float) -> None:
    pass


def analyze_harmony(
    y: np.ndarray,
    sr: int,
    detector: ChordDetector | None = None,
    progress: Progress = _noop,
) -> HarmonyResult:
    """Run beats → key → chords → meter/downbeats → bar tokens on mono audio."""
    detector = detector or LibrosaHmmDetector()
    duration = len(y) / sr

    progress("Finding the beat", 0.0)
    rhythm = track_beats(y, sr)
    if len(rhythm.beat_frames) < 4:
        raise ValueError("Could not find a steady beat in this audio")

    progress("Detecting the key", 0.3)
    chroma, energy, _ = beat_sync_chroma(y, sr, rhythm.beat_frames)
    key = detect_key(chroma, weights=energy)

    progress("Detecting chords", 0.5)
    beats = detector.detect(y, sr, rhythm.beat_frames, (key.tonic, key.mode))

    progress("Building the bar grid", 0.9)
    # Beat segment 0 is the lead-in before the first beat; bar logic works on real beats.
    labels_on_beats = (
        beats.labels[1:] if len(beats.labels) > len(rhythm.beat_times) else beats.labels
    )
    meter = estimate_meter(labels_on_beats)
    phase = downbeat_phase(labels_on_beats, meter)
    bounds = bar_starts(rhythm.beat_times, meter, phase, duration)
    spans = merge_segments(beats)
    tokens = bar_tokens(spans, bounds)
    progress("Harmony done", 1.0)
    return HarmonyResult(
        duration=duration,
        bpm=rhythm.bpm,
        beats_per_bar=meter,
        key=key,
        beat_chords=beats,
        bars=tokens,
    )


__all__ = ["NO_CHORD", "HarmonyResult", "analyze_harmony"]
