# Chordus

A personal chord sheet + audio pitch shift + voice-fit app for a guitarist who sings.
Paste chord sheets, transpose them, pick a capo and strumming pattern, attach audio and pitch it
to fit your voice, and confirm the settings per song so they load automatically next time.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full architecture and phase plan, and
[CLAUDE.md](CLAUDE.md) for the conventions.

## Requirements

- Node.js 22.12+
- pnpm 11 (`corepack enable` picks up the version in `package.json`)

## Getting started

```bash
pnpm install
pnpm dev          # migrates + seeds data/app.db on first run, then serves http://localhost:3000
```

Optional: copy `.env.example` to `.env` to change the database URL or data folder.

## Status

| Phase | Scope                                                              | State   |
| ----- | ------------------------------------------------------------------ | ------- |
| 0     | Monorepo, Next.js, Drizzle + libSQL, migrations, seed, lint, tests | Done    |
| 1     | Core loop: sheets, transpose, capo, strum, audio pitch, confirm    | Done    |
| 2     | Analyzer (chords from audio + YouTube)                             | Not yet |
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

## Known limitations

- Pitch shifting beyond about ±4 semitones sounds noticeably artificial (SoundTouch). The app
  warns when you go past that.
- While audio is shifted there is roughly 100 ms of extra latency (it's zero at 0 semitones).
- Edits are kept in the page until you confirm; reloading discards unconfirmed edits.
- Chord diagrams cover common chord types; unusual extensions fall back to a simpler shape or
  are listed as "no diagram".

## Scripts

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm dev`         | Run the web app (applies pending migrations first)                    |
| `pnpm build`       | Production build                                                      |
| `pnpm test`        | Run all unit tests (Vitest, all workspaces)                           |
| `pnpm lint`        | ESLint (root packages + Next.js app)                                  |
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
data/               Local SQLite DB and uploaded audio (git-ignored)
```

## Third-party licenses

- `soundtouchjs` (pitch shifting) is LGPL-2.1. It's used unmodified as a library.
- `@tombatossals/chords-db` (chord voicings) is MIT.

## Content policy

Sheets come only from your own pasted sheets, chords detected from your audio, or
public-domain / open-licensed songbooks with the license recorded. Nothing is scraped from
Ultimate Guitar or other copyrighted chord sites.
