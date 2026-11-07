import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_USER_ID as U } from "../constants";
import { events, songPrefs } from "../db/schema";
import { presetId } from "../seed/seed";
import { createTestDb, type TestDb } from "../test-utils";
import { computeSuggestions, confirmPrefs, getPrefsView, rejectSuggestion } from "./prefs";
import { createSongFromSheet, ValidationError } from "./songs";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const base = {
  audioPitchSemitones: 0,
  pitchLinked: true,
  capoFret: 0,
  strumPatternId: null,
};

describe("prefs", () => {
  it("cold start: everything is a suggestion", async () => {
    const v = await getPrefsView(t.db, U, "seed-red-river-valley");
    expect(v.transpose).toMatchObject({ value: 0, state: "suggested", source: "default" });
    expect(v.audioPitch).toMatchObject({ value: 0, state: "suggested", source: "linked" });
    expect(v.capo).toMatchObject({ value: 0, state: "suggested", source: "capo_ranking" });
    expect(v.strum).toMatchObject({
      value: presetId("Quarter downs"),
      state: "suggested",
      source: "time_signature",
    });
    expect(v.pitchLinked).toBe(true);
    expect(v.confirmedAt).toBeNull();
  });

  it("suggests the capo for the transposed key", async () => {
    // Red River Valley is in D; +1 → Eb, best played capo 1 with D shapes.
    const s = await computeSuggestions(t.db, U, "seed-red-river-valley", { transposeOverride: 1 });
    expect(s.capo.value).toBe(1);
    expect(s.capo.reason).toContain("D shapes");
  });

  it("confirms values, logs an event and loads them back", async () => {
    const v = await confirmPrefs(t.db, U, "seed-clementine", {
      ...base,
      transposeSemitones: 10, // normalized but kept as chord transpose
      audioPitchSemitones: -2,
      capoFret: 3,
      strumPatternId: presetId("Waltz (D-DUDU)"),
    });
    expect(v.transpose).toMatchObject({ value: 10, state: "confirmed", confidence: 1 });
    expect(v.audioPitch).toMatchObject({ value: -2, state: "confirmed" });
    expect(v.capo).toMatchObject({ value: 3, state: "confirmed" });
    expect(v.strum.value).toBe(presetId("Waltz (D-DUDU)"));
    expect(v.confirmedAt).not.toBeNull();

    const ev = await t.db
      .select()
      .from(events)
      .where(and(eq(events.songId, "seed-clementine"), eq(events.type, "confirm")));
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ values: { transposeSemitones: 10, capoFret: 3 } });

    const [row] = await t.db
      .select()
      .from(songPrefs)
      .where(eq(songPrefs.songId, "seed-clementine"));
    expect(row!.suggestionMeta?.transpose?.source).toBe("default");
  });

  it("re-confirming updates the same row", async () => {
    await confirmPrefs(t.db, U, "seed-clementine", { ...base, transposeSemitones: -2 });
    const rows = await t.db.select().from(songPrefs).where(eq(songPrefs.songId, "seed-clementine"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.transposeSemitones).toBe(-2);
  });

  it("uses confirmed history for other songs (same artist first)", async () => {
    const v = await getPrefsView(t.db, U, "seed-amazing-grace");
    expect(v.transpose).toMatchObject({ value: -2, state: "suggested", source: "artist_median" });
    expect(v.audioPitch.value).toBe(-2);

    const other = await createSongFromSheet(t.db, {
      userId: U,
      title: "Other",
      artist: "Somebody New",
      sheetText: "[C]la [G]la",
    });
    const ov = await getPrefsView(t.db, U, other.id);
    expect(ov.transpose).toMatchObject({ value: -2, source: "global_median" });
  });

  it("does not let a song's own confirmation drive its suggestion", async () => {
    const s = await computeSuggestions(t.db, U, "seed-clementine");
    expect(s.transpose.source).toBe("default");
  });

  it("validates confirm input", async () => {
    await expect(
      confirmPrefs(t.db, U, "seed-clementine", { ...base, transposeSemitones: 0, capoFret: 20 }),
    ).rejects.toThrow(ValidationError);
    await expect(
      confirmPrefs(t.db, U, "seed-clementine", {
        ...base,
        transposeSemitones: 0,
        strumPatternId: "nope",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("logs rejected suggestions", async () => {
    await rejectSuggestion(t.db, U, "seed-red-river-valley", {
      field: "transpose",
      suggestedValue: 2,
      source: "global_median",
    });
    const ev = await t.db
      .select()
      .from(events)
      .where(and(eq(events.songId, "seed-red-river-valley"), eq(events.type, "reject_suggestion")));
    expect(ev[0]!.payload).toMatchObject({ field: "transpose", suggestedValue: 2 });
  });
});
