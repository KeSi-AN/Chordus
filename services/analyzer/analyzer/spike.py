"""Chord-detection spike: score every available detector on a labelled dataset.

    uv run python -m analyzer.spike                 # synthetic set + any songs in spike/songs
    uv run python -m analyzer.spike --songs PATH    # a different folder of real songs

A real song is `<name>.mp3|.m4a|.wav|.flac` next to `<name>.lab` with one chord per line:
    0.00 4.12 G        (or MIREX style: 0.00 4.12 G:maj, 4.12 8.30 E:min, N for no chord)
and optionally `<name>.key` containing the key (e.g. `G` or `Em`).
Scores reduce chords to root + major/minor ("triad" level), the usual MIREX baseline.
"""

from __future__ import annotations

import argparse
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from .analysis import analyze_harmony
from .analysis.chords import ChordDetector, available_detectors
from .audio import load_mono, to_wav
from .synth import DATASET, render_song

AUDIO_EXTS = (".mp3", ".m4a", ".wav", ".flac", ".ogg", ".webm")
ENHARMONIC = {"Db": "C#", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb", "Cb": "B", "Fb": "E"}


def triad(label: str) -> str:
    """'G:maj' / 'G' / 'Gmaj7' -> 'G'; 'E:min7' / 'Em7' -> 'Em'; 'N' -> 'N'."""
    label = label.strip()
    if label in ("N", "X", "N.C.", ""):
        return "N"
    if ":" in label:
        root, quality = label.split(":", 1)
        minor = quality.startswith("min") or quality == "dim"
    else:
        root = label[:2] if len(label) > 1 and label[1] in "#b" else label[:1]
        rest = label[len(root) :].split("/")[0]
        minor = rest.startswith("m") and not rest.startswith("maj")
    root = ENHARMONIC.get(root, root)
    return root + ("m" if minor else "")


def key_name(label: str) -> str:
    k = label.strip().replace(" minor", "m").replace(" major", "")
    return triad(k)


@dataclass
class Song:
    name: str
    audio_path: Path | None
    labels: list[tuple[float, float, str]]
    key: str | None
    bpm: float | None
    y: object = None
    sr: int = 22050


def read_lab(path: Path) -> list[tuple[float, float, str]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) >= 3 and not line.lstrip().startswith("#"):
            out.append((float(parts[0]), float(parts[1]), parts[2]))
    return out


def synthetic_songs() -> list[Song]:
    songs = []
    for i, (name, key, bpm, bpb, prog) in enumerate(DATASET):
        s = render_song(prog, bpm=bpm, key=key, beats_per_bar=bpb, seed=i)
        songs.append(Song(f"synth/{name}", None, s.labels, key, bpm, s.audio, s.sr))
    return songs


def real_songs(folder: Path, tmp: Path) -> list[Song]:
    songs = []
    if not folder.is_dir():
        return songs
    for audio in sorted(p for p in folder.iterdir() if p.suffix.lower() in AUDIO_EXTS):
        lab = audio.with_suffix(".lab")
        if not lab.exists():
            print(f"  skipping {audio.name}: no {lab.name}")
            continue
        key_file = audio.with_suffix(".key")
        wav = to_wav(audio, tmp / f"{audio.stem}.wav", sr=22050, mono=True)
        y, sr = load_mono(wav)
        key = key_file.read_text().strip() if key_file.exists() else None
        songs.append(Song(audio.stem, audio, read_lab(lab), key, None, y, sr))
    return songs


def time_accuracy(
    predicted: list[tuple[float, float, str]], truth: list[tuple[float, float, str]]
) -> float:
    total = correct = 0.0
    for s, e, gt in truth:
        total += e - s
        g = triad(gt)
        for ps, pe, pc in predicted:
            ov = min(e, pe) - max(s, ps)
            if ov > 0 and triad(pc) == g:
                correct += ov
    return correct / total if total else 0.0


@dataclass
class Score:
    song: str
    detector: str
    beat_acc: float
    bar_acc: float
    key_ok: bool | None
    tempo_ok: bool | None
    seconds: float


def evaluate(song: Song, detector: ChordDetector) -> Score:
    t0 = time.perf_counter()
    r = analyze_harmony(song.y, song.sr, detector)  # type: ignore[arg-type]
    elapsed = time.perf_counter() - t0
    bc = r.beat_chords
    beat_pred = [
        (float(bc.times[i]), float(bc.times[i + 1]), bc.labels[i]) for i in range(len(bc.labels))
    ]
    bar_pred = [(t.start, t.end, t.chord) for t in r.bars]
    key_ok = None if song.key is None else key_name(r.key.key) == key_name(song.key)
    tempo_ok = None
    if song.bpm:
        ratios = (r.bpm / song.bpm, r.bpm * 2 / song.bpm, r.bpm / 2 / song.bpm)
        tempo_ok = any(abs(x - 1) < 0.04 for x in ratios)
    return Score(
        song.name,
        detector.name,
        time_accuracy(beat_pred, song.labels),
        time_accuracy(bar_pred, song.labels),
        key_ok,
        tempo_ok,
        elapsed,
    )


def fmt(v: bool | None) -> str:
    return "–" if v is None else ("yes" if v else "no")


def report(scores: list[Score]) -> str:
    lines = [
        "| Song | Detector | Chords (per beat) | Chords (per bar, draft) | Key | Tempo | Time |",
        "| --- | --- | ---: | ---: | :-: | :-: | ---: |",
    ]
    for s in scores:
        lines.append(
            f"| {s.song} | {s.detector} | {s.beat_acc:.0%} | {s.bar_acc:.0%} | "
            f"{fmt(s.key_ok)} | {fmt(s.tempo_ok)} | {s.seconds:.1f}s |"
        )
    lines += [
        "",
        "| Detector | Mean chords (beat) | Mean chords (bar) | Key | Songs |",
        "| --- | ---: | ---: | :-: | ---: |",
    ]
    for det in sorted({s.detector for s in scores}):
        ds = [s for s in scores if s.detector == det]
        keys = [s.key_ok for s in ds if s.key_ok is not None]
        lines.append(
            f"| {det} | {sum(s.beat_acc for s in ds) / len(ds):.0%} | "
            f"{sum(s.bar_acc for s in ds) / len(ds):.0%} | "
            f"{sum(keys)}/{len(keys)} | {len(ds)} |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    here = Path(__file__).resolve().parents[1] / "spike"
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--songs", type=Path, default=here / "songs")
    ap.add_argument("--no-synth", action="store_true")
    ap.add_argument("--detectors", nargs="*", help="default: all available")
    ap.add_argument("--out", type=Path, default=None, help="write the markdown report here")
    args = ap.parse_args(argv)

    detectors = available_detectors()
    if args.detectors:
        detectors = {k: v for k, v in detectors.items() if k in args.detectors}
    print("Detectors:", ", ".join(detectors) or "none")

    with tempfile.TemporaryDirectory() as tmp:
        songs = ([] if args.no_synth else synthetic_songs()) + real_songs(args.songs, Path(tmp))
        scores = []
        for song in songs:
            for det in detectors.values():
                print(f"  {song.name} × {det.name} …", flush=True)
                scores.append(evaluate(song, det))
    text = report(scores)
    print()
    print(text)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
