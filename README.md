# Chordus

A personal chord sheet + audio pitch shift + voice-fit app for a guitarist who sings.
Paste chord sheets, transpose them, pick a capo and strumming pattern, attach audio and pitch it
to fit your voice, and confirm the settings per song so they load automatically next time.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full architecture and phase plan, and
[CLAUDE.md](CLAUDE.md) for the conventions.

## Requirements

- Node.js 22.12+
- pnpm 11 (`corepack enable` picks up the version in `package.json`)
- For the analyzer: [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 and the
  dependencies itself) and `ffmpeg` on your PATH (`winget install ffmpeg`)

## Getting started

```bash
pnpm install
cd services/analyzer && uv sync && cd ../..   # first time only: Python deps (~1 GB, mostly torch)
pnpm dev          # web app on http://localhost:3000 + analyzer on http://127.0.0.1:8000
```

`pnpm dev:web` runs only the web app; `pnpm analyzer` runs only the analyzer. The first run
migrates and seeds `data/app.db`. Optional: copy `.env.example` to `.env` to change settings.

### Faster vocal separation on an NVIDIA GPU

Demucs (vocal isolation, used for the melody range) runs on the CPU by default, at roughly
song length or a bit more (~5 minutes for a 4-minute song). With an NVIDIA GPU, install the
CUDA build of torch into the analyzer's environment; `ANALYZER_DEVICE=auto` picks it up:

```bash
cd services/analyzer
uv pip install --reinstall torch --index-url https://download.pytorch.org/whl/cu128
```

(`uv sync` puts the CPU build back.) Or set `ANALYZER_MELODY=0` to skip the melody range.

## Status

| Phase | Scope                                                              | State   |
| ----- | ------------------------------------------------------------------ | ------- |
| 0     | Monorepo, Next.js, Drizzle + libSQL, migrations, seed, lint, tests | Done    |
| 1     | Core loop: sheets, transpose, capo, strum, audio pitch, confirm    | Done    |
| 2     | Analyzer (chords from audio + YouTube)                             | Done    |
| 3     | Voice-fit learning                                                 | Not yet |
| 4     | Browser extension                                                  | Not yet |

## Using it (Phase 1)

1. **Add a song** (`Add song`): paste a sheet as chords-over-words (`[Verse]` headers, chord
   lines above lyric lines) or ChordPro. The preview shows how it will be stored; the key is
   detected from the chords if you don't set it.
2. **Song page**: transpose with − / +, pick a capo (★ marks the most playable position for the
   current key), change font size, or turn on auto-scroll (speed follows the BPM).
3. **Audio**: attach an MP3/M4A/WAV/OGG/FLAC. Pitch shifts without changing tempo; speed changes
   without changing pitch; A/B sets a loop. The link icon ties audio pitch to the chord transpose
   (using the smallest audio shift: transpose +10 plays at −2).
4. **Strumming**: choose a preset or build your own on the slot grid; the metronome highlights
   the current slot.
5. **Confirm** (or Ctrl/⌘ + Enter) saves transpose, pitch, capo and strum for the song. Values
   are marked _Suggested_, _Edited_ or _Confirmed_; ✕ logs that a suggestion was wrong.
   Confirmed songs load their settings directly; _Re-suggest_ compares with a fresh suggestion.

Until Phase 3, suggestions come from simple fallbacks: your median confirmed shift for the same
artist, then for the same vocalist type, then across all songs, else 0.

## Chords from audio (Phase 2)

1. **Add song → Audio file** or **YouTube link**. The song opens right away and shows the
   analysis progress. YouTube audio is downloaded on this machine with `yt-dlp` (personal use).
2. The analyzer detects tempo, meter, key and a chord per bar, and writes a **draft sheet**.
   Low-confidence chords are underlined. The audio becomes playable (with pitch shift) as soon
   as it's downloaded; the draft appears as soon as chords are done.
3. Vocal isolation (Demucs) + pitch tracking then measure the **vocal melody range** (p10–p90),
   which Phase 3 uses to fit songs to your voice.
4. While the analyzed audio plays, the current bar is highlighted in the sheet with a
   **Now / Next** chord strip (shown in capo shapes, compensated for the pitch shifter's delay).
5. Fix chords via **Edit chords**, then **Mark as checked**. Songs with a pasted sheet can be
   analyzed too (_Detect chords_); your sheet stays primary.

How the chord detector was chosen: [services/analyzer/spike/REPORT.md](services/analyzer/spike/REPORT.md).

## Known limitations

- Pitch shifting beyond about ±4 semitones sounds noticeably artificial (SoundTouch). The app
  warns when you go past that.
- While audio is shifted there is roughly 100 ms of extra latency (it's zero at 0 semitones).
- Edits are kept in the page until you confirm; reloading discards unconfirmed edits.
- Chord diagrams cover common chord types; unusual extensions fall back to a simpler shape or
  are listed as "no diagram".
- Detected chords are a **draft**: major/minor triads only (sevenths, sus and slash chords come
  out as the nearest triad), one or two chords per bar, and dense mixes or fast changes need
  manual fixes. Meter detection only distinguishes 3 vs 4 beats per bar.
- Detected sheets have chords only. Paste lyrics in via Edit.
- The melody range needs audible singing; instrumentals and karaoke backing tracks without a
  guide vocal get no range.
- YouTube titles are split into artist/title heuristically; check them after import.

## Scripts

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm dev`         | Run the web app and the analyzer (applies pending migrations first)   |
| `pnpm dev:web`     | Run only the web app                                                  |
| `pnpm analyzer`    | Run only the analyzer (API on :8000 + job worker)                     |
| `pnpm build`       | Production build                                                      |
| `pnpm test`        | All tests: Vitest (web + core) and pytest (analyzer)                  |
| `pnpm lint`        | ESLint (root packages + Next.js app) and ruff (analyzer)              |
| `pnpm typecheck`   | TypeScript in every workspace                                         |
| `pnpm format`      | Prettier                                                              |
| `pnpm db:migrate`  | Apply Drizzle migrations                                              |
| `pnpm db:seed`     | Seed default user, strum presets and sample public-domain songs       |
| `pnpm db:reset`    | Delete the local DB, migrate and seed again                           |
| `pnpm db:generate` | Generate a migration after editing `apps/web/src/server/db/schema.ts` |

## Layout

```
apps/web
  src/app           Pages and API route handlers (/api/songs, /api/events, ...)
  src/server        DB schema + client, services, Storage interface, voicing lookup
  src/components    UI (sheet renderer, song view, shadcn/ui primitives)
  worklets/         Pitch-shift AudioWorklet (bundled to public/worklets by esbuild)
  drizzle/          SQL migrations
packages/core       Pure TypeScript music logic (keys, chords, ChordPro, capo, strum, suggestions)
services/analyzer   Python worker (uv): yt-dlp, key/BPM/chords (librosa), Demucs + pYIN melody,
                    FastAPI /health. Picks jobs from the DB `jobs` table.
data/               Local SQLite DB and uploaded audio (git-ignored)
```

## Third-party licenses

- `soundtouchjs` (pitch shifting) is LGPL-2.1. It's used unmodified as a library.
- `@tombatossals/chords-db` (chord voicings) is MIT.
- Analyzer: librosa (ISC), Demucs (MIT), yt-dlp (Unlicense), FastAPI (MIT), torch (BSD).

## Content policy

Sheets come only from your own pasted sheets, chords detected from your audio, or
public-domain / open-licensed songbooks with the license recorded. Nothing is scraped from
Ultimate Guitar or other copyrighted chord sites.
