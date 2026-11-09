# Chord-detection spike

**Status:** synthetic songs only. The real-song run is waiting on 5 labelled songs (see
[songs/README.md](songs/README.md)). Re-run with `uv run python -m analyzer.spike`.

## What was compared

| Detector | How it works | Runs on Windows? |
| --- | --- | --- |
| `librosa-hmm` (default) | Harmonic/percussive separation → log-compressed CQT chroma → beat-synchronous median → cosine match against 24 major/minor templates with a small key-aware prior → Viterbi smoothing over beats | Yes (native) |
| `essentia` | Essentia HPCP (36 bins) → `ChordsDetectionBeats` on the same beat grid, default settings | No: Linux/macOS wheels only, run via `spike/Dockerfile.essentia` |

Both use the same beat tracker (librosa) and the same bar logic, so the difference is the
chord model only.

## Synthetic set (6 songs, exact ground truth)

Rendered by `analyzer/synth.py`: plucked-string strums, bass, kick/snare and a voice-like
melody. Scores are the share of time where the chord root and major/minor match ("triad"
level, the usual MIREX baseline). "Per bar" is the draft sheet the app shows.

| Song | librosa-hmm (beat / bar) | essentia (beat / bar) |
| --- | ---: | ---: |
| pop I–V–vi–IV (G, 96 BPM) | 99% / 99% | 45% / 55% |
| minor ballad (Am, 72 BPM) | 99% / 99% | 46% / 33% |
| folk waltz 3/4 (D, 120 BPM) | 94% / 98% | 43% / 41% |
| rock, changes every 2 beats (E, 132 BPM) | 96% / 96% | 64% / 47% |
| seventh chords (C, 88 BPM) | 95% / 95% | 41% / 29% |
| flat key (Bb, 104 BPM) | 99% / 99% | 60% / 77% |
| **Mean** | **97% / 98%** | **50% / 47%** |

Key: 6/6 correct for both. Tempo: 6/6 within 4%. Meter: the waltz was detected as 3/4.

Raw tables: [synthetic-librosa.md](synthetic-librosa.md), [synthetic-essentia.md](synthetic-essentia.md).

## Decision

Use **`librosa-hmm`** as the default: it's clearly better on this set, runs natively on
Windows, and needs no Docker. Essentia stays available as a pluggable backend; it may do
better with tuned parameters or on real mixes, which the real-song run will show.

What changed during the spike: the first version scored 57% on the fast-changing rock song.
The CQT was dominated by the bass root, so the third and fifth barely registered. Log-
compressing the CQT and loosening the HMM's stay probability fixed it (57% → 96%) without
hurting the other songs.

## Update: stem-based detector (now the default)

Real recordings exposed what the synthetic set couldn't: vocals and drums pull the chroma off
the chords. `StemChordDetector` (`analysis/chords_stems.py`) listens to the Demucs "other" stem
for chord colour and the bass stem for the root, corrects tuning, and adds 7, maj7 and m7 chords
with a preference for simple, in-key chords. It scores 98% at beat resolution on the synthetic
set (triad level). On real songs the output was only inspected for plausibility and repetition, as no
labelled real songs exist yet: "Leave the Door Open" went from scattered triads to a stable,
repeating progression. `librosa-hmm` remains the fallback when stems are unavailable.

## Caveats

- Synthetic audio is far cleaner than real mixes (no vocals masking the harmony, perfect
  tuning, steady tempo). Expect noticeably lower numbers on real songs, typically 60–80% at
  triad level for pop/folk.
- `librosa-hmm` knows major/minor triads only. Sevenths, sus and slash chords come out as the
  nearest triad (Cmaj7 → C), which is why detected sheets are drafts.
- Tuning was done on this same set, so these numbers are optimistic.
