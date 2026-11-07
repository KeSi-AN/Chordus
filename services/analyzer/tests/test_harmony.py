"""Harmony analysis on synthetic songs with known chords, key and tempo."""

from __future__ import annotations

import numpy as np
import pytest

from analyzer.analysis import analyze_harmony
from analyzer.analysis.bars import BarToken, bar_starts, bar_tokens, merge_segments
from analyzer.analysis.chords import BeatChords, chord_vocab, diatonic_triads
from analyzer.analysis.key import detect_key
from analyzer.analysis.rhythm import downbeat_phase, estimate_meter
from analyzer.synth import parse_chord, render_song

ENHARMONIC = {"Db": "C#", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb"}


def triad(label: str) -> str:
    """Reduce a chord name to root + maj/min with sharps/flats normalized ("Cmaj7" -> "C")."""
    if label == "N":
        return "N"
    root = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    rest = label[len(root) :]
    root = ENHARMONIC.get(root, root)
    minor = rest.startswith("m") and not rest.startswith("maj")
    return root + ("m" if minor else "")


def time_accuracy(tokens: list[BarToken], labels: list[tuple[float, float, str]]) -> float:
    """Fraction of labelled time where the detected bar chord matches (triad level)."""
    total = correct = 0.0
    for s, e, gt in labels:
        total += e - s
        for t in tokens:
            ov = min(e, t.end) - max(s, t.start)
            if ov > 0 and triad(t.chord) == triad(gt):
                correct += ov
    return correct / total


@pytest.fixture(scope="module")
def pop_song():
    prog = [(c, 4) for c in ["G", "D", "Em", "C"] * 3]
    return render_song(prog, bpm=100, key="G", seed=1)


def test_synth_parses_chords():
    assert parse_chord("F#m7") == (6, "m7")
    assert parse_chord("Bb") == (10, "")
    with pytest.raises(ValueError):
        parse_chord("Csus4")


def test_vocab_and_diatonic_sets():
    names = [n for n, _ in chord_vocab()]
    assert len(names) == 25 and names[-1] == "N"
    assert diatonic_triads(7, "major") == {"G", "Am", "Bm", "C", "D", "Em"}
    assert "E" in diatonic_triads(9, "minor")  # harmonic-minor V


def test_key_profiles_on_scales():
    # A chroma vector shaped like a G major scale.
    chroma = np.zeros((12, 4))
    for pc in [7, 9, 11, 0, 2, 4, 6]:
        chroma[pc] = 1.0
    chroma[7] = 2.0
    assert detect_key(chroma).key == "G"
    with pytest.raises(ValueError):
        detect_key(np.zeros((11, 3)))


def test_meter_and_downbeat_from_chord_changes():
    four = ["A"] * 2 + (["G"] * 4 + ["D"] * 4) * 4
    assert estimate_meter(four) == 4
    assert downbeat_phase(four, 4) == 2
    waltz = (["D"] * 3 + ["G"] * 3 + ["A"] * 3) * 4
    assert estimate_meter(waltz) == 3


def test_bar_tokens_split_and_trim():
    beats = BeatChords(
        labels=["N", "G", "G", "G", "G", "C", "C", "D", "D", "N"],
        confidences=np.full(10, 0.9),
        times=np.arange(11, dtype=float),
    )
    spans = merge_segments(beats)
    assert [s.chord for s in spans] == ["N", "G", "C", "D", "N"]
    bounds = bar_starts(np.arange(1, 10, dtype=float), 4, 0, 10.0)
    assert bounds == [0.0, 1.0, 5.0, 9.0, 10.0]
    tokens = bar_tokens(spans, bounds)
    assert [(t.chord, t.bar) for t in tokens] == [("G", 1), ("C", 2), ("D", 2)]
    assert tokens[1].end == tokens[2].start == 7.0


def test_full_harmony_on_synthetic_pop(pop_song):
    r = analyze_harmony(pop_song.audio, pop_song.sr)
    assert r.key.key in ("G", "Em")
    assert abs(r.bpm - 100) < 4 or abs(r.bpm - 200) < 8 or abs(r.bpm - 50) < 3
    assert r.beats_per_bar == 4
    acc = time_accuracy(r.bars, pop_song.labels)
    assert acc > 0.8, acc
    assert all(0 <= t.confidence <= 1 for t in r.bars)


def test_progress_callback_reports_stages(pop_song):
    seen: list[str] = []
    analyze_harmony(
        pop_song.audio[: pop_song.sr * 12], pop_song.sr, progress=lambda s, p: seen.append(s)
    )
    assert seen[0] == "Finding the beat" and seen[-1] == "Harmony done"
