import { STRUM_PRESETS } from "@chordus/core";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_ID, DEFAULT_USER_NAME } from "../constants";
import type { Db } from "../db/client";
import { chordSheets, songs, sources, strumPatterns, users } from "../db/schema";
import { SAMPLE_SONGS } from "./sample-songs";

export function presetId(name: string): string {
  return `preset-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export interface SeedOptions {
  /** Insert the sample public-domain songs (default true). */
  sampleSongs?: boolean;
}

/** Idempotent seed: default user, strum presets, and sample songs. Safe to run repeatedly. */
export async function seedDatabase(db: Db, opts: SeedOptions = {}): Promise<void> {
  await db
    .insert(users)
    .values({ id: DEFAULT_USER_ID, name: DEFAULT_USER_NAME })
    .onConflictDoNothing();

  for (const p of STRUM_PRESETS) {
    const id = presetId(p.name);
    await db
      .insert(strumPatterns)
      .values({ id, userId: null, isPreset: true, ...p })
      .onConflictDoUpdate({
        target: strumPatterns.id,
        set: {
          name: p.name,
          timeSignature: p.timeSignature,
          subdivision: p.subdivision,
          pattern: p.pattern,
        },
      });
  }

  if (opts.sampleSongs === false) return;

  for (const s of SAMPLE_SONGS) {
    const existing = await db.select({ id: songs.id }).from(songs).where(eq(songs.id, s.id));
    if (existing.length > 0) continue;
    await db.batch([
      db.insert(songs).values({
        id: s.id,
        userId: DEFAULT_USER_ID,
        title: s.title,
        artist: s.artist,
        originalKey: s.originalKey,
        timeSignature: s.timeSignature,
        bpm: s.bpm,
        vocalistHint: s.vocalistHint,
      }),
      db.insert(sources).values({
        songId: s.id,
        kind: "manual",
        license: s.license,
        attribution: s.attribution,
        sourceUrl: s.sourceUrl,
      }),
      db.insert(chordSheets).values({
        songId: s.id,
        chordpro: s.chordpro,
        origin: "imported_open",
        isPrimary: true,
      }),
    ]);
  }
}
