"""Audio decoding via ffmpeg (handles MP3, M4A, WebM/Opus, FLAC, WAV consistently)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


class AudioError(RuntimeError):
    pass


def ffmpeg_path() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise AudioError("ffmpeg was not found on PATH. Install it (e.g. `winget install ffmpeg`).")
    return exe


def to_wav(src: Path, dst: Path, *, sr: int = 44100, mono: bool = False) -> Path:
    """Decode any audio file to 16-bit PCM WAV."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg_path(), "-v", "error", "-y", "-i", str(src), "-vn", "-ar", str(sr)]
    if mono:
        cmd += ["-ac", "1"]
    cmd += ["-c:a", "pcm_s16le", str(dst)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise AudioError(f"ffmpeg could not decode {src.name}: {proc.stderr.strip()[:300]}")
    return dst


def load_mono(path: Path, sr: int = 22050) -> tuple[np.ndarray, int]:
    """Load a WAV (or anything soundfile reads) as float32 mono at `sr`."""
    import librosa

    y, file_sr = sf.read(str(path), dtype="float32", always_2d=True)
    y = y.mean(axis=1)
    if file_sr != sr:
        y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)
    return y.astype(np.float32), sr


def write_wav(path: Path, y: np.ndarray, sr: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), y, sr, subtype="PCM_16")
    return path
