# Songbird (working name): Personal Chord Sheet + Pitch + Voice-Fit App

> **For Claude Code:** This is the full architecture and build plan. Build **one phase at a time**, starting with Phase 0 and Phase 1. At the end of each phase, stop, summarize what was built, list the open questions, and wait for me before starting the next phase. Create a `CLAUDE.md` in the repo from the "Conventions" section so the rules carry across sessions.

---

## 1. What I'm building and why

I play guitar and sing. Today I use:
- **Ultimate Guitar**: chord sheets, transposing, strumming patterns, a huge library.
- **A browser extension** that pitches YouTube audio up or down (mostly karaoke videos) to fit my voice.

I want one app that does both. It should also learn my vocal range from how I use it and **pre-fill** the right key and pitch for each song. I can edit any pre-filled value, then **confirm** it. Once confirmed, it's saved and loads automatically next time.

### Core features
1. **Chord sheets** in an Ultimate Guitar-style view (chords above lyrics), with **transpose**, **capo** suggestions, and **strumming patterns**.
2. **Audio pitch shift**: for uploaded audio files and YouTube videos, without changing tempo.
3. **Chords from audio**: upload a file or paste a YouTube link, get a draft chord sheet (key, BPM, chord timeline).
4. **Voice-fit learning**: learn my comfortable range from what I confirm, and suggest the transpose and pitch for new songs.
5. **Suggest, edit, confirm**: every suggested value is marked as a suggestion, can be edited, and is saved per song once I confirm it.
6. **Browser extension**: pitch-shift any YouTube video, and apply my saved pitch for that video automatically.

### Hard constraints
- **No scraping or copying Ultimate Guitar** (or any other copyrighted chord site). Content comes from (a) my own pasted or imported sheets, (b) chords detected from audio, (c) public-domain or open-licensed songbooks with the license recorded.
- **Local-first.** It runs on my laptop for the MVP. Later it moves to Vercel. Design for that move from day one (see section 9).
- **Single user for now**, but keep a `userId` on user-owned tables so multiple users can be added later without a migration headache.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web app | **Next.js (App Router) + TypeScript + Tailwind** | Deploys to Vercel with no changes |
| UI components | shadcn/ui | Fast, accessible, easy to restyle |
| DB | **SQLite via libSQL + Drizzle ORM** | A local file now, Turso (hosted libSQL) later with the same driver |
| Chord sheet parsing/transposing | **ChordPro as the storage format**; `chordsheetjs` for parsing, formatting, transposing | Industry-standard format. Parses "chords over words" (UG-style) text too |
| Audio playback + pitch shift (web) | Web Audio API + **SoundTouch** (`soundtouchjs`) in an AudioWorklet; evaluate Rubber Band WASM if quality isn't good enough | Changes pitch without changing tempo, in the browser |
| Mic pitch detection (range test) | `pitchy` (McLeod pitch method) | Small and accurate enough for voice |
| Analysis worker | **Python 3.11 + FastAPI** | The audio ML tooling lives in Python |
| Key / BPM / chords | **Essentia** (`KeyExtractor`, `RhythmExtractor2013`, `ChordsDetection` on HPCP). Run a quick spike against one or two alternatives before committing | Proven MIR algorithms |
| Vocal isolation | **Demucs** (htdemucs) | Isolates vocals so the melody range is measured cleanly |
| Melody pitch tracking | **torchcrepe** or librosa `pyin` | Gets the vocal melody's note range |
| YouTube audio (worker) | `yt-dlp` + `ffmpeg` | Personal use, on my own machine |
| Job queue | Simple DB-backed job table polled by the worker (no Redis for the MVP) | Fewer moving parts |
| Extension | **Chrome Manifest V3**, TypeScript, built with Vite (`@crxjs/vite-plugin`) | Same toolchain as the web app |
| Monorepo | **pnpm workspaces** (`apps/web`, `apps/extension`, `services/analyzer`, `packages/core`) | Shared types and music logic |
| Tests | Vitest (TS), pytest (Python), Playwright (a few end-to-end smoke tests) | |

---

## 3. Architecture

