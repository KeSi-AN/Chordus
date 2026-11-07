import { describe, expect, it } from "vitest";
import {
  allKeys,
  formatKey,
  keyAccidental,
  keyFromPitchClass,
  parseKey,
  relativeMajor,
  scalePitchClasses,
  spellPitchClass,
  transposeKey,
} from "./keys";

const key = (s: string) => {
  const k = parseKey(s);
  if (!k) throw new Error(`bad key ${s}`);
  return k;
};

describe("parseKey", () => {
  it.each([
    ["G", 7, "major", "G"],
    ["Bb", 10, "major", "Bb"],
    ["B♭", 10, "major", "Bb"],
    ["F#m", 6, "minor", "F#m"],
    ["Am", 9, "minor", "Am"],
    ["C minor", 0, "minor", "Cm"],
    ["D major", 2, "major", "D"],
    ["ebm", 3, "minor", "Ebm"],
  ])("%s", (input, tonic, mode, formatted) => {
    const k = key(input);
    expect(k.tonic).toBe(tonic);
    expect(k.mode).toBe(mode);
    expect(formatKey(k)).toBe(formatted);
  });

  it("rejects garbage", () => {
    expect(parseKey("H")).toBeNull();
    expect(parseKey("G7")).toBeNull();
    expect(parseKey("")).toBeNull();
  });
});

describe("key spelling", () => {
  it("prefers conventional key names", () => {
    expect(formatKey(keyFromPitchClass(1, "major"))).toBe("Db");
    expect(formatKey(keyFromPitchClass(6, "major"))).toBe("F#");
    expect(formatKey(keyFromPitchClass(8, "minor"))).toBe("G#m");
    expect(formatKey(keyFromPitchClass(10, "minor"))).toBe("Bbm");
  });

  it("transposes keys", () => {
    expect(formatKey(transposeKey(key("G"), -2))).toBe("F");
    expect(formatKey(transposeKey(key("F"), 1))).toBe("F#");
    expect(formatKey(transposeKey(key("Am"), 3))).toBe("Cm");
    expect(formatKey(transposeKey(key("E"), -1))).toBe("Eb");
    expect(formatKey(transposeKey(key("C"), 12))).toBe("C");
  });

  it("finds relative majors and accidentals", () => {
    expect(formatKey(relativeMajor(key("Em")))).toBe("G");
    expect(keyAccidental(key("F"))).toBe("flat");
    expect(keyAccidental(key("Dm"))).toBe("flat");
    expect(keyAccidental(key("E"))).toBe("sharp");
    expect(keyAccidental(key("C#m"))).toBe("sharp");
    expect(keyAccidental(key("Am"))).toBe("natural");
    expect(keyAccidental(key("Gb"))).toBe("flat");
    expect(keyAccidental(key("F#"))).toBe("sharp");
  });

  it("lists scale pitch classes", () => {
    expect(scalePitchClasses(key("G"))).toEqual([7, 9, 11, 0, 2, 4, 6]);
    expect(scalePitchClasses(key("Am"))).toEqual([9, 11, 0, 2, 4, 5, 7]);
  });

  it.each([
    // [pitch class, key, expected spelling]
    [10, "F", "Bb"],
    [6, "D", "F#"],
    [3, "Eb", "Eb"],
    [3, "E", "D#"], // diatonic leading tone
    [10, "E", "Bb"], // chromatic in a sharp key → common spelling
    [8, "E", "G#"],
    [8, "Bb", "Ab"],
    [1, "A", "C#"],
    [1, "Ab", "Db"],
    [10, "D", "Bb"], // bVI in D
    [10, "C", "Bb"], // bVII in C
    [6, "C", "F#"],
    [5, "F#", "F"], // E# is avoided
    [11, "Gb", "B"], // Cb is avoided
  ])("pc %i in %s → %s", (pc, k, expected) => {
    expect(spellPitchClass(pc, key(k))).toBe(expected);
  });

  it("lists all 24 keys", () => {
    const keys = allKeys().map(formatKey);
    expect(keys).toHaveLength(24);
    expect(new Set(keys).size).toBe(24);
  });
});
