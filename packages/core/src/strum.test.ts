import { describe, expect, it } from "vitest";
import {
  countLabels,
  cycleStroke,
  defaultPresetFor,
  parsePattern,
  parseTimeSignature,
  resizePattern,
  slotsPerBar,
  STRUM_PRESETS,
  validatePattern,
} from "./strum";

describe("time signatures", () => {
  it("parses common signatures", () => {
    expect(parseTimeSignature("4/4")).toEqual({ beats: 4, unit: 4 });
    expect(parseTimeSignature(" 6 / 8 ")).toEqual({ beats: 6, unit: 8 });
    expect(parseTimeSignature("4/3")).toBeNull();
    expect(parseTimeSignature("waltz")).toBeNull();
  });

  it.each([
    ["4/4", 8, 8],
    ["4/4", 16, 16],
    ["3/4", 8, 6],
    ["6/8", 8, 6],
    ["6/8", 16, 12],
    ["2/2", 8, 8],
  ])("%s in 1/%i notes has %i slots", (ts, sub, slots) => {
    expect(slotsPerBar(ts, sub)).toBe(slots);
  });

  it("throws on subdivisions that do not fit", () => {
    expect(() => slotsPerBar("5/8", 4)).toThrow();
  });
});

describe("patterns", () => {
  it("parses and normalizes strokes", () => {
    expect(parsePattern("d-Du-X")).toEqual(["D", "-", "D", "U", "-", "x"]);
    expect(() => parsePattern("D?")).toThrow(/Invalid/);
  });

  it("validates slot counts", () => {
    expect(validatePattern({ timeSignature: "4/4", subdivision: 8, pattern: "D-DU-UDU" }).ok).toBe(
      true,
    );
    const bad = validatePattern({ timeSignature: "3/4", subdivision: 8, pattern: "D-DU-UDU" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/needs 6/);
    expect(validatePattern({ timeSignature: "3/4", subdivision: 8, pattern: "------" }).ok).toBe(
      false,
    );
  });

  it("every preset is valid", () => {
    for (const p of STRUM_PRESETS) expect(validatePattern(p), p.name).toEqual({ ok: true });
    expect(new Set(STRUM_PRESETS.map((p) => p.name)).size).toBe(STRUM_PRESETS.length);
  });

  it("cycles strokes for the grid editor", () => {
    expect(cycleStroke("D")).toBe("U");
    expect(cycleStroke("U")).toBe("x");
    expect(cycleStroke("x")).toBe("-");
    expect(cycleStroke("-")).toBe("D");
  });

  it("resizes patterns", () => {
    expect(resizePattern("D-DU", 6)).toBe("D-DU--");
    expect(resizePattern("D-DU-UDU", 6)).toBe("D-DU-U");
  });

  it("labels beat counts", () => {
    expect(countLabels("4/4", 8)).toEqual(["1", "&", "2", "&", "3", "&", "4", "&"]);
    expect(countLabels("4/4", 16).slice(0, 4)).toEqual(["1", "e", "&", "a"]);
    expect(countLabels("6/8", 8)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("picks a default preset per time signature", () => {
    expect(defaultPresetFor("3/4")?.timeSignature).toBe("3/4");
    expect(defaultPresetFor("6/8")?.timeSignature).toBe("6/8");
    expect(defaultPresetFor("7/8")).toBeNull();
  });
});
