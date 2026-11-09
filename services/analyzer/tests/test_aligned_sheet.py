import re

import numpy as np

from analyzer.aligned_sheet import build_aligned_sheet, place_chords, usable_spans
from analyzer.analysis.bars import BarToken, ChordSpan
from analyzer.analysis.chords_stems import VocabChord, fits_key, vocabulary
from analyzer.lyrics import (
    LyricLine,
    Word,
    clean_word,
    densest_vocal_window,
    drop_quiet_words,
    split_lines,
)


def line(start: float, *words: str) -> LyricLine:
    return LyricLine([Word(start + i, start + i + 0.8, w) for i, w in enumerate(words)])


def span(s: float, e: float, chord: str, conf: float = 0.9) -> ChordSpan:
    return ChordSpan(s, e, chord, conf)


def test_split_lines_on_pause_punctuation_and_length():
    words = [Word(0, 0.5, "one"), Word(0.6, 1, "two"), Word(2, 2.5, "three")]
    assert [len(x.words) for x in split_lines(words)] == [2, 1]
    words = [Word(i * 0.5, i * 0.5 + 0.4, "w.") for i in range(4)]
    assert [len(x.words) for x in split_lines(words)] == [3, 1]
    long = [Word(i * 0.3, i * 0.3 + 0.2, "w") for i in range(13)]
    assert [len(x.words) for x in split_lines(long)] == [10, 3]


def test_clean_word_removes_chordpro_syntax():
    assert clean_word(" [Music] ") == "Music"
    assert clean_word("{x}") == "x"


def test_densest_window_finds_the_singing():
    y = np.zeros(16000 * 100)
    y[16000 * 60 : 16000 * 80] = 0.5
    a, b = densest_vocal_window(y)
    assert a <= 16000 * 60 and b >= 16000 * 80 and b - a == 16000 * 30


def test_quiet_words_are_dropped():
    y = np.zeros(16000 * 4)
    y[: 16000 * 2] = 0.5
    kept = drop_quiet_words([Word(0.5, 1, "real"), Word(3, 3.5, "invented")], y)
    assert [w.text for w in kept] == ["real"]


def test_usable_spans_absorbs_flicker_and_silence():
    got = usable_spans([span(0, 2, "G"), span(2, 2.1, "A"), span(2.1, 4, "G"), span(4, 5, "N")])
    assert [(s.start, s.end, s.chord) for s in got] == [(0, 4, "G")]


def test_chord_lands_on_the_word_being_sung():
    ln = line(10, "one", "two", "three", "four")
    placed = place_chords(ln, [span(0, 11.5, "G"), span(11.5, 13.5, "D"), span(13.5, 20, "C")])
    assert {i: s.chord for i, s in placed.items()} == {0: "G", 1: "D", 3: "C"}


def test_two_changes_on_one_word_move_to_the_next_word():
    ln = line(0, "one", "two", "three")
    placed = place_chords(ln, [span(0, 0.3, "G"), span(0.3, 0.6, "D"), span(0.6, 9, "C")])
    assert [placed[i].chord for i in (0, 1, 2)] == ["G", "D", "C"]


def test_sheet_matches_timeline_and_marks_instrumentals():
    bars = [
        BarToken(0, 2, "G", 0.9, 0),
        BarToken(2, 4, "C", 0.3, 1),
        BarToken(4, 6, "N", 0.9, 2),
        BarToken(14, 16, "A", 0.9, 7),
        BarToken(16, 18, "D", 0.9, 8),
    ]
    spans = [span(0, 6, "G"), span(6, 8, "D"), span(8, 14, "C", 0.2), span(14, 20, "A")]
    sheet = build_aligned_sheet(
        spans,
        [line(6, "hello", "world"), line(9, "second", "line")],
        bars,
        title="T",
        artist=None,
        key="G",
        bpm=90.2,
        time_signature="4/4",
        duration=20,
    )
    text = sheet.chordpro
    assert "{comment: Intro}" in text and "| [G] | [C?] |" in text
    assert "[D]hello world" in text
    assert "[C?]second line" in text
    assert "{comment: Outro}" in text
    body = "\n".join(x for x in text.splitlines() if not x.startswith("{"))
    tokens = [t.rstrip("?") for t in re.findall(r"\[([^\]]+)\]", body)]
    assert tokens == [t.chord for t in sheet.timeline]
    assert all(a.end == b.start for a, b in zip(sheet.timeline, sheet.timeline[1:], strict=False))
    assert sheet.timeline[-1].end == 20


def test_vocabulary_and_key_fit():
    vocab: dict[str, VocabChord] = {v.name: v for v in vocabulary()}
    assert len(vocab) == 60
    assert fits_key(vocab["Am7"], 0, "major")
    assert not fits_key(vocab["Eb"], 0, "major")
    assert fits_key(vocab["E7"], 9, "minor")
