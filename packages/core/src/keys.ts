import { mod12, normalizeAccidentals, noteToPitchClass, type PitchClass } from "./notes";

export type Mode = "major" | "minor";

export interface Key {
  /** Tonic pitch class, C = 0. */
  tonic: PitchClass;
  mode: Mode;
  /** Display name of the tonic as written ("Bb", "F#"). */
  tonicName: string;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** Preferred key names per tonic pitch class (fewest accidentals, common usage). */
const MAJOR_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Keys that are written with flats (by tonic name). Minor keys use their relative major. */
const FLAT_MAJOR_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
const SHARP_MAJOR_KEYS = new Set(["G", "D", "A", "E", "B", "F#", "C#"]);

/**
 * Parse a key name: "G", "Bb", "F#m", "Am", "C minor", "Ebmaj", "D major".
 * Returns null when the input is not a key.
 */
export function parseKey(input: string): Key | null {
  const s = normalizeAccidentals(input.trim());
  const m = /^([A-Ga-g][#b]?)\s*(m|min|minor|-|maj|major|M)?$/.exec(s);
  if (!m) return null;
  const tonicName = m[1]![0]!.toUpperCase() + m[1]!.slice(1);
  const tonic = noteToPitchClass(tonicName);
  if (tonic === null) return null;
  const q = m[2];
  const mode: Mode = q === "m" || q === "min" || q === "minor" || q === "-" ? "minor" : "major";
  return { tonic, mode, tonicName };
}

export function formatKey(key: Key): string {
  return key.mode === "minor" ? `${key.tonicName}m` : key.tonicName;
}

/** Build a key from a tonic pitch class using the preferred spelling for that tonic. */
export function keyFromPitchClass(tonic: PitchClass, mode: Mode): Key {
  const pc = mod12(tonic);
  const tonicName = (mode === "major" ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES)[pc]!;
  return { tonic: pc, mode, tonicName };
}

/** Transpose a key, choosing the conventional spelling for the new tonic. */
export function transposeKey(key: Key, semitones: number): Key {
  return keyFromPitchClass(key.tonic + semitones, key.mode);
}

/** The relative major of a key (itself if already major). */
export function relativeMajor(key: Key): Key {
  return key.mode === "major" ? key : keyFromPitchClass(key.tonic + 3, "major");
}

/** Whether a key is written with sharps, flats, or neither (C major / A minor). */
export function keyAccidental(key: Key): "sharp" | "flat" | "natural" {
  const major = relativeMajor(key);
  // Respect the tonic spelling the user wrote (e.g. "Gb" vs "F#").
  const name = key.mode === "major" ? key.tonicName : major.tonicName;
  if (FLAT_MAJOR_KEYS.has(name)) return "flat";
  if (SHARP_MAJOR_KEYS.has(name)) return "sharp";
  if (key.mode === "minor") {
    // Minor key written as e.g. "D#m" → relative major F# (sharps) even though the default
    // relative-major spelling may be flat.
    if (key.tonicName.includes("#")) return "sharp";
    if (key.tonicName.includes("b")) return "flat";
  }
  return "natural";
}

/** Scale pitch classes for a key. */
export function scalePitchClasses(key: Key): PitchClass[] {
  const steps = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  return steps.map((s) => mod12(key.tonic + s));
}

const FLAT_TABLE = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** Spelling for keys without accidentals: the most common chord-chart spellings. */
const NATURAL_TABLE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/**
 * Spell the diatonic notes of a key with one letter per degree (e.g. Bb in F major).
 * Avoids theoretical spellings (E#, B#, Cb, Fb) that chord charts never use.
 */
function diatonicSpellings(key: Key): Map<PitchClass, string> {
  const map = new Map<PitchClass, string>();
  const tonicLetter = LETTERS.indexOf(key.tonicName[0]!);
  const steps = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  steps.forEach((step, degree) => {
    const pc = mod12(key.tonic + step);
    const letterIdx = (tonicLetter + degree) % 7;
    const letter = LETTERS[letterIdx]!;
    const diff = mod12(pc - LETTER_PC[letterIdx]!);
    const acc = diff === 0 ? "" : diff === 1 ? "#" : diff === 11 ? "b" : null;
    const name = acc === null ? null : letter + acc;
    if (name && !["E#", "B#", "Cb", "Fb"].includes(name)) map.set(pc, name);
  });
  return map;
}

/**
 * Name a pitch class as it should be written in a key: diatonic notes get the key's
 * spelling (Bb in F, F# in D), chromatic notes follow the key's sharp/flat direction.
 */
export function spellPitchClass(pc: PitchClass, key: Key): string {
  const p = mod12(pc);
  const diatonic = diatonicSpellings(key).get(p);
  if (diatonic) return diatonic;
  // Chromatic notes: flat keys use flats; sharp and natural keys use the common chart
  // spellings (C#, Eb, F#, Ab, Bb), e.g. the bVI chord in D is Bb, not A#.
  return keyAccidental(key) === "flat" ? FLAT_TABLE[p]! : NATURAL_TABLE[p]!;
}

/** All 24 keys with preferred spellings, majors first. */
export function allKeys(): Key[] {
  const out: Key[] = [];
  for (let pc = 0; pc < 12; pc++) out.push(keyFromPitchClass(pc, "major"));
  for (let pc = 0; pc < 12; pc++) out.push(keyFromPitchClass(pc, "minor"));
  return out;
}
