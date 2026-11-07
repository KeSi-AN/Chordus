# CLAUDE.md

Personal chord sheet + audio pitch shift + voice-fit app. The full architecture and phased
build plan is in [PROJECT_PLAN.md](PROJECT_PLAN.md). Build **one phase at a time** and stop for
review at the end of each phase.

## Repo layout

- `apps/web`: Next.js (App Router) + TypeScript + Tailwind. UI, API route handlers, Drizzle DB.
- `packages/core`: pure TypeScript music logic (transpose, keys, capo, ChordPro, strumming,
  suggestions). No I/O. Fully unit tested.
- Later phases: `apps/extension` (Chrome MV3), `services/analyzer` (Python FastAPI worker).

## Commands

- `pnpm dev`: run the web app on http://localhost:3000
- `pnpm test`: run all Vitest projects
- `pnpm lint` / `pnpm typecheck` / `pnpm format`
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` / `pnpm db:generate` (after schema edits)

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- All music theory lives in `packages/core` and is pure and unit-tested. The UI never does its
  own chord math.
- ChordPro is the single source of truth for sheet content. Other formats are import/export only.
- Every suggested value carries `{ value, state, source, confidence, reason }`. Never silently
  overwrite a `confirmed` value.
- Log an `events` row for every meaningful user action. The learning loop depends on it.
- Storage, DB, and YouTube extraction go through interfaces so hosting can swap them.
- Never scrape or copy content from Ultimate Guitar or other copyrighted chord sites.
- Keep the analyzer stateless apart from the DB and storage; all config via env.
- At the end of each phase: run all tests, update the README, summarize, and stop for review.
- Make small, focused commits (one feature or fix per commit).