```
┌────────────────────────── Browser ───────────────────────────┐
│                                                              │
│  Next.js web app                    Chrome extension (MV3)   │
│  ├─ Library / search                ├─ content script on     │
│  ├─ Song view (sheet, transpose,    │   youtube.com: hooks   │
│  │   capo, strum, synced chords)    │   <video> → WebAudio   │
│  ├─ Player (file/YT-extracted       │   → SoundTouch worklet │
│  │   audio + pitch shift)           ├─ popup: ±semitones,    │
│  ├─ Suggest/confirm panel           │   confirm, open in app │
│  └─ Voice profile + range test      └─ background SW: talks  │
│              │                          to the web app API   │
└──────────────┼──────────────────────────────┼────────────────┘
               │  HTTP (Next.js route handlers)│
        ┌──────▼──────────────────────────────▼──────┐
        │  Next.js API  (apps/web/app/api/*)         │
        │  songs, sheets, prefs, events, suggestions │
        │  analysis jobs, extension endpoints        │
        └──────┬─────────────────────────┬───────────┘
               │ Drizzle                 │ job rows
        ┌──────▼──────┐          ┌───────▼─────────────────┐
        │ SQLite/libSQL│◄────────┤ Python analyzer worker  │
        │ (Turso later)│ results │ yt-dlp → ffmpeg →       │
        └─────────────┘          │ key/BPM/chords (Essentia)│
                                 │ Demucs → vocal pitch     │
        ┌─────────────┐          │ range (torchcrepe/pyin)  │
        │ File storage │◄────────┤                          │
        │ ./data/audio │  audio  └──────────────────────────┘
        │ (Blob/R2 later)
        └─────────────┘
```

