# Chordus for Android

The Chordus library on your phone: chord sheets with transpose and capo, synced from the web app
on your laptop and saved on the phone so they work away from it too.

## What it does (mobile phase 1)

- **Library:** every song from the server, searchable, with key and confirmed markers. Pull to
  sync; only songs that changed are downloaded.
- **Song view:** chords above lyrics (Urdu/Arabic lyrics read right to left), transpose − / +,
  capo picker with the most playable positions starred, Suggested / Edited / Confirmed chips with
  the reason on tap, text size, auto-scroll that follows the BPM, and the screen stays on.
- **Confirm** saves transpose and capo to the server, the same as the web app.
- **Offline:** everything except Confirm works from the copy on the phone. Usage events made
  offline are sent on the next sync.

The app does no music theory itself: the server sends each sheet once with lookup tables for all
12 transpositions (`GET /api/mobile/songs/:id`), worked out by `packages/core`.

Not yet: audio playback with pitch shift, synced chords, chord diagrams, strumming, adding songs.

## Run it on your phone

1. On the laptop, set `CHORDUS_API_TOKEN` in the repo-root `.env` (see `.env.example`), then run
   `pnpm dev`. If Windows asks, allow Node.js on **private** networks.
2. Find the laptop's Wi-Fi address: `ipconfig` → "IPv4 Address" (e.g. `192.168.1.20`).
3. Turn on USB debugging on the phone, plug it in, and run:

   ```bash
   cd apps/mobile
   flutter run
   ```

4. In the app: **Settings** → server address `192.168.1.20:3000` and the access token.

Phone and laptop must be on the same Wi-Fi. A release APK: `pnpm mobile:apk` (signed with the
debug key for now, fine for installing on your own phone).

## Develop

```bash
cd apps/mobile
flutter test       # unit and widget tests (fake server built from real API fixtures)
flutter analyze    # very_good_analysis
```

`test/fixtures/*.json` are real `/api/mobile/*` responses for the public-domain sample songs.
After changing that API, regenerate them from `getMobileSong` / `listMobileSongs` on a seeded test
database so the app's tests keep matching the server.

`integration_test/` runs the real app on a connected phone against your server; see the comment
at the top of `server_sync_test.dart`.

Layout follows the usual feature-first structure: `lib/app` (app shell, router), `lib/core` (API
client, on-phone storage, event queue, theme), `lib/features/{library,song,settings}`.
