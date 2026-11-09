"""Lyrics with word timestamps: Whisper on the isolated vocal stem (local, personal use)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import load_mono
from .melody import free_gpu, pick_device

log = logging.getLogger(__name__)

SR = 16000
#: A new lyric line starts after a pause this long (seconds).
LINE_GAP = 0.7
MAX_WORDS_PER_LINE = 10
#: Whisper segments below this are unusable. Its no-speech score is not used: singing often
#: rates as "not speech", so silence is judged from the vocal stem instead (drop_quiet_words).
MIN_AVG_LOGPROB = -1.3
#: A word is dropped if the vocal stem is near silent while it is "sung".
QUIET_WORD_RATIO = 0.03


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class LyricLine:
    words: list[Word]

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end


@dataclass
class Transcript:
    language: str
    lines: list[LyricLine]


def clean_word(text: str) -> str:
    """ChordPro reserves [] and {}; Whisper sometimes emits them for "[Music]"."""
    return "".join(c for c in text.strip() if c not in "[]{}")


def split_lines(words: list[Word]) -> list[LyricLine]:
    """Group words into sung lines by pauses, sentence punctuation and a length limit."""
    lines: list[LyricLine] = []
    current: list[Word] = []
    for w in words:
        if current:
            gap = w.start - current[-1].end
            ended = current[-1].text[-1:] in ".?!।" and len(current) >= 3
            if gap >= LINE_GAP or ended or len(current) >= MAX_WORDS_PER_LINE:
                lines.append(LyricLine(current))
                current = []
        current.append(w)
    if current:
        lines.append(LyricLine(current))
    return lines


def densest_vocal_window(y: np.ndarray, sr: int = SR, seconds: float = 30.0) -> tuple[int, int]:
    """Sample range of the `seconds`-long window with the most vocal energy."""
    length = int(seconds * sr)
    if len(y) <= length:
        return 0, len(y)
    hop = sr // 2
    energy = np.array([np.mean(y[i : i + hop] ** 2) for i in range(0, len(y) - hop, hop)])
    window = max(1, length // hop)
    summed = np.convolve(energy, np.ones(window), mode="valid")
    start = int(np.argmax(summed)) * hop
    return start, min(len(y), start + length)


def drop_quiet_words(words: list[Word], y: np.ndarray, sr: int = SR) -> list[Word]:
    """Remove words sung over a near-silent vocal stem (Whisper invents text over silence)."""
    if not words:
        return words
    hop = sr // 10
    frames = np.array([np.sqrt(np.mean(y[i : i + hop] ** 2)) for i in range(0, len(y), hop)])
    reference = np.percentile(frames, 95) or 1.0
    kept = []
    for w in words:
        a = int(w.start * sr / hop)
        b = max(a + 1, int(np.ceil(w.end * sr / hop)))
        if frames[a:b].size and frames[a:b].max() >= QUIET_WORD_RATIO * reference:
            kept.append(w)
    return kept


def transcribe(
    vocals_wav: Path,
    *,
    model_name: str = "medium",
    device: str = "auto",
    language: str | None = None,
) -> Transcript | None:
    """Transcribe the vocal stem. Returns None when no usable lyrics are found."""
    import torch
    import whisper

    y, _ = load_mono(vocals_wav, sr=SR)
    resolved = pick_device(device)
    try:
        return _run(whisper, y, model_name, resolved, language)
    except torch.cuda.OutOfMemoryError:
        log.warning("Whisper ran out of GPU memory; retrying on the CPU")
        free_gpu()
        return _run(whisper, y, model_name, "cpu", language)
    finally:
        free_gpu()


def _run(whisper, y: np.ndarray, model_name: str, device: str, language: str | None):  # noqa: ANN001
    model = whisper.load_model(model_name, device=device)
    if language is None:
        # Whisper's own detection uses the first 30 s, often an instrumental intro.
        a, b = densest_vocal_window(y)
        mel = whisper.log_mel_spectrogram(
            whisper.pad_or_trim(y[a:b]), model.dims.n_mels, device=model.device
        )
        _, probs = model.detect_language(mel)
        language = max(probs, key=probs.get)
    result = model.transcribe(
        y,
        language=language,
        word_timestamps=True,
        condition_on_previous_text=False,
        no_speech_threshold=None,
        logprob_threshold=None,
        temperature=(0.0, 0.2),
        # Half precision produces NaNs on GTX 16xx cards.
        fp16=False,
        verbose=None,
    )
    words: list[Word] = []
    for seg in result["segments"]:
        if seg.get("avg_logprob", 0) < MIN_AVG_LOGPROB:
            continue
        for w in seg.get("words", []):
            text = clean_word(w["word"])
            if text:
                words.append(Word(float(w["start"]), float(w["end"]), text))
    words = drop_quiet_words(words, y)
    if not words:
        return None
    return Transcript(language=language, lines=split_lines(words))
