import { parseChordPro } from "@chordus/core";
import { describe, expect, it } from "vitest";
import { chordTokenIndices } from "@/components/sheet-view";
import {
  activeTimelineIndex,
  heardTime,
  PITCH_SHIFT_LATENCY_SECONDS,
  sameCursor,
  timelineCursor,
} from "./timeline";

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

describe("timelineCursor", () => {
  const tl = [
    { start: 1, end: 2, chord: "G", confidence: 0.9 },
    { start: 2, end: 3, chord: "G", confidence: 0.9 },
    { start: 3, end: 4, chord: "D", confidence: 0.9 },
    { start: 6, end: 7, chord: "C", confidence: 0.9 },
  ];

  it("points at the playing entry and the next different chord", () => {
    expect(timelineCursor(tl, 1.5)).toEqual({ index: 0, nextIndex: 2 });
    expect(timelineCursor(tl, 2.5)).toEqual({ index: 1, nextIndex: 2 });
    expect(timelineCursor(tl, 3.5)).toEqual({ index: 2, nextIndex: 3 });
    expect(timelineCursor(tl, 6.5)).toEqual({ index: 3, nextIndex: null });
  });

  it("looks ahead to the next entry while in a gap", () => {
    expect(timelineCursor(tl, 0)).toEqual({ index: null, nextIndex: 0 });
    expect(timelineCursor(tl, 5)).toEqual({ index: null, nextIndex: 3 });
    expect(timelineCursor(tl, 9)).toEqual({ index: null, nextIndex: null });
    expect(timelineCursor([], 1)).toEqual({ index: null, nextIndex: null });
  });

  it("stays the same between chord changes, so playback need not re-render", () => {
    expect(sameCursor(timelineCursor(tl, 1.1), timelineCursor(tl, 1.9))).toBe(true);
    expect(sameCursor(timelineCursor(tl, 1.9), timelineCursor(tl, 2.1))).toBe(false);
    expect(sameCursor(null, null)).toBe(true);
    expect(sameCursor(null, timelineCursor(tl, 1))).toBe(false);
  });
});
