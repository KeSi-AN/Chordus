import { describe, expect, it } from "vitest";
import {
  frequencyToMidi,
  midiToFrequency,
  midiToNote,
  mod12,
  noteToMidi,
  noteToPitchClass,
  pitchClassName,
  signedInterval,
} from "./notes";

describe("noteToPitchClass", () => {
  it.each([
    ["C", 0],
    ["C#", 1],
    ["Db", 1],
    ["D♭", 1],
    ["F♯", 6],
    ["B#", 0],
    ["Cb", 11],
    ["Ebb", 2],
    ["a", 9],
  ])("%s -> %i", (name, pc) => {
    expect(noteToPitchClass(name)).toBe(pc);
  });

  it("rejects non-notes", () => {
    expect(noteToPitchClass("H")).toBeNull();
    expect(noteToPitchClass("Cm")).toBeNull();
    expect(noteToPitchClass("")).toBeNull();
  });
});

describe("noteToMidi / midiToNote", () => {
  it.each([
    ["C4", 60],
    ["A4", 69],
    ["C-1", 0],
    ["B3", 59],
    ["Cb4", 59],
    ["F#2", 42],
  ])("%s <-> %i", (note, midi) => {
    expect(noteToMidi(note)).toBe(midi);
  });

  it("formats midi numbers", () => {
    expect(midiToNote(60)).toBe("C4");
    expect(midiToNote(61)).toBe("C#4");
    expect(midiToNote(61, "flat")).toBe("Db4");
    expect(midiToNote(47)).toBe("B2");
    expect(midiToNote(59.6)).toBe("C4");
  });

  it("round-trips across the vocal range", () => {
    for (let m = 36; m <= 84; m++) expect(noteToMidi(midiToNote(m))).toBe(m);
  });
});

describe("helpers", () => {
  it("mod12 wraps negatives", () => {
    expect(mod12(-1)).toBe(11);
    expect(mod12(25)).toBe(1);
  });

  it("names pitch classes", () => {
    expect(pitchClassName(10)).toBe("A#");
    expect(pitchClassName(10, "flat")).toBe("Bb");
  });

  it("computes the smallest signed interval", () => {
    expect(signedInterval(0, 7)).toBe(-5);
    expect(signedInterval(0, 5)).toBe(5);
    expect(signedInterval(0, 6)).toBe(6);
    expect(signedInterval(11, 1)).toBe(2);
  });

  it("converts between frequency and midi", () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(frequencyToMidi(261.6255653)).toBeCloseTo(60, 5);
  });
});
