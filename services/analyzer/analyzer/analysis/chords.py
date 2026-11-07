"""Chord recognition behind a small interface so detectors can be compared and swapped.

The default detector (`librosa-hmm`) works natively on Windows:
  harmonic/percussive separation → CQT chroma → beat-synchronous median →
  cosine match against 24 major/minor templates (+ "no chord") with a key-aware prior →
  Viterbi smoothing over beats. Output: one label + confidence per beat.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np

PITCHES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
NO_CHORD = "N"


@dataclass
class BeatChords:
    """Chord label per beat segment: label i spans times[i]..times[i+1] (seconds)."""

    labels: list[str]
    confidences: np.ndarray
    times: np.ndarray


class ChordDetector(Protocol):
    name: str

    def detect(
        self, y: np.ndarray, sr: int, beat_frames: np.ndarray, key: tuple[int, str] | None
    ) -> BeatChords: ...


def chord_vocab() -> list[tuple[str, np.ndarray]]:
    """24 triad templates with slightly weighted root, plus no-chord."""
    out: list[tuple[str, np.ndarray]] = []
    for root in range(12):
        for suffix, ivs in (("", (0, 4, 7)), ("m", (0, 3, 7))):
            t = np.zeros(12)
            for k, iv in enumerate(ivs):
                t[(root + iv) % 12] = 1.2 if k == 0 else 1.0
            out.append((PITCHES[root] + suffix, t / np.linalg.norm(t)))
    out.append((NO_CHORD, np.full(12, 1 / np.sqrt(12))))
    return out


def diatonic_triads(tonic: int, mode: str) -> set[str]:
    major = [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m")]
    minor = [(0, "m"), (3, ""), (5, "m"), (7, "m"), (7, ""), (8, ""), (10, "")]
    return {PITCHES[(tonic + o) % 12] + s for o, s in (major if mode == "major" else minor)}


def beat_sync_chroma(
    y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Harmonic CQT chroma aggregated per beat segment.

    Returns (chroma (12, segments), segment_energy, segment boundary times (segments + 1)).
    """
    import librosa

    y_h = librosa.effects.harmonic(y, margin=3.0)
    bins_per_octave = 36
    cqt = np.abs(
        librosa.cqt(
            y_h,
            sr=sr,
            hop_length=hop_length,
            fmin=librosa.note_to_hz("C2"),
            n_bins=bins_per_octave * 6,
            bins_per_octave=bins_per_octave,
        )
    )
    # Log compression keeps a loud bass root from drowning out the third and fifth.
    cqt = np.log1p(100.0 * cqt / (cqt.max() or 1.0))
    chroma = librosa.feature.chroma_cqt(
        C=cqt, sr=sr, hop_length=hop_length, bins_per_octave=bins_per_octave, n_chroma=12
    )
    rms = librosa.feature.rms(y=y_h, hop_length=hop_length)[0]
    n = chroma.shape[1]
    bounds = np.unique(np.clip(np.concatenate([[0], beat_frames, [n]]), 0, n))
    sync = librosa.util.sync(chroma, bounds, aggregate=np.median)
    energy = librosa.util.sync(rms[np.newaxis, :], bounds, aggregate=np.mean)[0]
    times = librosa.frames_to_time(bounds, sr=sr, hop_length=hop_length)
    times[-1] = len(y) / sr
    return sync, energy, times


class LibrosaHmmDetector:
    name = "librosa-hmm"

    def __init__(
        self, *, sharpness: float = 18.0, p_stay: float = 0.55, key_bonus: float = 0.03
    ) -> None:
        # Defaults are tuned on the synthetic spike set; see spike/REPORT.md.
        self.sharpness = sharpness
        self.p_stay = p_stay
        self.key_bonus = key_bonus

    def detect(
        self, y: np.ndarray, sr: int, beat_frames: np.ndarray, key: tuple[int, str] | None
    ) -> BeatChords:
        chroma, energy, times = beat_sync_chroma(y, sr, beat_frames)
        return self.decode(chroma, energy, times, key)

    def decode(
        self,
        chroma: np.ndarray,
        energy: np.ndarray,
        times: np.ndarray,
        key: tuple[int, str] | None,
    ) -> BeatChords:
        """Template matching + Viterbi on precomputed beat-synchronous chroma."""
        import librosa

        vocab = chord_vocab()
        names = [n for n, _ in vocab]
        T = np.stack([t for _, t in vocab])  # (K, 12)

        norm = np.linalg.norm(chroma, axis=0, keepdims=True)
        c = chroma / np.maximum(norm, 1e-9)
        sim = T @ c  # (K, beats), cosine similarity

        if key is not None:
            dia = diatonic_triads(*key)
            for k, n in enumerate(names):
                if n in dia:
                    sim[k] += self.key_bonus
        # "No chord" competes only when the beat is near silent.
        quiet = energy < 0.08 * (np.percentile(energy, 90) or 1.0)
        sim[-1] = np.where(quiet, sim.max(axis=0) + 0.1, sim.min(axis=0) - 0.1)

        probs = np.exp(self.sharpness * (sim - sim.max(axis=0, keepdims=True)))
        probs /= probs.sum(axis=0, keepdims=True)

        K = len(names)
        trans = librosa.sequence.transition_loop(K, self.p_stay)
        path = librosa.sequence.viterbi(probs, trans)
        labels = [names[i] for i in path]
        conf = probs[path, np.arange(len(path))]
        return BeatChords(labels=labels, confidences=conf, times=times)


def available_detectors() -> dict[str, ChordDetector]:
    detectors: dict[str, ChordDetector] = {"librosa-hmm": LibrosaHmmDetector()}
    try:
        from .chords_essentia import EssentiaDetector

        detectors["essentia"] = EssentiaDetector()
    except ImportError:
        pass
    return detectors
