import { describe, expect, it } from "vitest";
import { parseKey } from "./keys";
import {
  medianShift,
  suggestCapo,
  suggestLinkedAudioShift,
  suggestStrumPreset,
  suggestTransposeFallback,
  type ConfirmedSongShift,
} from "./suggest";

const h = (
  songId: string,
  artist: string,
  transposeSemitones: number,
  vocalistHint: ConfirmedSongShift["vocalistHint"] = "unknown",
): ConfirmedSongShift => ({ songId, artist, transposeSemitones, vocalistHint });

describe("medianShift", () => {
  it.each([
    [[], null],
    [[2], 2],
    [[1, 3], 2],
    [[-2, -1], -1], // -1.5 rounds toward zero
    [[0, 1], 0],
    [[5, -3, 1], 1],
  ])("%j → %s", (values, expected) => {
    expect(medianShift(values)).toBe(expected);
  });
});

describe("suggestTransposeFallback", () => {
  const history = [
    h("a", "Adele", -3, "female"),
    h("b", "adele ", 9, "female"), // same as −3
    h("c", "Adele", -2, "female"),
    h("d", "Ed Sheeran", 0, "male"),
    h("e", "Some Band", 2, "male"),
    h("f", "Other", -5, "female"),
  ];

  it("cold start: 0 with low confidence", () => {
    const s = suggestTransposeFallback({ artist: "X", vocalistHint: "unknown", history: [] });
    expect(s).toMatchObject({ value: 0, source: "default" });
    expect(s.confidence).toBeLessThan(0.1);
  });

  it("prefers the same artist (case-insensitive, mod-12 aware)", () => {
    const s = suggestTransposeFallback({ artist: "ADELE", vocalistHint: "female", history });
    expect(s).toMatchObject({ value: -3, source: "artist_median" });
    expect(s.reason).toContain("3 confirmed songs");
  });

  it("falls back to the vocalist type", () => {
    const s = suggestTransposeFallback({ artist: "New", vocalistHint: "male", history });
    expect(s).toMatchObject({ value: 1, source: "vocalist_median" });
  });

  it("falls back to the global median", () => {
    const s = suggestTransposeFallback({ artist: "New", vocalistHint: "unknown", history });
    expect(s).toMatchObject({ value: -2, source: "global_median" });
    expect(s.confidence).toBeLessThan(
      suggestTransposeFallback({ artist: "Adele", vocalistHint: "unknown", history }).confidence,
    );
  });

  it("ignores the song's own confirmation", () => {
    const s = suggestTransposeFallback({
      songId: "d",
      artist: "Ed Sheeran",
      vocalistHint: "unknown",
      history,
    });
    expect(s.source).toBe("global_median");
  });
});

describe("other suggestions", () => {
  it("links audio to the smallest shift", () => {
    const t = { value: 10, source: "artist_median", confidence: 0.5, reason: "" } as const;
    expect(suggestLinkedAudioShift(t)).toMatchObject({ value: -2, source: "linked" });
  });

  it("suggests a capo from the sounding key", () => {
    expect(suggestCapo(parseKey("Bb"), [])).toMatchObject({ value: 3, source: "capo_ranking" });
    expect(suggestCapo(null, [])).toMatchObject({ value: 0, source: "default" });
  });

  it("suggests a strum preset from the time signature", () => {
    expect(suggestStrumPreset("3/4").value?.timeSignature).toBe("3/4");
    expect(suggestStrumPreset("7/8")).toMatchObject({ value: null, source: "default" });
  });
});
