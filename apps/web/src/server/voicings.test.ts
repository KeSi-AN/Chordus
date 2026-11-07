import { describe, expect, it } from "vitest";
import { lookupVoicing, lookupVoicings } from "./voicings";

describe("lookupVoicing", () => {
  it("finds open C major first", () => {
    const v = lookupVoicing("C")!;
    expect(v.matched).toBe("C");
    expect(v.positions[0]!.frets).toEqual([-1, 3, 2, 0, 1, 0]);
  });

  it.each([
    ["Am", "Am"],
    ["F#m7", "F#m7"],
    ["Gbm7", "F#m7"],
    ["A#", "Bb"],
    ["Bbmaj7", "Bbmaj7"],
    ["Dsus4", "Dsus4"],
    ["Cadd9", "Cadd9"],
    ["Bm7b5", "Bm7b5"],
    ["E7#9", "E7#9"],
    ["C6/9", "C69"],
    ["G5", "G"],
    ["Am7add11", "Am"],
  ])("%s → %s", (chord, matched) => {
    expect(lookupVoicing(chord)?.matched).toBe(matched);
  });

  it("uses slash-chord inversions when the DB has them", () => {
    expect(lookupVoicing("C/E")?.matched).toBe("C/E");
    expect(lookupVoicing("Am/G")?.matched).toBe("Am/G");
  });

  it("falls back to the plain chord for unknown inversions", () => {
    expect(lookupVoicing("C/F#")?.matched).toBe("C");
  });

  it("returns null for non-chords", () => {
    expect(lookupVoicing("N.C.")).toBeNull();
    expect(lookupVoicing("hello")).toBeNull();
  });

  it("looks up lists", () => {
    const all = lookupVoicings(["G", "C", "G", "nope"]);
    expect(Object.keys(all)).toEqual(["G", "C"]);
  });
});
