"""Merge timed lyrics and chord changes into a ChordPro sheet.

Every chord change lands on the word being sung at that moment. Passages without singing
(intro, solos, outro) become bar lines. The sheet's k-th chord token is the k-th timeline entry,
which is how playback highlights the current chord.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .analysis.bars import UNCERTAIN_BELOW, BarToken, ChordSpan
from .analysis.chords import NO_CHORD
from .draft import chord_symbol
from .lyrics import LyricLine, Word

#: Spans shorter than this are detector flicker, not chord changes (seconds).
MIN_SPAN = 0.3
#: A pause between sung lines at least this long gets its own chord line (seconds).
INSTRUMENTAL_GAP = 3.0
#: A pause at least this long starts a new paragraph (seconds).
PARAGRAPH_GAP = 1.5
BARS_PER_LINE = 4


@dataclass
class AlignedSheet:
    chordpro: str
    timeline: list[BarToken]


def usable_spans(spans: Sequence[ChordSpan]) -> list[ChordSpan]:
    """Drop no-chord and flicker spans, extending the previous chord over them."""
    out: list[ChordSpan] = []
    for s in spans:
        if s.chord == NO_CHORD or s.end - s.start < MIN_SPAN:
            continue
        if out and out[-1].chord == s.chord:
            out[-1] = ChordSpan(
                out[-1].start, s.end, s.chord, max(out[-1].confidence, s.confidence)
            )
        else:
            out.append(ChordSpan(s.start, s.end, s.chord, s.confidence))
    return out


def _word_at(words: list[Word], t: float) -> int:
    """Index of the word being sung at `t`, or the next one to start."""
    for i, w in enumerate(words):
        if t < w.end:
            return i
    return len(words) - 1


def place_chords(line: LyricLine, spans: Sequence[ChordSpan]) -> dict[int, ChordSpan]:
    """Map word index → chord for one line: the chord held at its start, then each change."""
    placed: dict[int, ChordSpan] = {}
    relevant = [s for s in spans if s.end > line.start and s.start < line.end]
    for span in relevant:
        idx = 0 if span.start <= line.start else _word_at(line.words, span.start)
        while idx in placed and idx + 1 < len(line.words):
            idx += 1
        if idx not in placed or span.end - span.start > placed[idx].end - placed[idx].start:
            placed[idx] = span
    return placed


def _token(span_chord: str, confidence: float) -> str:
    return f"[{chord_symbol(span_chord)}{'?' if confidence < UNCERTAIN_BELOW else ''}]"


def _instrumental_rows(bars: Sequence[BarToken], start: float, end: float) -> list[list[BarToken]]:
    """Bars whose midpoint falls in [start, end), skipping silence, in rows of four."""
    grouped: list[list[BarToken]] = []
    for t in bars:
        if t.chord == NO_CHORD or not start <= (t.start + t.end) / 2 < end:
            continue
        if grouped and grouped[-1][0].bar == t.bar:
            grouped[-1].append(t)
        else:
            grouped.append([t])
    flat = [grouped[i : i + BARS_PER_LINE] for i in range(0, len(grouped), BARS_PER_LINE)]
    return [[t for bar in row for t in bar] for row in flat]


def build_aligned_sheet(
    spans: Sequence[ChordSpan],
    lines: Sequence[LyricLine],
    bars: Sequence[BarToken],
    *,
    title: str | None,
    artist: str | None,
    key: str | None,
    bpm: float | None,
    time_signature: str,
    duration: float,
) -> AlignedSheet:
    chords = usable_spans(spans)
    out: list[str] = []
    for name, value in (("title", title), ("artist", artist), ("key", key)):
        if value:
            out.append(f"{{{name}: {value}}}")
    if bpm:
        out.append(f"{{tempo: {round(bpm)}}}")
    out.append(f"{{time: {time_signature}}}")
    out.append("")
    out.append(
        "{comment: Draft lyrics and chords detected from audio. "
        "Underlined chords are low-confidence; check them by ear.}"
    )
    out.append("")

    starts: list[tuple[float, str, float, int]] = []  # time, chord, confidence, bar

    def instrumental(label: str, start: float, end: float) -> None:
        rows = _instrumental_rows(bars, start, end)
        if not rows:
            return
        out.append(f"{{comment: {label}}}")
        for row in rows:
            cells: list[str] = []
            last_bar = None
            for t in row:
                text = _token(t.chord, t.confidence)
                starts.append((t.start, t.chord, t.confidence, t.bar))
                if t.bar == last_bar:
                    cells[-1] += f" {text}"
                else:
                    cells.append(text)
                last_bar = t.bar
            out.append("| " + " | ".join(cells) + " |")
        out.append("")

    instrumental("Intro", 0.0, lines[0].start)
    for n, line in enumerate(lines):
        placed = place_chords(line, chords)
        parts = []
        for i, word in enumerate(line.words):
            span = placed.get(i)
            if span is None:
                parts.append(word.text)
                continue
            parts.append(_token(span.chord, span.confidence) + word.text)
            starts.append(
                (
                    max(word.start, line.start) if i == 0 else word.start,
                    span.chord,
                    span.confidence,
                    -1,
                )
            )
        out.append(" ".join(parts))
        if n + 1 < len(lines):
            gap = lines[n + 1].start - line.end
            if gap >= INSTRUMENTAL_GAP:
                out.append("")
                instrumental("Instrumental", line.end, lines[n + 1].start)
            elif gap >= PARAGRAPH_GAP:
                out.append("")
    if lines:
        out.append("")
        instrumental("Outro", lines[-1].end, duration)

    timeline = [
        BarToken(t, starts[i + 1][0] if i + 1 < len(starts) else duration, chord, conf, bar)
        for i, (t, chord, conf, bar) in enumerate(starts)
    ]
    return AlignedSheet("\n".join(out).rstrip() + "\n", timeline)
