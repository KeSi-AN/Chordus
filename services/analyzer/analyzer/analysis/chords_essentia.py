"""Essentia chord detector (HPCP + ChordsDetectionBeats). Linux/macOS only: Essentia has no
Windows wheels, so on Windows this runs inside Docker (see spike/README.md)."""

from __future__ import annotations

import essentia.standard as es  # noqa: F401  (ImportError here means "not available")
import numpy as np

from .chords import NO_CHORD, BeatChords


def _normalize(label: str) -> str:
    if label in ("N", "N.C.", ""):
        return NO_CHORD
    root = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
    rest = label[len(root) :]
    root = {"A#": "Bb", "D#": "Eb", "G#": "Ab", "Db": "C#", "Gb": "F#"}.get(root, root)
    return root + ("m" if rest.startswith("m") else "")


class EssentiaDetector:
    name = "essentia"

    def detect(
        self, y: np.ndarray, sr: int, beat_frames: np.ndarray, key: tuple[int, str] | None
    ) -> BeatChords:
        import librosa

        target_sr = 44100
        audio = librosa.resample(y, orig_sr=sr, target_sr=target_sr) if sr != target_sr else y
        audio = audio.astype(np.float32)
        frame, hop = 4096, 2048
        window = es.Windowing(type="blackmanharris62")
        spectrum = es.Spectrum()
        peaks = es.SpectralPeaks(
            orderBy="magnitude",
            magnitudeThreshold=1e-5,
            minFrequency=40,
            maxFrequency=5000,
            maxPeaks=100,
            sampleRate=target_sr,
        )
        hpcp = es.HPCP(size=36, referenceFrequency=440, harmonics=8, sampleRate=target_sr)
        frames = []
        for f in es.FrameGenerator(audio, frameSize=frame, hopSize=hop, startFromZero=True):
            freqs, mags = peaks(spectrum(window(f)))
            frames.append(hpcp(freqs, mags))
        hpcps = np.array(frames, dtype=np.float32)

        ticks = librosa.frames_to_time(beat_frames, sr=sr, hop_length=512).astype(np.float32)
        detect = es.ChordsDetectionBeats(hopSize=hop, sampleRate=target_sr)
        chords, strength = detect(hpcps, ticks)
        # One label per interval between consecutive ticks; add a lead-in before the first beat.
        duration = len(y) / sr
        times = np.concatenate([[0.0], ticks, [duration]])
        labels = [NO_CHORD] + [_normalize(c) for c in chords]
        labels += [labels[-1]] * (len(times) - 1 - len(labels))
        conf = np.concatenate([[0.0], np.clip(np.asarray(strength, dtype=float), 0, 1)])
        conf = np.pad(conf, (0, len(labels) - len(conf)), constant_values=conf[-1])
        return BeatChords(
            labels=labels[: len(times) - 1], confidences=conf[: len(times) - 1], times=times
        )
