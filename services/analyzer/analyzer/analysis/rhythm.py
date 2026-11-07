"""Tempo, beat grid, meter (3 vs 4) and downbeat phase."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Rhythm:
    bpm: float
    beat_times: np.ndarray
    beat_frames: np.ndarray


def track_beats(y: np.ndarray, sr: int, hop_length: int = 512) -> Rhythm:
    import librosa

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length
    )
    beat_frames = np.asarray(beat_frames, dtype=int)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    if len(beat_times) >= 4:
        bpm = 60.0 / float(np.median(np.diff(beat_times)))
    else:
        bpm = float(np.atleast_1d(tempo)[0])
    return Rhythm(bpm=round(bpm, 1), beat_times=beat_times, beat_frames=beat_frames)


def _change_indices(beat_labels: list[str]) -> list[int]:
    return [i for i in range(1, len(beat_labels)) if beat_labels[i] != beat_labels[i - 1]]


def estimate_meter(beat_labels: list[str]) -> int:
    """Pick 3 or 4 beats per bar from where chord changes fall (they cluster on downbeats)."""
    changes = _change_indices(beat_labels)
    if len(changes) < 6:
        return 4

    def concentration(m: int) -> float:
        counts = np.bincount([c % m for c in changes], minlength=m)
        return counts.max() / len(changes) * m  # 1.0 = uniform, m = all on one phase

    c3, c4 = concentration(3), concentration(4)
    # Changes every 2 beats look "3-ish" to neither and "4-ish" to 4, so prefer 4 unless 3 is
    # clearly better.
    return 3 if c3 > c4 * 1.15 and c3 > 2.0 else 4


def downbeat_phase(
    beat_labels: list[str], beats_per_bar: int, accents: np.ndarray | None = None
) -> int:
    """Index of the first downbeat (0..beats_per_bar-1): the phase where most chords change."""
    changes = _change_indices(beat_labels)
    scores = np.zeros(beats_per_bar)
    for c in changes:
        scores[c % beats_per_bar] += 1.0
    if accents is not None and len(accents) == len(beat_labels):
        a = accents / (accents.max() or 1.0)
        for i, v in enumerate(a):
            scores[i % beats_per_bar] += 0.25 * v
    if len(changes) == 0 and accents is None:
        return 0
    return int(np.argmax(scores))
