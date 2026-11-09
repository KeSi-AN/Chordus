"""Chord recognition from Demucs stems: the most accurate detector when stems are available.

Vocals and drums are what mislead chroma on real recordings, so this listens only to the
"other" stem (guitars, keys) for chord colour and to the bass stem for the root. The
vocabulary includes sevenths, with a small preference for simpler chords and for chords that
fit the key.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .chords import NO_CHORD, PITCHES, BeatChords

HOP = 512
BINS = 36
QUALITIES: dict[str, tuple[int, ...]] = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
}
_TONE_WEIGHT = (1.0, 0.9, 1.0, 0.7)
MAJOR_SCALE = {0, 2, 4, 5, 7, 9, 11}
MINOR_SCALE = {0, 2, 3, 5, 7, 8, 10}


@dataclass(frozen=True)
class VocabChord:
    name: str
    root: int
    suffix: str
    tones: frozenset[int]
    template: np.ndarray

    @property
    def is_seventh(self) -> bool:
        return len(self.tones) == 4

    @property
    def is_minor(self) -> bool:
        return self.suffix in ("m", "m7")


def vocabulary() -> list[VocabChord]:
    out: list[VocabChord] = []
    for root in range(12):
        for suffix, intervals in QUALITIES.items():
            t = np.zeros(12)
            for weight, iv in zip(_TONE_WEIGHT, intervals, strict=False):
                t[(root + iv) % 12] = weight
            tones = frozenset((root + iv) % 12 for iv in intervals)
            out.append(
                VocabChord(PITCHES[root] + suffix, root, suffix, tones, t / np.linalg.norm(t))
            )
    return out


def fits_key(chord: VocabChord, tonic: int, mode: str) -> bool:
    """All chord tones are in the scale (allowing the major V of a minor key)."""
    relative = {(t - tonic) % 12 for t in chord.tones}
    scale = MAJOR_SCALE if mode == "major" else MINOR_SCALE
    if relative <= scale:
        return True
    is_dominant = (chord.root - tonic) % 12 == 7 and chord.suffix in ("", "7")
    return mode == "minor" and is_dominant and relative <= (scale | {11})


class StemChordDetector:
    name = "stems"

    def __init__(
        self,
        harmonic: np.ndarray,
        bass: np.ndarray,
        *,
        sharpness: float = 25.0,
        p_stay: float = 0.6,
        bass_weight: float = 0.25,
        seventh_penalty: float = 0.07,
        key_bonus: float = 0.05,
    ) -> None:
        self.harmonic = harmonic
        self.bass = bass
        self.sharpness = sharpness
        self.p_stay = p_stay
        self.bass_weight = bass_weight
        self.seventh_penalty = seventh_penalty
        self.key_bonus = key_bonus

    @staticmethod
    def _cqt(y: np.ndarray, sr: int, fmin: str, octaves: int, tuning: float) -> np.ndarray:
        import librosa

        return np.abs(
            librosa.cqt(
                y,
                sr=sr,
                hop_length=HOP,
                fmin=librosa.note_to_hz(fmin),
                n_bins=BINS * octaves,
                bins_per_octave=BINS,
                tuning=tuning,
            )
        )

    def detect(
        self, y: np.ndarray, sr: int, beat_frames: np.ndarray, key: tuple[int, str] | None
    ) -> BeatChords:
        import librosa

        tuning = float(librosa.estimate_tuning(y=self.harmonic, sr=sr))
        cqt = self._cqt(self.harmonic, sr, "C3", 5, tuning)
        cqt = np.log1p(100.0 * cqt / (cqt.max() or 1.0))
        chroma = librosa.feature.chroma_cqt(
            C=cqt, sr=sr, hop_length=HOP, bins_per_octave=BINS, n_chroma=12
        )
        bass_chroma = librosa.feature.chroma_cqt(
            C=self._cqt(self.bass, sr, "C1", 3, tuning),
            sr=sr,
            hop_length=HOP,
            bins_per_octave=BINS,
            n_chroma=12,
        )
        rms = librosa.feature.rms(y=self.harmonic + self.bass, hop_length=HOP)[0]
        n = min(chroma.shape[1], bass_chroma.shape[1], rms.shape[0])
        bounds = np.unique(np.clip(np.concatenate([[0], beat_frames, [n]]), 0, n))
        c = librosa.util.sync(chroma[:, :n], bounds, aggregate=np.median)
        b = librosa.util.sync(bass_chroma[:, :n], bounds, aggregate=np.mean)
        energy = librosa.util.sync(rms[np.newaxis, :n], bounds, aggregate=np.mean)[0]
        times = librosa.frames_to_time(bounds, sr=sr, hop_length=HOP)
        times[-1] = len(self.harmonic) / sr

        c = c / np.maximum(np.linalg.norm(c, axis=0, keepdims=True), 1e-9)
        b = b / np.maximum(b.max(axis=0, keepdims=True), 1e-9)
        vocab = vocabulary()
        templates = np.stack([v.template for v in vocab])
        roots = np.array([v.root for v in vocab])
        sim = templates @ c + self.bass_weight * b[roots]
        for k, v in enumerate(vocab):
            if v.is_seventh:
                sim[k] -= self.seventh_penalty
            if key is not None and fits_key(v, *key):
                sim[k] += self.key_bonus

        quiet = energy < 0.05 * (np.percentile(energy, 90) or 1.0)
        no_chord = np.where(quiet, sim.max(axis=0) + 0.1, sim.min(axis=0) - 0.1)
        sim = np.vstack([sim, no_chord])
        probs = np.exp(self.sharpness * (sim - sim.max(axis=0, keepdims=True)))
        probs /= probs.sum(axis=0, keepdims=True)
        names = [*(v.name for v in vocab), NO_CHORD]
        path = librosa.sequence.viterbi(
            probs, librosa.sequence.transition_loop(len(names), self.p_stay)
        )

        # Confidence is per chord family: Am vs Am7 is colour, Am vs C is an error.
        family = np.array([*roots, -1])
        minor = np.array([*(v.is_minor for v in vocab), False])
        conf = np.array(
            [
                probs[(family == family[s]) & (minor == minor[s]), t].sum()
                for t, s in enumerate(path)
            ]
        )
        return BeatChords([names[i] for i in path], np.clip(conf, 0, 1), times)
