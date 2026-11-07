"""Build a draft ChordPro sheet from per-bar chord tokens.

One chord token per bar (two for split bars), four bars per line, bar lines as lyrics text:
    | [G]    | [D]    | [Em]   | [C?]   |
Low-confidence chords get the `?` marker (`[C?]`), which the web app underlines. The k-th chord
token in the sheet is the k-th entry of the analysis chord timeline, which is how playback
highlights the current bar.
"""

from __future__ import annotations

from collections.abc import Sequence

from .analysis.bars import UNCERTAIN_BELOW, BarToken
from .analysis.chords import NO_CHORD

BARS_PER_LINE = 4
LINES_PER_BLOCK = 4
CELL_WIDTH = 7


def chord_symbol(label: str) -> str:
    return "N.C." if label == NO_CHORD else label


def token_text(t: BarToken) -> str:
    mark = "?" if t.confidence < UNCERTAIN_BELOW else ""
    return f"[{chord_symbol(t.chord)}{mark}]"


def build_draft(
    tokens: Sequence[BarToken],
    *,
    title: str | None,
    artist: str | None,
    key: str | None,
    bpm: float | None,
    time_signature: str,
) -> str:
    out: list[str] = []
    if title:
        out.append(f"{{title: {title}}}")
    if artist:
        out.append(f"{{artist: {artist}}}")
    if key:
        out.append(f"{{key: {key}}}")
    if bpm:
        out.append(f"{{tempo: {round(bpm)}}}")
    out.append(f"{{time: {time_signature}}}")
    out.append("")
    out.append(
        "{comment: Draft chords detected from audio, one per bar. "
        "Underlined chords are low-confidence; check them by ear.}"
    )
    out.append("")
    out.append("{start_of_verse: Detected chords}")

    bars: list[list[BarToken]] = []
    for t in tokens:
        if bars and bars[-1][0].bar == t.bar:
            bars[-1].append(t)
        else:
            bars.append([t])

    for i in range(0, len(bars), BARS_PER_LINE):
        line_bars = bars[i : i + BARS_PER_LINE]
        cells = []
        for bar in line_bars:
            text = " ".join(token_text(t) for t in bar)
            # Width as displayed: brackets and the "?" marker aren't shown.
            visible = len(text) - 2 * len(bar) - text.count("?")
            cells.append("| " + text + " " * max(1, CELL_WIDTH - visible))
        out.append(("".join(cells) + "|").rstrip())
        if (i // BARS_PER_LINE + 1) % LINES_PER_BLOCK == 0 and i + BARS_PER_LINE < len(bars):
            out.append("")
    out.append("{end_of_verse}")
    return "\n".join(out) + "\n"
