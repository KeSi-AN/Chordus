"""Vocal melody range: Demucs isolates the vocals, pYIN tracks their pitch, and we keep
percentiles (p10/p90 for the comfortable span, p2/p98 for the extremes) so glitches don't count.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import load_mono, write_wav

MIN_VOICED_SECONDS = 5.0


@dataclass
class MelodyRange:
    low: float
    high: float
    p10: float
    p90: float
    voiced_seconds: float


def pick_device(pref: str) -> str:
    if pref != "auto":
        return pref
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def separate_vocals(
    wav_path: Path,
    out_path: Path,
    *,
    model: str = "htdemucs",
    device: str = "auto",
    progress: Callable[[float], None] | None = None,
) -> Path:
    """Write the isolated vocal stem of `wav_path` to `out_path` (44.1 kHz WAV)."""
    import soundfile as sf
    import torch
    from demucs.api import Separator

    def on_progress(info: dict) -> None:
        if progress and info.get("state") == "end" and info.get("audio_length"):
            done = (info.get("segment_offset", 0) + info.get("segment_length", 0)) / info[
                "audio_length"
            ]
            progress(min(1.0, float(done)))

    sep = Separator(model=model, device=pick_device(device), callback=on_progress)
    audio, sr = sf.read(str(wav_path), dtype="float32", always_2d=True)
    if sr != sep.samplerate:
        raise ValueError(f"Expected {sep.samplerate} Hz audio for Demucs, got {sr}")
    mix = torch.from_numpy(audio.T.copy())
    if mix.shape[0] == 1:
        mix = mix.repeat(2, 1)
    _, stems = sep.separate_tensor(mix, sr)
    vocals = stems["vocals"].mean(dim=0).cpu().numpy()
    return write_wav(out_path, vocals, sr)


def melody_range_from_f0(
    f0_hz: np.ndarray, voiced_prob: np.ndarray, hop_seconds: float
) -> MelodyRange | None:
    """Percentile range of confidently voiced frames, in (fractional) MIDI numbers."""
    mask = np.isfinite(f0_hz) & (voiced_prob > 0.5) & (f0_hz > 0)
    voiced = f0_hz[mask]
    if voiced.size * hop_seconds < MIN_VOICED_SECONDS:
        return None
    midi = 69 + 12 * np.log2(voiced / 440.0)
    p2, p10, p90, p98 = np.percentile(midi, [2, 10, 90, 98])
    return MelodyRange(
        low=round(float(p2), 2),
        high=round(float(p98), 2),
        p10=round(float(p10), 2),
        p90=round(float(p90), 2),
        voiced_seconds=round(float(voiced.size * hop_seconds), 1),
    )


def track_melody(vocals_wav: Path) -> MelodyRange | None:
    """pYIN over the vocal stem (C2–C6, which covers bass to soprano)."""
    import librosa

    y, sr = load_mono(vocals_wav, sr=16000)
    hop = 320  # 20 ms
    f0, _, prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        sr=sr,
        frame_length=1280,
        hop_length=hop,
    )
    return melody_range_from_f0(f0, prob, hop / sr)