**Key design point:** the web app cannot touch the audio inside an embedded YouTube iframe (it's cross-origin). So:
- **In the web app**, YouTube songs are pitch-shifted by playing the audio the worker extracted, through our own player.
- **On youtube.com**, pitch shifting happens in the **extension**, which hooks the page's `<video>` element directly (the same way existing pitch extensions work).

Both paths read and write the same per-song preferences, keyed by YouTube video ID.

---

## 4. Shared music logic: `packages/core`

Pure TypeScript with no I/O, fully unit-tested. Used by the web app and the extension.

- `transpose(chord, semitones, targetKey)`: correct sharp/flat spelling for the target key (e.g. B♭ not A♯ in F major). Handles slash chords, extensions (`maj7`, `sus4`, `add9`, `m7b5`), and `N.C.`.
- `transposeSheet(chordpro, semitones)`.
- `detectKeyFromChords(chords[])`: fallback key guess for pasted sheets.
- `capoOptions(key)`: list (capo fret, shape key) pairs and rank them by **playability**. Prefer open-chord keys G, C, D, A, E, Em, Am; penalize barre-heavy shapes.
- `parseChordsOverWords(text)` → ChordPro: handles the common pasted format with `[Verse]`/`[Chorus]` headers and chord lines above lyric lines.
- `noteToMidi`, `midiToNote`, interval helpers.
- `suggestTransposition(...)`: the voice-fit engine (section 6). It lives here so it's testable and the extension can use it offline.
- Strumming pattern model and helpers (section 5.4).

---

## 5. Data model (Drizzle schema, SQLite)

All user-owned tables have `userId` (a single default user for now). Timestamps are on everything.

```
users            id, name, createdAt

songs            id, userId, title, artist, originalKey, bpm, timeSignature,
                 durationSec, vocalistHint ('male'|'female'|'unknown'),
                 createdAt, updatedAt

sources          id, songId, kind ('file'|'youtube'|'import'|'manual'),
                 youtubeVideoId?, filePath?, originalFilename?,
                 license?, attribution?, sourceUrl?

chord_sheets     id, songId, chordpro (text), origin ('detected'|'pasted'|
                 'imported_open'|'edited'), isPrimary, createdAt
                 -- keep versions; editing creates a new row, marks it primary

analyses         id, songId, sourceId, status ('queued'|'running'|'done'|'failed'),
                 error?, key, keyConfidence, bpm, chordTimeline (JSON:
                 [{start,end,chord,confidence}]), melodyLowMidi, melodyHighMidi,
                 melodyP10Midi, melodyP90Midi, vocalStemPath?, createdAt

song_prefs       id, userId, songId,
                 -- one row per song; each field has a value + state
                 transposeSemitones, transposeState,
                 audioPitchSemitones, audioPitchState,
                 capoFret, capoState,
                 strumPatternId, strumState,
                 (state = 'suggested' | 'edited' | 'confirmed'),
                 suggestionMeta (JSON: source, confidence, reason text),
                 confirmedAt, updatedAt

strum_patterns   id, userId?, name, timeSignature, subdivision,
                 pattern (e.g. "D-DU-UDU"), isPreset

events           id, userId, songId?, type, payload (JSON), createdAt
                 -- types: search, open_song, play, transpose_change,
                 --        pitch_change, confirm, reject_suggestion,
                 --        range_test_result, extension_pitch_apply

voice_profile    userId, comfortLowMidi, comfortHighMidi, maxLowMidi,
                 maxHighMidi, confidence, sampleCount, updatedAt
                 -- derived; recomputable from events + song_prefs

jobs             id, type ('analyze'), payload (JSON), status, attempts,
                 lockedAt, createdAt
```

### 5.1 Why audio pitch and chord transpose are separate fields
They are linked but not identical:
- **Chord transpose** only matters mod 12. Transposing −2 and +10 give the same chords, and a capo changes the shapes, not the sound.
- **Audio pitch** is an actual semitone shift. −2 sounds very different from +10.
- Default: they're **linked** (changing one updates the other, using the smallest absolute audio shift). An "unlink" toggle covers cases like singing an octave down, or playing along at original pitch but in a different shape.

### 5.2 Strumming patterns
- Ship ~15 common presets (4/4 and 3/4, e.g. `D-D-U-U-D-U`, `D-DU-UDU`, waltz `D-D-U-D-U`).
- Visual editor: a grid of 8ths or 16ths, click to toggle D / U / muted / rest.
- The analyzer's BPM and time signature pre-fill the pattern grid and a click metronome. The pattern itself is a **suggestion** (based on the time signature), not detected; detecting strumming from audio is unreliable and out of scope.

---

## 6. Voice-fit engine (the "learns my voice" part)

### 6.1 Signals
1. **Confirmed song prefs (strongest).** If I confirm song S at audio shift `t`, and S's vocal melody range is `[p10, p90]`, then my implied singing range for that song is `[p10 + t, p90 + t]`.
2. **Range test (cold start).** An optional 30-second mic test: hum or sing your lowest comfortable note, highest comfortable note, and then a few more. Stored as an event.
3. **Edits and rejections.** If I reject a suggestion of +2 and confirm 0, that's evidence the suggestion was too high. Weight it lower than a confirmation.
4. **Searches and plays (weak).** Only used to weight recency and decide which songs to analyze in the background. They don't change the range directly.

### 6.2 Profile estimation
- Collect the implied ranges from confirmed songs that have melody data.
- `comfortLow` = weighted median of the implied p10 values; `comfortHigh` = weighted median of the implied p90 values. Use recency weighting (half-life of about 90 days), so the profile follows my voice as it changes.
- `maxLow` / `maxHigh` come from the min/max of the implied low/high and the range test.
- `confidence` grows with sample count and shrinks as the spread widens.
- Recompute on every confirmation. It's cheap.

### 6.3 Suggesting a shift for a new song
Given the song's melody `[p10, p90]` and the profile:

```
for t in -7..+7 (and t±12 candidates if the melody can't fit):
    shifted = [p10+t, p90+t]
    cost =  w1 * semitones_outside(shifted, comfortRange)
          + w2 * semitones_outside(shifted, maxRange) * 3
          + w3 * |t|                         # prefer smaller shifts (audio quality)
          + w4 * guitarUnfriendliness(key+t)  # prefer open-chord keys, or note the capo fix
pick the lowest cost; also return the runner-up
```
- **Octave handling:** if the song is far outside my range (e.g. a female-vocal song for a male singer), consider "sing an octave down." That means the chords transpose by `t`, the audio shifts by `t − 12`, or the audio is left alone. Explain this choice in the reason text.
- **Fallbacks when no melody data exists** (e.g. a pasted sheet with no audio):
  1. My median confirmed shift for the **same artist**.
  2. My median confirmed shift for songs with the same `vocalistHint`.
  3. Key-based heuristic: shift the original key toward the median key I end up confirming.
  4. Otherwise 0, with a low-confidence label.
- Every suggestion returns `{ semitones, capo, confidence, reason }`, e.g. *"−2: puts the chorus peak at D4, inside your comfortable range (based on 14 songs). Capo 2 with C shapes."*

### 6.4 Tests
The engine must have table-driven unit tests: cold start, an obvious fit, an octave-down case, conflicting history, recency drift, and a no-melody fallback.

---

## 7. Suggest → edit → confirm UX

This is the interaction pattern across the app:

- Every suggested field shows a **"Suggested"** chip (with its reason on hover or tap) and a muted style.
- Editing changes the chip to **"Edited"** (not saved as a preference yet).
- A single **"Confirm"** button (and a keyboard shortcut) saves the current values, sets the state to `confirmed`, logs a `confirm` event, and triggers a profile recompute.
- A per-field **"✕ Not right"** button logs a `reject_suggestion` event.
- **Confirmed values always win.** Opening a confirmed song loads the confirmed values directly with a **"Confirmed"** chip and no re-suggesting. A small "Re-suggest" link lets me compare against what the engine would pick now.
- The same flow applies to **detected chord sheets**: detected chords are suggestions. Low-confidence chords are underlined so I know where to check. Editing and confirming a sheet saves it as the primary version.

---

## 8. Feature details by screen

**Library / home**
- Search by title or artist (SQLite FTS5), plus filters: confirmed / unconfirmed, has audio, key.
- "Recently played" and "Needs confirming" sections.
- Add a song via: paste a sheet · upload audio · paste a YouTube link · browse the open songbook.

**Song view**
- Sheet rendered UG-style (chords above lyrics), with sections, a font size control, auto-scroll (speed derived from BPM), and dark mode.
- Toolbar: Transpose −/+, current key, capo picker (with ranked suggestions), strum pattern, link/unlink audio pitch.
- Chord diagrams for every chord in the sheet (guitar voicings from a small static voicing DB; `@tombatossals/chords-db` is an option, check its license).
- If audio exists: a player with pitch ± and tempo (speed) control, A–B loop, and **synced chord highlighting** from the chord timeline.
- Suggest/confirm panel (section 7).

**Add from audio / YouTube**
- Submit → job queued → progress state (polling every 2s is fine) → draft sheet with chords per bar (from the beat grid), key, BPM, and melody range.
- Detected sheets have **chords only**. I can paste lyrics and the app aligns chord changes to lines manually (drag chords onto words). Automatic lyric transcription (Whisper) is a stretch goal, for personal use only.

**Voice profile page**
- A visualization of my range on a piano roll: comfortable band, max band, and dots for each confirmed song.
- Run the range test, reset the profile, and see the history of confirmations.

---

## 9. Local now, Vercel later

Design for the move from day one:
- **DB:** use the libSQL client everywhere. Locally: `file:./data/app.db`. Hosted: a Turso URL plus a token, set via env. Run Drizzle migrations against both.
- **File storage:** a `Storage` interface with a `LocalStorage` implementation (`./data/audio`) now, and a `BlobStorage` implementation (Vercel Blob or Cloudflare R2) later.
- **Analyzer:** cannot run on Vercel (Python, Demucs, ffmpeg, long jobs). It stays a **separate service**: local now, then Railway / Fly.io / Modal (GPU optional) later. It talks to the DB and storage via env config only.
- **YouTube extraction on a hosted server** is often blocked by YouTube. Plan for it: when hosted, the extension or a locally running worker can do the extraction, or I upload the audio file myself. Keep `yt-dlp` behind an interface so the strategy can change.
- **Auth:** none locally. When hosting, add Auth.js with a single allowed email (or a password via env) and protect every API route. The extension authenticates with a personal API token generated in settings.
- **Env:** `.env.example` with every variable documented; no secrets in the repo.

---

## 10. Browser extension (`apps/extension`)

- **Content script on `youtube.com`:**
  - Finds the `<video>` element and routes it through `createMediaElementSource` → SoundTouch AudioWorklet → destination. Guard against calling `createMediaElementSource` twice on the same element.
  - Handles YouTube's single-page navigation (`yt-navigate-finish`) and re-applies settings per video ID.
  - Small, collapsible on-page overlay: current shift, −/+, reset, "Confirm for this video", "Open chords in app".
- **Popup:** the same controls, plus connection status to the web app.
- **Background service worker:** calls the web app API (`http://localhost:3000` now, a configurable URL later) with the API token:
  - `GET /api/ext/prefs?yt=<videoId>` → the confirmed or suggested pitch for this video.
  - `POST /api/ext/events` → pitch changes and confirmations, which feed the same learning loop.
  - `POST /api/ext/analyze` → "analyze this video", which queues a job.
- **Permissions:** keep them minimal: `storage`, host permissions for `youtube.com` and the app origin.
- Works offline: if the app is unreachable, pitching still works and events are queued in `chrome.storage` until the app is back.
- Phase 4 only needs YouTube. Generalizing to any `<video>`/`<audio>` element is a later stretch goal.

---

## 11. Open-licensed songbook import

- An importer script (`pnpm import:songbook <path>`) that accepts ChordPro or chords-over-words files.
- Every imported song **must** have `license`, `attribution`, and `sourceUrl` set. The importer refuses files without them.
- Only use sources whose license I've checked (public-domain traditional songs, or collections that explicitly allow reuse). Claude Code should **not** fetch or scrape sources on its own. It should build the importer and a small hand-written sample set of clearly public-domain songs (e.g. traditional folk songs) for testing, and I'll add real collections.

---

## 12. Build phases

### Phase 0: Scaffolding
- pnpm monorepo, TypeScript strict, ESLint + Prettier, Vitest, `CLAUDE.md`, `.env.example`, README with run steps.
- Next.js app, Drizzle + libSQL setup, the first migration, and a seed script with the default user, strum presets, and 3 sample public-domain songs.
- **Done when:** `pnpm dev` runs the app and `pnpm test` passes.

### Phase 1: Core loop (MVP)
- `packages/core`: transpose, key spelling, capo ranking, chords-over-words → ChordPro parser, with thorough tests.
- Library, search, and the add-song flow (paste a sheet).
- Song view: UG-style rendering, transpose, capo, chord diagrams, strum pattern picker and editor, auto-scroll.
- **Local audio file upload + player with pitch shift** (SoundTouch worklet) and speed control, linked or unlinked to transpose.
- Suggest/edit/confirm system with `song_prefs` states and the event log. In this phase suggestions come only from the simple fallbacks (artist median / global median), since there's no melody data yet.
- **Done when:** I can paste a sheet, transpose it, attach an MP3, pitch it, confirm, reload the page and see my confirmed settings.

### Phase 2: Analyzer (chords from audio + YouTube)
- FastAPI service, job polling, yt-dlp + ffmpeg extraction, Essentia key/BPM/chords, beat-grid chord-per-bar draft sheet.
- Demucs vocal stem + torchcrepe/pyin → melody range stored on `analyses`.
- Web: add from file or YouTube link, job progress, draft sheet with low-confidence chord markers, synced chord highlighting during playback.
- Start with a spike: test the chord detection options on 5 songs I supply and report accuracy before wiring everything.
- **Done when:** pasting a YouTube link gives me a playable, pitch-shiftable song with a draft chord sheet in a few minutes.

### Phase 3: Voice-fit learning
- Profile estimation, the full suggestion engine (section 6), reason text, the range test with `pitchy`, and the voice profile page.
- Background: when a song is confirmed and has no melody data yet, queue an analysis so it can contribute to the profile.
- **Done when:** after confirming about 10 songs, a new song opens with a sensible pre-filled shift and a clear reason.

### Phase 4: Browser extension
- Everything in section 10, plus the API token flow in app settings.
- **Done when:** opening a karaoke video on YouTube automatically applies my confirmed shift for it, or a suggested one with a chip, and confirming there shows up in the web app.

### Phase 5: Songbook import + polish
- The importer (section 11), PWA install for phone use, keyboard shortcuts, setlists (stretch goal), export a sheet as ChordPro/PDF.

### Phase 6: Hosting
- Turso, Vercel Blob/R2, the Auth.js single-user lock, analyzer deployed to Railway/Fly/Modal, extension pointed at the hosted URL, and the YouTube extraction fallback strategy.

---

## 13. Conventions (copy into `CLAUDE.md`)

- TypeScript strict; no `any` without a comment explaining why.
- All music theory lives in `packages/core` and is pure and unit-tested. The UI never does its own chord math.
- ChordPro is the single source of truth for sheet content. Other formats are import/export only.
- Every suggested value carries `{ value, state, source, confidence, reason }`. Never silently overwrite a `confirmed` value.
- Log an `events` row for every meaningful user action. The learning loop depends on it.
- Storage, DB, and YouTube extraction go through interfaces so hosting can swap them.
- Never scrape or copy content from Ultimate Guitar or other copyrighted chord sites.
- Keep the analyzer stateless apart from the DB and storage; all config via env.
- At the end of each phase: run all tests, update the README, summarize, and stop for my review.

---

## 14. Known limitations to be honest about in the UI

- Chord detection from audio is a **draft**. Simple triad-based pop and folk songs come out well; jazz voicings, dense mixes, and fast changes need manual fixes. That's why detected chords go through the confirm flow.
- Pitch shifting more than about ±4 semitones gets audibly artificial. The engine's `|t|` penalty and octave-down suggestions exist partly for this reason.
- Melody range from vocal separation is approximate; percentiles (p10/p90) are used instead of absolute min/max to ignore glitches.
