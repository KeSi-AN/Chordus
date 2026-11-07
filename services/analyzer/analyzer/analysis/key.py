"""Key detection: correlate average chroma with Krumhansl-Kessler key profiles."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Krumhansl & Kessler (1982) probe-tone profiles, C major / C minor.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MINOR_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"]


@dataclass
class KeyResult:
    key: str
    tonic: int
    mode: str
    confidence: float
    #: All 24 keys with correlation scores, best first.
    ranking: list[tuple[str, float]]


def key_name(tonic: int, mode: str) -> str:
    return MAJOR_NAMES[tonic] if mode == "major" else MINOR_NAMES[tonic] + "m"


def detect_key(chroma: np.ndarray, weights: np.ndarray | None = None) -> KeyResult:
    """`chroma` is (12, frames). Optional per-frame weights (e.g. harmonic energy)."""
    if chroma.ndim != 2 or chroma.shape[0] != 12:
        raise ValueError("chroma must have shape (12, frames)")
    w = np.ones(chroma.shape[1]) if weights is None else weights
    profile = (chroma * w).sum(axis=1)
    if not np.any(profile):
        return KeyResult("C", 0, "major", 0.0, [("C", 0.0)])
    scores: list[tuple[str, int, str, float]] = []
    for tonic in range(12):
        for mode, prof in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            r = float(np.corrcoef(profile, np.roll(prof, tonic))[0, 1])
            scores.append((key_name(tonic, mode), tonic, mode, r))
    scores.sort(key=lambda s: s[3], reverse=True)
    best, second = scores[0], scores[1]
    # Margin over the runner-up, scaled into 0..1; a near-tie (often relative major/minor) is low.
    confidence = float(np.clip((best[3] - second[3]) * 5 + max(0.0, best[3]) * 0.5, 0, 1))
    return KeyResult(
        key=best[0],
        tonic=best[1],
        mode=best[2],
        confidence=round(confidence, 3),
        ranking=[(s[0], round(s[3], 4)) for s in scores],
    )
