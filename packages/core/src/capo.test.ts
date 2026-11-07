import { describe, expect, it } from "vitest";
import { capoOptions, chordShapeForCapo, isOpenShape } from "./capo";

describe("isOpenShape", () => {
  it.each([
    ["G", true],
    ["C", true],
    ["Em", true],
    ["Am7", true],
    ["B7", true],
    ["Fmaj7", true],
    ["Dsus4", true],
    ["D/F#", true],
    ["F", false],
    ["Bm", false],
    ["Bb", false],
    ["F#m", false],
    ["C#m7", false],
  ])("%s → %s", (chord, open) => {
    expect(isOpenShape(chord)).toBe(open);
  });
});

describe("capoOptions", () => {
  it("prefers no capo for open keys", () => {
    expect(capoOptions({ key: "G" })[0]).toMatchObject({ capo: 0, shapeKey: "G" });
    expect(capoOptions({ key: "Em" })[0]).toMatchObject({ capo: 0, shapeKey: "Em" });
  });

  it("suggests G shapes for Bb", () => {
    const top = capoOptions({ key: "Bb" })[0]!;
    expect(top).toMatchObject({ capo: 3, shapeKey: "G" });
    expect(top.reason).toBe("Capo 3, G shapes");
  });

  it("suggests capo 1 for Eb using D shapes", () => {
    expect(capoOptions({ key: "Eb" })[0]).toMatchObject({ capo: 1, shapeKey: "D" });
  });

  it("uses the song's chords when known", () => {
    // In F: F Bb C Dm. Capo 5 → C shapes: C F G Am (F is a barre), capo 3 → D shapes: D G A Bm
    // (Bm barre), capo 1 → E shapes: E A B Dbm... B/C#m barres.
    const chords = ["F", "Bb", "C", "F", "Dm", "C"];
    const opts = capoOptions({ key: "F", chords });
    const top = opts[0]!;
    expect(top.openRatio).toBeGreaterThanOrEqual(0.8);
    expect([3, 5]).toContain(top.capo);
    const noCapo = opts.find((o) => o.capo === 0)!;
    expect(noCapo.openRatio).toBeLessThan(top.openRatio!);
  });

  it("covers every fret up to maxCapo, sorted by score", () => {
    const opts = capoOptions({ key: "A", maxCapo: 7 });
    expect(opts.map((o) => o.capo).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i - 1]!.score).toBeGreaterThanOrEqual(opts[i]!.score);
    }
  });

  it("returns nothing for an invalid key", () => {
    expect(capoOptions({ key: "H" })).toEqual([]);
  });
});

describe("chordShapeForCapo", () => {
  it("maps sounding chords to shapes", () => {
    expect(chordShapeForCapo("Bb", 3, "G")).toBe("G");
    expect(chordShapeForCapo("Gm", 3, "G")).toBe("Em");
    expect(chordShapeForCapo("F/A", 3, "G")).toBe("D/F#");
    expect(chordShapeForCapo("C", 0)).toBe("C");
  });
});
