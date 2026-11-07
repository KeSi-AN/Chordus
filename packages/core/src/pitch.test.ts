import { describe, expect, it } from "vitest";
import {
  audioShiftForTranspose,
  clampAudioShift,
  formatSemitones,
  normalizeTranspose,
  pitchRatio,
  transposeForAudioShift,
} from "./pitch";

describe("transpose/audio linking", () => {
  it.each([
    [0, 0],
    [2, 2],
    [-2, -2],
    [10, -2],
    [-10, 2],
    [5, 5],
    [6, -6],
    [-6, -6],
    [7, -5],
    [12, 0],
    [-12, 0],
    [13, 1],
  ])("transpose %i → audio %i", (t, a) => {
    expect(audioShiftForTranspose(t)).toBe(a);
  });

  it("normalizes transpose into −11..+11", () => {
    expect(normalizeTranspose(12)).toBe(0);
    expect(normalizeTranspose(-12)).toBe(0);
    expect(normalizeTranspose(13)).toBe(1);
    expect(normalizeTranspose(-13)).toBe(-1);
    expect(normalizeTranspose(11)).toBe(11);
    expect(Object.is(normalizeTranspose(-0), 0)).toBe(true);
  });

  it("maps audio shifts back to the same chords", () => {
    for (let a = -12; a <= 12; a++) {
      const t = transposeForAudioShift(a);
      expect((((t - a) % 12) + 12) % 12).toBe(0);
    }
  });
});

describe("helpers", () => {
  it("computes pitch ratios", () => {
    expect(pitchRatio(12)).toBe(2);
    expect(pitchRatio(-12)).toBe(0.5);
    expect(pitchRatio(0)).toBe(1);
  });

  it("formats semitones", () => {
    expect(formatSemitones(2)).toBe("+2");
    expect(formatSemitones(-3)).toBe("−3");
    expect(formatSemitones(0)).toBe("0");
  });

  it("clamps audio shifts", () => {
    expect(clampAudioShift(15)).toBe(12);
    expect(clampAudioShift(-20)).toBe(-12);
    expect(clampAudioShift(2.4)).toBe(2);
  });
});
