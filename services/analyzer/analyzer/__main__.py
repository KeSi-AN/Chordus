"""CLI: `chordus-analyzer serve` (API + worker), `worker` (worker only), `analyze FILE` (debug)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import tempfile
from pathlib import Path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="chordus-analyzer")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("serve", help="Run the FastAPI health endpoint and the job worker (default)")
    sub.add_parser("worker", help="Run only the job worker")
    a = sub.add_parser("analyze", help="Analyze one audio file and print the result as JSON")
    a.add_argument("file", type=Path)
    a.add_argument("--melody", action="store_true", help="also run Demucs + pYIN")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    from .config import load_config

    cfg = load_config()
    cmd = args.cmd or "serve"

    if cmd == "serve":
        import uvicorn

        from .server import create_app

        uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level="info")
    elif cmd == "worker":
        from .worker import Worker

        Worker(cfg).run_forever()
    elif cmd == "analyze":
        from .analysis import analyze_harmony
        from .audio import load_mono, to_wav
        from .draft import build_draft

        with tempfile.TemporaryDirectory() as tmp:
            wav = to_wav(args.file, Path(tmp) / "mix.wav", sr=44100)
            y, sr = load_mono(wav)
            h = analyze_harmony(
                y, sr, progress=lambda s, f: print(f"[{f:4.0%}] {s}", file=sys.stderr)
            )
            result = {
                "key": h.key.key,
                "keyConfidence": h.key.confidence,
                "bpm": h.bpm,
                "timeSignature": h.time_signature,
                "duration": round(h.duration, 2),
                "bars": [t.as_json() for t in h.bars],
            }
            if args.melody:
                from .melody import separate_vocals, track_melody

                vocals = separate_vocals(wav, Path(tmp) / "vocals.wav", device=cfg.device)
                rng = track_melody(vocals)
                result["melody"] = rng.__dict__ if rng else None
            print(json.dumps(result, indent=2))
            print(
                build_draft(
                    h.bars,
                    title=args.file.stem,
                    artist=None,
                    key=h.key.key,
                    bpm=h.bpm,
                    time_signature=h.time_signature,
                ),
                file=sys.stderr,
            )


if __name__ == "__main__":
    main()
