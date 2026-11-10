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
#: A pause this long inside one Whisper segment still starts a new lyric line (seconds).
LINE_GAP = 1.5
#: Longer segments are divided at their most natural break.
MAX_WORDS_PER_LINE = 12
#: Never leave a line fragment shorter than this when dividing a long segment.
MIN_WORDS_PER_PART = 2
_SENTENCE_END = ".?!।۔"
_CLAUSE_END = ",;:،"
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
    """ChordPro reserves [] and {}; Whisper sometimes emits them for "[Music]".

    A "word" with no letter or digit in it (Whisper can fill a quiet passage with a long run of
    full stops) is not a lyric and becomes empty.
    """
    cleaned = "".join(c for c in text.strip() if c not in "[]{}")
    return cleaned if any(c.isalnum() for c in cleaned) else ""


def _split_long(words: list[Word]) -> list[list[Word]]:
    """Divide an over-long run of words at its most natural break, recursively.

    The best break follows a sentence or clause mark, or a breath, and leaves balanced halves.
    """
    if len(words) <= MAX_WORDS_PER_LINE:
        return [words]
    middle = len(words) / 2
    best, best_score = MIN_WORDS_PER_PART, float("-inf")
    for i in range(MIN_WORDS_PER_PART, len(words) - MIN_WORDS_PER_PART + 1):
        last = words[i - 1].text[-1:]
        score = min(max(words[i].start - words[i - 1].end, 0.0), 1.0)
        score += 1.0 if last in _SENTENCE_END else 0.5 if last in _CLAUSE_END else 0.0
        score -= abs(i - middle) / len(words)
        if score > best_score:
            best, best_score = i, score
    return _split_long(words[:best]) + _split_long(words[best:])


def _tidy(words: list[Word]) -> list[Word]:
    """A lyric line doesn't end in a comma."""
    last = words[-1]
    text = last.text.rstrip(_CLAUSE_END)
    return (
        words if not text or text == last.text else [*words[:-1], Word(last.start, last.end, text)]
    )


def split_lines(segments: list[list[Word]]) -> list[LyricLine]:
    """Turn Whisper segments into sung lines.

    On singing, Whisper's segments already are the lyric lines, so each one is kept whole. A
    segment is divided only at a long pause (it can span an instrumental break) or when it is
    too long to read as one line. Word timing alone can't find the lines: sung words run into
    each other, so pauses between them are rare.
    """
    lines: list[LyricLine] = []
    for segment in segments:
        runs: list[list[Word]] = []
        for w in segment:
            if runs and w.start - runs[-1][-1].end < LINE_GAP:
                runs[-1].append(w)
            else:
                runs.append([w])
        for run in runs:
            lines.extend(LyricLine(_tidy(part)) for part in _split_long(run))
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


def loudness_frames(y: np.ndarray, sr: int = SR) -> np.ndarray:
    """RMS of the vocal stem in 100 ms frames."""
    hop = sr // 10
    return np.array([np.sqrt(np.mean(y[i : i + hop] ** 2)) for i in range(0, len(y), hop)])


def drop_quiet_words(
    words: list[Word], y: np.ndarray, sr: int = SR, frames: np.ndarray | None = None
) -> list[Word]:
    """Remove words sung over a near-silent vocal stem (Whisper invents text over silence).

    Pass `frames` (from `loudness_frames`) when calling this repeatedly for one stem.
    """
    if not words:
        return words
    hop = sr // 10
    if frames is None:
        frames = loudness_frames(y, sr)
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
    lines = split_lines(segment_words(result["segments"], y))
    if not lines:
        return None
    return Transcript(language=language, lines=lines)


def segment_words(segments: list[dict], y: np.ndarray, sr: int = SR) -> list[list[Word]]:
    """The usable words of each Whisper segment, dropping unreliable segments and silence."""
    out: list[list[Word]] = []
    frames = loudness_frames(y, sr)
    for seg in segments:
        if seg.get("avg_logprob", 0) < MIN_AVG_LOGPROB:
            continue
        words = [
            Word(float(w["start"]), float(w["end"]), text)
            for w in seg.get("words", [])
            if (text := clean_word(w["word"]))
        ]
        words = drop_quiet_words(words, y, sr, frames)
        if words:
            out.append(words)
    return out
