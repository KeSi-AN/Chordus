import { describe, expect, it } from "vitest";
import {
  chordQuality,
  formatChord,
  isChordSymbol,
  parseChord,
  respellChord,
  transposeChord,
} from "./chords";

describe("parseChord", () => {
  it.each([
    ["C", "C", ""],
    ["Am", "A", "m"],
    ["F#m7b5", "F#", "m7b5"],
    ["Bbmaj7", "Bb", "maj7"],
    ["Gsus4", "G", "sus4"],
    ["Cadd9", "C", "add9"],
    ["E7#9", "E", "7#9"],
    ["C6/9", "C", "6/9"],
    ["A7sus4", "A", "7sus4"],
    ["Fmaj7(#11)", "F", "maj7(#11)"],
    ["G♯m", "G#", "m"],
    ["Bdim7", "B", "dim7"],
    ["C+", "C", "+"],
    ["D5", "D", "5"],
  ])("%s → root %s suffix %s", (s, root, suffix) => {
    const c = parseChord(s);
    expect(c).not.toBeNull();
    expect(c!.root).toBe(root);
    expect(c!.suffix).toBe(suffix);
    expect(c!.bass).toBeNull();
  });

  it("parses slash chords", () => {
    const c = parseChord("D/F#")!;
    expect(c.root).toBe("D");
    expect(c.bass).toBe("F#");
    expect(c.bassPc).toBe(6);
    expect(formatChord(c)).toBe("D/F#");
    expect(parseChord("Am7/G")!.suffix).toBe("m7");
  });

  it.each(["Do", "Bad", "Be", "Hello", "Ah", "H7", "Add", "c", "", "x2", "|"])(
    "rejects lyric-like word %s",
    (s) => {
      expect(parseChord(s)).toBeNull();
    },
  );

  it("treats N.C. as a chord symbol", () => {
    expect(isChordSymbol("N.C.")).toBe(true);
    expect(isChordSymbol("NC")).toBe(true);
    expect(isChordSymbol("Am")).toBe(true);
    expect(isChordSymbol("Amen")).toBe(false);
  });
});

describe("chordQuality", () => {
  it.each([
    ["", "major"],
    ["7", "major"],
    ["maj7", "major"],
    ["m", "minor"],
    ["m7", "minor"],
    ["min", "minor"],
    ["m7b5", "halfdim"],
    ["dim7", "dim"],
    ["+", "aug"],
    ["sus4", "sus"],
    ["7sus4", "sus"],
    ["5", "power"],
  ])("%s → %s", (suffix, q) => {
    expect(chordQuality(suffix)).toBe(q);
  });
});

describe("transposeChord", () => {
  it.each([
    ["C", 2, "D", "D"],
    ["G", -2, "F", "F"],
    ["C", -2, "F", "Bb"], // B♭ not A♯ in F major
    ["A#", 0, "F", "Bb"],
    ["Am7", 3, "C", "Cm7"],
    ["F#m7b5", 1, "G", "Gm7b5"],
    ["D/F#", -2, "C", "C/E"],
    ["G/B", 1, "Ab", "Ab/C"],
    ["E", 1, "F", "F"],
    ["Bb", 1, "E", "B"],
    ["Eb", 2, "E", "F"],
    ["Cmaj7", 6, "F#", "F#maj7"],
    ["Ebm", 0, "D#m", "D#m"],
    ["C#", 0, "Db", "Db"],
  ])("%s %+i in %s → %s", (chord, semis, key, expected) => {
    expect(transposeChord(chord, semis, key)).toBe(expected);
  });

  it("uses common chart spellings without a key", () => {
    expect(transposeChord("C", 1)).toBe("C#");
    expect(transposeChord("C", 3)).toBe("Eb");
    expect(transposeChord("C", 10)).toBe("Bb");
    expect(transposeChord("C", -1)).toBe("B");
  });

  it("passes through N.C. and non-chords", () => {
    expect(transposeChord("N.C.", 3, "G")).toBe("N.C.");
    expect(transposeChord("hello", 3)).toBe("hello");
  });

  it("is reversible mod 12", () => {
    for (const c of ["C", "F#m", "Bbmaj7", "D/F#", "G7sus4"]) {
      for (let s = -11; s <= 11; s++) {
        const there = transposeChord(c, s);
        const back = transposeChord(there, -s);
        expect(parseChord(back)!.rootPc).toBe(parseChord(c)!.rootPc);
        expect(parseChord(back)!.suffix).toBe(parseChord(c)!.suffix);
      }
    }
  });

  it("respells without moving", () => {
    expect(respellChord("A#m", "F")).toBe("Bbm");
    expect(respellChord("Gb", "D")).toBe("F#");
  });
});
