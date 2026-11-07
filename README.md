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
apps/web          Next.js app (UI, API route handlers, Drizzle schema + migrations)
packages/core     Pure TypeScript music logic, fully unit tested
data/             Local SQLite DB and uploaded audio (git-ignored)
```

## Content policy

Sheets come only from your own pasted sheets, chords detected from your audio, or
public-domain / open-licensed songbooks with the license recorded. Nothing is scraped from
Ultimate Guitar or other copyrighted chord sites.
