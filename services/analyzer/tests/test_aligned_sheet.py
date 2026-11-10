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
    segment_words,
    split_lines,
)


def line(start: float, *words: str) -> LyricLine:
    return LyricLine([Word(start + i, start + i + 0.8, w) for i, w in enumerate(words)])


def span(s: float, e: float, chord: str, conf: float = 0.9) -> ChordSpan:
    return ChordSpan(s, e, chord, conf)


def sung(start: float, text: str, gap: float = 0.0) -> list[Word]:
    """Words the way Whisper times singing: back to back, `gap` seconds apart."""
    return [
        Word(start + i * (0.4 + gap), start + i * (0.4 + gap) + 0.4, w)
        for i, w in enumerate(text.split())
    ]


def texts(lines: list[LyricLine]) -> list[str]:
    return [" ".join(w.text for w in x.words) for x in lines]


def test_split_lines_keeps_each_whisper_segment_as_a_line():
    # Sung words run into each other, so only the segments say where the lines are.
    segments = [
        sung(30.0, "Took too long to be alone"),
        sung(32.4, "My house clean"),
        sung(33.6, "My pool warm"),
    ]
    assert texts(split_lines(segments)) == [
        "Took too long to be alone",
        "My house clean",
        "My pool warm",
    ]


def test_split_lines_breaks_a_segment_at_a_long_pause():
    segment = [*sung(10.0, "before the solo"), *sung(25.0, "after the solo")]
    assert texts(split_lines([segment])) == ["before the solo", "after the solo"]
    # A breath is not a line break.
    breath = [*sung(10.0, "open"), *sung(11.5, "open")]
    assert texts(split_lines([breath])) == ["open open"]


def test_split_lines_divides_long_segments_at_clause_marks():
    segment = sung(
        85.0,
        "So sweet, so tight, I won't bite, unless you like, if you smoke, I got the haze, "
        "and if you're hungry, girl I got the lates",
    )
    lines = split_lines([segment])
    assert len(lines) > 1
    assert all(2 <= len(x.words) <= 12 for x in lines)
    # Every break follows a comma, and that comma is dropped from the end of the line.
    original = [w.text for w in segment]
    position = 0
    for x in lines[:-1]:
        position += len(x.words)
        assert original[position - 1].endswith(",")
        assert not x.words[-1].text.endswith(",")
    assert sum(len(x.words) for x in lines) == len(original)


def test_split_lines_divides_unpunctuated_runs_evenly():
    lines = split_lines([sung(0.0, " ".join(f"w{i}" for i in range(16)))])
    assert [len(x.words) for x in lines] == [8, 8]
    assert split_lines([]) == []


def test_segment_words_drops_unreliable_segments_and_silence():
    sr = 16000
    y = np.zeros(sr * 6, dtype=np.float32)
    y[:sr] = 0.3 * np.sin(np.arange(sr) / 10)
    whisper_word = lambda s, e, w: {"start": s, "end": e, "word": w}  # noqa: E731
    segments = [
        {
            "avg_logprob": -0.3,
            "words": [whisper_word(0.2, 0.6, " real"), whisper_word(0.6, 0.9, " [x]")],
        },
        {"avg_logprob": -2.0, "words": [whisper_word(0.2, 0.6, " mumbled")]},
        {"avg_logprob": -0.3, "words": [whisper_word(4.0, 4.5, " invented")]},
        {"avg_logprob": -0.3, "words": [whisper_word(0.2, 0.6, " []")]},
    ]
    assert [[w.text for w in seg] for seg in segment_words(segments, y, sr)] == [["real", "x"]]


def test_clean_word_removes_chordpro_syntax():
    assert clean_word(" [Music] ") == "Music"
    assert clean_word("{x}") == "x"


def test_clean_word_drops_punctuation_only_tokens():
    assert clean_word(" ...... ") == ""
    assert clean_word("\u06d4" * 40) == ""  # a run of Urdu full stops, seen on a real song
    assert clean_word(" open,") == "open,"
    assert clean_word("\u0639\u0634\u0642") == "\u0639\u0634\u0642"  # Urdu letters are kept
    assert clean_word("1999") == "1999"


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


def test_timeline_never_steps_back_into_an_instrumental():
    # The chord change at 9.4 lands on the last word; the bar picked for the break that
    # follows (by its midpoint) started at 8.0, before that word.
    bars = [BarToken(8, 12, "D", 0.9, 2), BarToken(12, 16, "G", 0.9, 3)]
    spans = [span(0, 9.4, "G"), span(9.4, 12, "D"), span(12, 20, "G")]
    first = LyricLine([Word(6.0, 7.0, "sung"), Word(7.0, 8.0, "right"), Word(9.2, 9.8, "here")])
    sheet = build_aligned_sheet(
        spans,
        [first, line(17, "next", "line")],
        bars,
        title=None,
        artist=None,
        key=None,
        bpm=None,
        time_signature="4/4",
        duration=20,
    )
    starts = [t.start for t in sheet.timeline]
    assert starts == sorted(starts)
    assert all(t.end >= t.start for t in sheet.timeline)
    assert len(sheet.timeline) == len(re.findall(r"\[[^\]]+\]", sheet.chordpro))
