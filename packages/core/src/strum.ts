/**
 * Strumming pattern model.
 *
 * A pattern is a string with one character per slot:
 *   D = down strum, U = up strum, x = muted strum (chuck), - = rest.
 * The slot length is the `subdivision` note value (8 = eighth notes, 16 = sixteenth notes).
 * Example: the classic "D-DU-UDU" in 4/4 eighths has 8 slots.
 */

export type StrumStroke = "D" | "U" | "x" | "-";
export const STRUM_STROKES: readonly StrumStroke[] = ["D", "U", "x", "-"];

export interface TimeSignature {
  beats: number;
  unit: number;
}

export interface StrumPatternDef {
  name: string;
  timeSignature: string;
  subdivision: 8 | 16;
  pattern: string;
}

/** Parse "4/4", "3/4", "6/8". Returns null for malformed input. */
export function parseTimeSignature(ts: string): TimeSignature | null {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(ts);
  if (!m) return null;
  const beats = Number(m[1]);
  const unit = Number(m[2]);
  if (beats < 1 || ![1, 2, 4, 8, 16].includes(unit)) return null;
  return { beats, unit };
}

/** Number of slots in one bar for a time signature and slot note value. */
export function slotsPerBar(timeSignature: string, subdivision: number): number {
  const ts = parseTimeSignature(timeSignature);
  if (!ts) throw new Error(`Invalid time signature: ${timeSignature}`);
  const slots = (ts.beats * subdivision) / ts.unit;
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error(`Subdivision 1/${subdivision} does not fit ${timeSignature}`);
  }
  return slots;
}

/** Slots per counted beat (e.g. 2 for eighths in 4/4, 1 for eighths in 6/8). */
export function slotsPerBeat(timeSignature: string, subdivision: number): number {
  const ts = parseTimeSignature(timeSignature);
  if (!ts) throw new Error(`Invalid time signature: ${timeSignature}`);
  return Math.max(1, subdivision / ts.unit);
}

export function parsePattern(pattern: string): StrumStroke[] {
  return [...pattern].map((c) => {
    if (c === "d") return "D";
    if (c === "u") return "U";
    if (c === "X") return "x";
    if (c === "D" || c === "U" || c === "x" || c === "-") return c;
    throw new Error(`Invalid strum character "${c}"`);
  });
}

export function formatPattern(strokes: readonly StrumStroke[]): string {
  return strokes.join("");
}

export interface PatternValidation {
  ok: boolean;
  error?: string;
}

export function validatePattern(def: Omit<StrumPatternDef, "name">): PatternValidation {
  let strokes: StrumStroke[];
  try {
    strokes = parsePattern(def.pattern);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  let expected: number;
  try {
    expected = slotsPerBar(def.timeSignature, def.subdivision);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (strokes.length !== expected) {
    return {
      ok: false,
      error: `Pattern has ${strokes.length} slots; ${def.timeSignature} in 1/${def.subdivision} notes needs ${expected}`,
    };
  }
  if (!strokes.some((s) => s !== "-")) return { ok: false, error: "Pattern is all rests" };
  return { ok: true };
}

/** Cycle a slot through D → U → x → - → D (used by the grid editor). */
export function cycleStroke(s: StrumStroke): StrumStroke {
  const i = STRUM_STROKES.indexOf(s);
  return STRUM_STROKES[(i + 1) % STRUM_STROKES.length]!;
}

/** Resize a pattern to a new slot count, padding with rests or truncating. */
export function resizePattern(pattern: string, slots: number): string {
  const strokes = parsePattern(pattern).slice(0, slots);
  while (strokes.length < slots) strokes.push("-");
  return formatPattern(strokes);
}

/** Beat-count labels for each slot: "1 & 2 &" for eighths, "1 e & a" for sixteenths. */
export function countLabels(timeSignature: string, subdivision: number): string[] {
  const total = slotsPerBar(timeSignature, subdivision);
  const perBeat = slotsPerBeat(timeSignature, subdivision);
  const sub =
    perBeat === 1 ? [""] : perBeat === 2 ? ["", "&"] : perBeat === 4 ? ["", "e", "&", "a"] : [];
  const labels: string[] = [];
  for (let i = 0; i < total; i++) {
    const beat = Math.floor(i / perBeat) + 1;
    const pos = i % perBeat;
    labels.push(pos === 0 ? String(beat) : (sub[pos] ?? "·"));
  }
  return labels;
}

/** Built-in presets (seeded into `strum_patterns` with isPreset = true). */
export const STRUM_PRESETS: readonly StrumPatternDef[] = [
  { name: "Quarter downs", timeSignature: "4/4", subdivision: 8, pattern: "D-D-D-D-" },
  { name: "Eighth downs", timeSignature: "4/4", subdivision: 8, pattern: "DDDDDDDD" },
  { name: "Down-up eighths", timeSignature: "4/4", subdivision: 8, pattern: "DUDUDUDU" },
  { name: "Old faithful (D-DU-UDU)", timeSignature: "4/4", subdivision: 8, pattern: "D-DU-UDU" },
  { name: "Pop basic (D-D-DUDU)", timeSignature: "4/4", subdivision: 8, pattern: "D-D-DUDU" },
  { name: "Folk (D-DUDUDU)", timeSignature: "4/4", subdivision: 8, pattern: "D-DUDUDU" },
  { name: "Ballad (D---D-DU)", timeSignature: "4/4", subdivision: 8, pattern: "D---D-DU" },
  { name: "Backbeat chuck", timeSignature: "4/4", subdivision: 8, pattern: "D-xUD-xU" },
  { name: "Reggae offbeat", timeSignature: "4/4", subdivision: 8, pattern: "-U-U-U-U" },
  {
    name: "Sixteenth down-ups",
    timeSignature: "4/4",
    subdivision: 16,
    pattern: "DUDUDUDUDUDUDUDU",
  },
  {
    name: "Funk sixteenths",
    timeSignature: "4/4",
    subdivision: 16,
    pattern: "D-xUD-DU-UxUD-xU",
  },
  { name: "Waltz downs", timeSignature: "3/4", subdivision: 8, pattern: "D-D-D-" },
  { name: "Waltz (D-DUDU)", timeSignature: "3/4", subdivision: 8, pattern: "D-DUDU" },
  { name: "Waltz bass-strum", timeSignature: "3/4", subdivision: 8, pattern: "D---DU" },
  { name: "6/8 ballad", timeSignature: "6/8", subdivision: 8, pattern: "D-UD-U" },
  { name: "6/8 rolling", timeSignature: "6/8", subdivision: 8, pattern: "DUUDUU" },
];

/** Index of the default preset for a time signature (the first preset that matches). */
export function defaultPresetFor(timeSignature: string): StrumPatternDef | null {
  const norm = timeSignature.replace(/\s+/g, "");
  return STRUM_PRESETS.find((p) => p.timeSignature === norm) ?? null;
}
