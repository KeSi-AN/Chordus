# Real songs for the chord-detection spike

Put your test songs here (this folder is git-ignored except for this file):

- `my-song.mp3` (or .m4a / .wav / .flac)
- `my-song.lab`: ground-truth chords, one per line: `start end chord`, e.g.

  ```
  0.00 3.95 N
  3.95 7.90 G
  7.90 11.85 Em
  ```

  Chords can be plain (`G`, `Em`, `F#m7`) or MIREX style (`G:maj`, `E:min`). Only root and
  major/minor are scored.

- `my-song.key` (optional): the key, e.g. `G` or `Em`.

Then run from `services/analyzer`:

```bash
uv run python -m analyzer.spike --out spike/real-librosa.md
```

Tip: an easy way to make a `.lab` is to load the song in Audacity, add a label track, mark
each chord change, then File → Export → Labels and change the file extension to `.lab`.
Audacity label files use the same `start end text` layout.
