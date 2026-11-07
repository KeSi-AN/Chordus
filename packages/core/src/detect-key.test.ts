import { describe, expect, it } from "vitest";
import { detectKeyFromChords } from "./detect-key";
import { formatKey } from "./keys";

const guess = (chords: string) => {
  const g = detectKeyFromChords(chords.split(/\s+/));
  return g ? formatKey(g.key) : null;
};

describe("detectKeyFromChords", () => {
  it.each([
    ["G G7 C G D G G7 C G Em D G", "G"],
    ["F C C F C7 F", "F"],
    ["D A D D7 G A7 D", "D"],
    ["C Am F G C", "C"],
    ["Am G F E Am", "Am"],
    ["Am Dm E7 Am", "Am"],
    ["Em C G D Em", "Em"],
    ["E A B7 E", "E"],
    ["Bb Eb F Bb", "Bb"],
    ["Dm Bb C Dm", "Dm"],
    ["C#m A E B C#m", "C#m"],
    ["G D/F# Em C G", "G"],
    ["Gsus4 G Csus2 C D G", "G"],
  ])("%s → %s", (chords, key) => {
    expect(guess(chords)).toBe(key);
  });

  it("returns null without chords", () => {
    expect(detectKeyFromChords([])).toBeNull();
    expect(detectKeyFromChords(["N.C.", "hello"])).toBeNull();
  });

  it("is more confident for clear progressions", () => {
    const clear = detectKeyFromChords("G C D G C D Em C G".split(" "))!;
    const vague = detectKeyFromChords(["C", "D"])!;
    expect(clear.confidence).toBeGreaterThan(vague.confidence);
    expect(clear.confidence).toBeGreaterThan(0.5);
    expect(clear.confidence).toBeLessThanOrEqual(1);
  });
});
