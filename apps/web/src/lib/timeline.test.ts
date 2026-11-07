import { parseChordPro } from "@chordus/core";
import { describe, expect, it } from "vitest";
import { chordTokenIndices } from "@/components/sheet-view";
import { activeTimelineIndex, heardTime, PITCH_SHIFT_LATENCY_SECONDS } from "./timeline";

const tl = [
  { start: 0.5, end: 2.5, chord: "G", confidence: 0.9 },
  { start: 2.5, end: 4.5, chord: "D", confidence: 0.9 },
  { start: 4.5, end: 5.5, chord: "Em", confidence: 0.4 },
  { start: 5.5, end: 6.5, chord: "C", confidence: 0.8 },
];

describe("activeTimelineIndex", () => {
  it.each([
    [0, null],
    [0.5, 0],
    [2.49, 0],
    [2.5, 1],
    [5.0, 2],
    [6.49, 3],
    [6.5, null],
  ])("t=%f → %s", (t, idx) => {
    expect(activeTimelineIndex(tl, t)).toBe(idx);
  });

  it("handles an empty timeline", () => {
    expect(activeTimelineIndex([], 1)).toBeNull();
  });
});

describe("heardTime", () => {
  it("compensates the shifter latency only while shifting", () => {
    expect(heardTime(10, 0)).toBe(10);
    expect(heardTime(10, 2)).toBeCloseTo(10 - PITCH_SHIFT_LATENCY_SECONDS);
    expect(heardTime(0.05, -3)).toBe(0);
  });
});

describe("chordTokenIndices", () => {
  it("numbers chord tokens in render order, including chorus repeats", () => {
    const sheet = parseChordPro("{soc}\n[G]la [D]la\n{eoc}\n\n| [Em]   | [C?] |\n\n{chorus}\n");
    const { map, count } = chordTokenIndices(sheet);
    expect(count).toBe(6);
    expect(map[0]![0]).toEqual([0, 1]);
    expect(map[1]![0]!.filter((i) => i >= 0)).toEqual([2, 3]);
    expect(map[2]![0]).toEqual([4, 5]);
  });
});
