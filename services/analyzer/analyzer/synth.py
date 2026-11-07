"""Synthetic test songs with exact ground truth (for unit tests and the chord-detection spike).

Each song is a chord progression rendered with plucked-string strums (Karplus-Strong),
a bass line, a light kick/snare pattern and optionally a sung-like melody, so the detectors
see something closer to a band than pure sine tones. Not a substitute for real recordings.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY_INTERVALS = {
    "": (0, 4, 7),
    "m": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "m7": (0, 3, 7, 10),
    "maj7": (0, 4, 7, 11),
}


def parse_chord(name: str) -> tuple[int, str]:
    """'F#m7' -> (6, 'm7'). Supports the qualities in QUALITY_INTERVALS."""
    pc = NOTE_PC[name[0]]
    rest = name[1:]
    if rest[:1] in ("#", "b"):
        pc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    if rest not in QUALITY_INTERVALS:
        raise ValueError(f"Unsupported chord quality in {name}")
    return pc % 12, rest


def midi_to_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _pluck(freq: float, dur: float, sr: int, rng: np.random.Generator, decay=0.996) -> np.ndarray:
    n = int(dur * sr)
    period = max(2, int(sr / freq))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = decay * 0.5 * (buf[i % period] + buf[(i + 1) % period])
    return out


def _env(n: int, sr: int, attack=0.005, release=0.08) -> np.ndarray:
    e = np.ones(n)
    a, r = int(attack * sr), int(release * sr)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r and r < n:
        e[-r:] = np.linspace(1, 0, r)
    return e


@dataclass
class SynthSong:
    audio: np.ndarray
    sr: int
    bpm: float
    #: (start_sec, end_sec, chord) ground truth.
    labels: list[tuple[float, float, str]]
    key: str
    beats_per_bar: int


def render_song(
    progression: list[tuple[str, int]],
    *,
    bpm: float = 100,
    key: str = "C",
    beats_per_bar: int = 4,
    sr: int = 22050,
    melody: bool = True,
    drums: bool = True,
    seed: int = 0,
) -> SynthSong:
    """Render (chord, beats) pairs. Strums on every beat, bass on beat 1 and 3."""
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    total_beats = sum(b for _, b in progression)
    n = int((total_beats * beat + 1.0) * sr)
    out = np.zeros(n)
    labels: list[tuple[float, float, str]] = []
    t = 0.0
    beat_index = 0
    for chord, beats in progression:
        root, quality = parse_chord(chord)
        ivs = QUALITY_INTERVALS[quality]
        labels.append((round(t, 4), round(t + beats * beat, 4), chord))
        # Guitar-ish voicing around E3..E4, bass an octave or two below the root.
        voicing = [
            48 + ((root + iv - 4) % 12) + 4 + (12 if k >= 3 else 0) for k, iv in enumerate(ivs)
        ]
        bass = 36 + root if root < 7 else 24 + root
        for b in range(beats):
            start = int((t + b * beat) * sr)
            dur = beat * 0.95
            for k, m in enumerate(sorted(voicing)):
                s = start + int(k * 0.008 * sr)  # strum spread
                tone = _pluck(midi_to_hz(m), dur, sr, rng) * 0.22
                end = min(n, s + len(tone))
                out[s:end] += tone[: end - s]
            if (beat_index + b) % 2 == 0:
                bn = int(beat * 1.9 * sr)
                tt = np.arange(bn) / sr
                f = midi_to_hz(bass)
                tone = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * 0.35
                tone *= np.exp(-tt * 1.5) * _env(bn, sr)
                end = min(n, start + bn)
                out[start:end] += tone[: end - start]
            if drums:
                pos = (beat_index + b) % beats_per_bar
                ln = int(0.12 * sr)
                tt = np.arange(ln) / sr
                if pos == 0 or (beats_per_bar == 4 and pos == 2):
                    kick = np.sin(2 * np.pi * (120 - 400 * tt) * tt) * np.exp(-tt * 30) * 0.5
                    end = min(n, start + ln)
                    out[start:end] += kick[: end - start]
                else:
                    snare = rng.uniform(-1, 1, ln) * np.exp(-tt * 40) * 0.15
                    end = min(n, start + ln)
                    out[start:end] += snare[: end - start]
            if melody and b % 2 == 0:
                # A voice-like line on chord tones, octave 4-5, with vibrato.
                m = 60 + ((root + ivs[(beat_index + b) // 2 % len(ivs)]) % 12)
                ln = int(beat * 1.8 * sr)
                tt = np.arange(ln) / sr
                f = midi_to_hz(m) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * tt))
                phase = 2 * np.pi * np.cumsum(f) / sr
                tone = (np.sin(phase) + 0.4 * np.sin(2 * phase) + 0.2 * np.sin(3 * phase)) * 0.12
                tone *= _env(ln, sr, 0.05, 0.2)
                end = min(n, start + ln)
                out[start:end] += tone[: end - start]
        t += beats * beat
        beat_index += beats
    out += rng.normal(0, 0.003, n)
    out /= max(1e-9, np.abs(out).max()) / 0.8
    return SynthSong(out.astype(np.float32), sr, bpm, labels, key, beats_per_bar)


#: Progressions for the spike / tests: (name, key, bpm, beats per bar, progression).
DATASET: list[tuple[str, str, float, int, list[tuple[str, int]]]] = [
    ("pop-I-V-vi-IV", "G", 96, 4, [(c, 4) for c in ["G", "D", "Em", "C"] * 4]),
    (
        "ballad-minor",
        "Am",
        72,
        4,
        [(c, 4) for c in ["Am", "F", "C", "G", "Am", "Dm", "E", "Am"] * 2],
    ),
    ("folk-waltz", "D", 120, 3, [(c, 3) for c in ["D", "G", "D", "A", "D", "G", "A", "D"] * 2]),
    (
        "rock-fast-changes",
        "E",
        132,
        4,
        [(c, 2) for c in ["E", "A", "B", "A", "E", "C#m", "A", "B"] * 3],
    ),
    ("sevenths", "C", 88, 4, [(c, 4) for c in ["Cmaj7", "Am7", "Dm7", "G7"] * 3]),
    ("flat-key", "Bb", 104, 4, [(c, 4) for c in ["Bb", "Gm", "Eb", "F"] * 4]),
]
