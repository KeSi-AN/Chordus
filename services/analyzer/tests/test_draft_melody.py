import numpy as np

from analyzer.analysis.bars import BarToken
from analyzer.draft import build_draft
from analyzer.melody import melody_range_from_f0, pick_device


def tok(bar: int, chord: str, conf: float = 0.9) -> BarToken:
    return BarToken(bar * 2.0, bar * 2.0 + 2.0, chord, conf, bar)


def test_draft_layout_and_markers():
    tokens = [tok(0, "G"), tok(1, "D"), tok(2, "Em", 0.3), tok(3, "C"), tok(4, "N")]
    tokens.append(BarToken(10.0, 11.0, "G", 0.9, 5))
    tokens.append(BarToken(11.0, 12.0, "D", 0.9, 5))
    text = build_draft(tokens, title="Song", artist=None, key="G", bpm=96.4, time_signature="4/4")
    lines = text.splitlines()
    assert lines[:3] == ["{title: Song}", "{key: G}", "{tempo: 96}"]
    assert "{start_of_verse: Detected chords}" in lines
    rows = [line for line in lines if line.startswith("|")]
    assert rows[0] == "| [G]      | [D]      | [Em?]     | [C]      |"
    assert rows[1].startswith("| [N.C.]") and "[G] [D]" in rows[1]
    # One chord token per timeline entry, in order.
    import re

    chords = re.findall(r"\[([^\]]+)\]", "\n".join(rows))
    assert [c.rstrip("?") for c in chords] == ["G", "D", "Em", "C", "N.C.", "G", "D"]


def test_draft_blocks_of_sixteen_bars():
    text = build_draft(
        [tok(i, "A") for i in range(20)],
        title=None,
        artist=None,
        key=None,
        bpm=None,
        time_signature="3/4",
    )
    body = text.split("{start_of_verse: Detected chords}\n")[1]
    assert body.splitlines()[4] == ""  # blank line after 4 rows
    assert "{time: 3/4}" in text


def test_melody_range_percentiles():
    hop = 0.02
    # 10 s at A3 (57) and 10 s at E4 (64), plus a glitch at C6 and unvoiced frames.
    f0 = np.concatenate([np.full(500, 220.0), np.full(500, 329.63), [1046.5], np.full(50, np.nan)])
    prob = np.concatenate([np.full(1001, 0.9), np.zeros(50)])
    r = melody_range_from_f0(f0, prob, hop)
    assert r is not None
    assert round(r.p10) == 57 and round(r.p90) == 64
    assert r.high < 70  # the glitch is ignored
    assert r.voiced_seconds == 20.0


def test_melody_needs_enough_voice():
    assert melody_range_from_f0(np.full(100, 220.0), np.full(100, 0.9), 0.02) is None


def test_pick_device():
    assert pick_device("cpu") == "cpu"
    assert pick_device("auto") in ("cpu", "cuda")
