import { parseChordPro, transposeChordPro, type ParsedSheet } from "@chordus/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_USER_ID as U } from "../constants";
import { createTestDb, type TestDb } from "../test-utils";
import { getMobileSong, listMobileSongs } from "./mobile";
import { confirmPrefs } from "./prefs";
import { getSongDetail, NotFoundError, saveSheetVersion } from "./songs";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

describe("getMobileSong", () => {
  it("lets the app render any transpose and capo exactly as the web app does", async () => {
    const song = await getMobileSong(t.db, U, "seed-amazing-grace");
    const { sheet } = await getSongDetail(t.db, U, "seed-amazing-grace");
    expect(song.sheet?.parsed).toEqual(parseChordPro(sheet!.chordpro));
    expect(song.shapes).toHaveLength(12);
    expect(song.sounding).toHaveLength(12);

    // Transpose +3 with capo 1: the sheet shows shapes two semitones up (G -> A).
    const shown = song.shapes[(3 - 1 + 12) % 12]!;
    expect(shown.key).toBe("A");
    const lookup = new Map(song.sheet!.chords.map((c, i) => [c, shown.chords[i]]));
    const firstLine = (p: ParsedSheet) => p.sections[0]!.lines.find((l) => l.type === "lyrics")!;
    const web = parseChordPro(transposeChordPro(sheet!.chordpro, 2));
    const mine = firstLine(song.sheet!.parsed);
    const theirs = firstLine(web);
    if (mine.type !== "lyrics" || theirs.type !== "lyrics") throw new Error("no lyrics");
    expect(mine.segments.map((s) => (s.chord ? lookup.get(s.chord) : null))).toEqual(
      theirs.segments.map((s) => s.chord),
    );

    expect(song.sounding[3]!.key).toBe("Bb");
    expect(song.sounding[3]!.capoOptions[0]).toMatchObject({ capo: 3, shapeKey: "G" });
    expect(song.sounding.map((s) => s.audioShift)).toEqual([
      0, 1, 2, 3, 4, 5, -6, -5, -4, -3, -2, -1,
    ]);
    expect(song.audio).toBeNull();
    expect(song.prefs.transpose.state).toBe("suggested");
  });

  it("refuses songs that don't exist", async () => {
    await expect(getMobileSong(t.db, U, "nope")).rejects.toThrow(NotFoundError);
  });
});

describe("listMobileSongs", () => {
  it("changes a song's version when its sheet or prefs change", async () => {
    const version = async () =>
      (await listMobileSongs(t.db, U)).find((s) => s.id === "seed-clementine")!.version;
    const v1 = await version();
    await saveSheetVersion(t.db, U, "seed-clementine", "{key: F}\n[F]Oh my darling");
    const v2 = await version();
    expect(v2).not.toBe(v1);
    await confirmPrefs(t.db, U, "seed-clementine", {
      transposeSemitones: 2,
      audioPitchSemitones: 2,
      pitchLinked: true,
      capoFret: 0,
      strumPatternId: null,
    });
    const v3 = await version();
    expect(v3).not.toBe(v2);
    expect((await getMobileSong(t.db, U, "seed-clementine")).version).toBe(v3);
    expect(await version()).toBe(v3); // stable when nothing changed
  });
});
