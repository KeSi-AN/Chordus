import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_USER_ID as U } from "../constants";
import { chordSheets, events, songPrefs, sources } from "../db/schema";
import { createTestDb, type TestDb } from "../test-utils";
import {
  createSongFromSheet,
  deleteSong,
  getSongDetail,
  libraryKeys,
  listSongs,
  needsConfirming,
  NotFoundError,
  recentlyPlayed,
  saveSheetVersion,
  toFtsQuery,
  updateSong,
  ValidationError,
} from "./songs";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const PASTED = `[Verse]
G       C          G
Amazing grace, how sweet the sound
                    D
That saved a wretch like me`;

describe("toFtsQuery", () => {
  it("builds safe prefix queries", () => {
    expect(toFtsQuery("Red riv")).toBe('"red"* "riv"*');
    expect(toFtsQuery(`"; DROP TABLE songs; --`)).toBe('"drop"* "table"* "songs"*');
    expect(toFtsQuery("  ")).toBeNull();
    expect(toFtsQuery("don't")).toBe('"dont"*');
  });
});

describe("createSongFromSheet", () => {
  it("converts a pasted sheet and detects the key", async () => {
    const song = await createSongFromSheet(t.db, {
      userId: U,
      title: "  My Song ",
      artist: "Me",
      sheetText: PASTED,
    });
    expect(song).toMatchObject({ title: "My Song", artist: "Me", originalKey: "G" });
    const detail = await getSongDetail(t.db, U, song.id);
    expect(detail.sheet?.origin).toBe("pasted");
    expect(detail.sheet?.chordpro).toContain("{title: My Song}");
    expect(detail.sheet?.chordpro).toContain("[G]Amazing [C]grace, how [G]sweet the sound");
    const ev = await t.db.select().from(events).where(eq(events.songId, song.id));
    expect(ev.map((e) => e.type)).toEqual(["song_created"]);
  });

  it("prefers explicit metadata, then sheet directives", async () => {
    const song = await createSongFromSheet(t.db, {
      userId: U,
      title: "Waltz",
      sheetText: "{time: 3/4}\n{tempo: 90}\n[Am]Hello [E]there [Am]friend",
      key: "C",
    });
    expect(song).toMatchObject({ originalKey: "C", timeSignature: "3/4", bpm: 90 });
  });

  it("validates input", async () => {
    await expect(
      createSongFromSheet(t.db, { userId: U, title: " ", sheetText: "x" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      createSongFromSheet(t.db, { userId: U, title: "x", sheetText: " " }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("listSongs", () => {
  it("searches title and artist with prefixes", async () => {
    const ids = (await listSongs(t.db, { userId: U, query: "red riv" })).map((s) => s.id);
    expect(ids).toEqual(["seed-red-river-valley"]);
    const trad = await listSongs(t.db, { userId: U, query: "tradit" });
    expect(trad).toHaveLength(3);
  });

  it("filters by confirmed, audio and key", async () => {
    await t.db.insert(songPrefs).values({
      userId: U,
      songId: "seed-clementine",
      transposeState: "confirmed",
      confirmedAt: new Date(),
    });
    await t.db
      .insert(sources)
      .values({ songId: "seed-amazing-grace", kind: "file", filePath: "audio/x.mp3" });

    const confirmed = await listSongs(t.db, { userId: U, filter: "confirmed" });
    expect(confirmed.map((s) => s.id)).toEqual(["seed-clementine"]);
    const unconfirmed = await listSongs(t.db, { userId: U, filter: "unconfirmed" });
    expect(unconfirmed.map((s) => s.id)).not.toContain("seed-clementine");
    const audio = await listSongs(t.db, { userId: U, filter: "has_audio" });
    expect(audio.map((s) => s.id)).toEqual(["seed-amazing-grace"]);
    expect(audio[0]!.hasAudio).toBe(true);
    const inD = await listSongs(t.db, { userId: U, key: "D" });
    expect(inD.map((s) => s.id)).toEqual(["seed-red-river-valley"]);
    expect(await libraryKeys(t.db, U)).toEqual(expect.arrayContaining(["C", "D", "F", "G"]));
  });

  it("tracks recently played and needs-confirming", async () => {
    await t.db.insert(events).values([
      { userId: U, songId: "seed-red-river-valley", type: "open_song", createdAt: new Date(1000) },
      { userId: U, songId: "seed-amazing-grace", type: "play", createdAt: new Date(2000) },
    ]);
    const recent = await recentlyPlayed(t.db, U);
    expect(recent.map((s) => s.id)).toEqual(["seed-amazing-grace", "seed-red-river-valley"]);
    const pending = await needsConfirming(t.db, U, 50);
    expect(pending.map((s) => s.id)).not.toContain("seed-clementine");
  });

  it("applies the limit after sorting, so the strips show the newest songs", async () => {
    const recent = await recentlyPlayed(t.db, U, 1);
    expect(recent.map((s) => s.id)).toEqual(["seed-amazing-grace"]);
    const touched = (s: { lastOpenedAt: Date | null; updatedAt: Date }) =>
      Math.max(s.lastOpenedAt?.getTime() ?? 0, s.updatedAt.getTime());
    const pending = await needsConfirming(t.db, U, 50);
    expect(pending.length).toBeGreaterThan(1);
    expect(pending.map(touched)).toEqual(pending.map(touched).sort((a, b) => b - a));
    expect(await needsConfirming(t.db, U, 1)).toEqual(pending.slice(0, 1));
  });
});

describe("editing", () => {
  it("updates metadata with validation", async () => {
    const s = await updateSong(t.db, U, "seed-clementine", { originalKey: "bb", bpm: 110 });
    expect(s).toMatchObject({ originalKey: "Bb", bpm: 110 });
    await expect(updateSong(t.db, U, "seed-clementine", { originalKey: "H" })).rejects.toThrow(
      ValidationError,
    );
    await expect(updateSong(t.db, U, "seed-clementine", { timeSignature: "nope" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("saves sheet versions and keeps one primary", async () => {
    const v = await saveSheetVersion(t.db, U, "seed-clementine", "[F]New [C]words");
    expect(v.isPrimary).toBe(true);
    const all = await t.db
      .select()
      .from(chordSheets)
      .where(eq(chordSheets.songId, "seed-clementine"));
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.isPrimary)).toHaveLength(1);
    expect((await getSongDetail(t.db, U, "seed-clementine")).sheet?.id).toBe(v.id);
  });

  it("deletes songs and reports their sources", async () => {
    const srcs = await deleteSong(t.db, U, "seed-amazing-grace");
    expect(srcs.some((s) => s.filePath === "audio/x.mp3")).toBe(true);
    await expect(getSongDetail(t.db, U, "seed-amazing-grace")).rejects.toThrow(NotFoundError);
  });
});
