"""Turn per-beat chord labels into chord segments and per-bar chord tokens (the draft sheet)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .chords import NO_CHORD, BeatChords

#: Below this confidence a bar's chord is marked uncertain ([G?] in the draft sheet).
UNCERTAIN_BELOW = 0.55
#: A second chord inside a bar is written out when it covers at least this much of the bar.
SPLIT_BAR_MIN_SHARE = 0.35


@dataclass
class ChordSpan:
    start: float
    end: float
    chord: str
    confidence: float


@dataclass
class BarToken(ChordSpan):
    bar: int

    def as_json(self) -> dict:
        d = asdict(self)
        d["start"] = round(d["start"], 3)
        d["end"] = round(d["end"], 3)
        d["confidence"] = round(d["confidence"], 3)
        return d


def merge_segments(beats: BeatChords) -> list[ChordSpan]:
    """Collapse consecutive beats with the same label."""
    out: list[ChordSpan] = []
    for i, label in enumerate(beats.labels):
        start, end = float(beats.times[i]), float(beats.times[i + 1])
        conf = float(beats.confidences[i])
        if out and out[-1].chord == label:
            prev = out[-1]
            w0, w1 = prev.end - prev.start, end - start
            prev.confidence = (prev.confidence * w0 + conf * w1) / max(w0 + w1, 1e-9)
            prev.end = end
        else:
            out.append(ChordSpan(start, end, label, conf))
    return out


def bar_starts(
    beat_times: np.ndarray, beats_per_bar: int, phase: int, duration: float
) -> list[float]:
    """Bar boundaries from the beat grid. A pickup before the first downbeat becomes bar 0."""
    downbeats = list(beat_times[phase::beats_per_bar])
    starts = [0.0] if not downbeats or downbeats[0] > 0.25 else []
    starts += [float(t) for t in downbeats]
    if not starts or starts[-1] < duration:
        starts.append(duration)
    return starts


def _coverage(spans: list[ChordSpan], s: float, e: float) -> dict[str, tuple[float, float]]:
    """chord -> (seconds covered within [s, e), duration-weighted confidence sum)."""
    cov: dict[str, tuple[float, float]] = {}
    for sp in spans:
        overlap = min(e, sp.end) - max(s, sp.start)
        if overlap <= 0:
            continue
        t, c = cov.get(sp.chord, (0.0, 0.0))
        cov[sp.chord] = (t + overlap, c + overlap * sp.confidence)
    return cov


def bar_tokens(spans: list[ChordSpan], bounds: list[float]) -> list[BarToken]:
    """One token per bar (two when the bar clearly changes chord halfway)."""
    tokens: list[BarToken] = []
    for b in range(len(bounds) - 1):
        s, e = bounds[b], bounds[b + 1]
        length = max(e - s, 1e-9)
        cov = _coverage(spans, s, e)
        if not cov:
            continue
        ranked = sorted(cov.items(), key=lambda kv: kv[1][0], reverse=True)
        chosen = [ranked[0]]
        if len(ranked) > 1 and ranked[1][1][0] / length >= SPLIT_BAR_MIN_SHARE:
            chosen.append(ranked[1])
        # Keep chosen chords in time order within the bar.
        first_seen = {
            sp.chord: max(sp.start, s) for sp in reversed(spans) if sp.end > s and sp.start < e
        }
        chosen.sort(key=lambda kv: first_seen.get(kv[0], s))
        if len(chosen) == 1:
            chord, (t, csum) = chosen[0]
            share = t / length
            tokens.append(BarToken(s, e, chord, (csum / t) * (0.5 + 0.5 * share), b))
        else:
            mid = first_seen.get(chosen[1][0], (s + e) / 2)
            for (chord, (t, csum)), (ts, te) in zip(chosen, [(s, mid), (mid, e)], strict=True):
                tokens.append(BarToken(ts, te, chord, csum / t, b))
    # Drop leading/trailing silence bars.
    while tokens and tokens[0].chord == NO_CHORD:
        tokens.pop(0)
    while tokens and tokens[-1].chord == NO_CHORD:
        tokens.pop()
    return tokens
