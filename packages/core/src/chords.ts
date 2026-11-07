import { keyFromPitchClass, parseKey, spellPitchClass, type Key } from "./keys";
import { mod12, normalizeAccidentals, noteToPitchClass, type PitchClass } from "./notes";

export interface Chord {
  /** Root as written, e.g. "Bb". */
  root: string;
  rootPc: PitchClass;
  /** Everything after the root and before the slash, e.g. "m7b5", "sus4", "maj7". */
  suffix: string;
  /** Slash-chord bass note as written, e.g. "F#" in "D/F#". */
  bass: string | null;
  bassPc: PitchClass | null;
}

export type ChordQuality = "major" | "minor" | "dim" | "halfdim" | "aug" | "sus" | "power";

/** Tokens allowed after the root. Kept strict so lyric words like "Do" or "Bad" aren't chords. */
const SUFFIX_RE =
  /^(?:maj|ma|min|mi|m|M|dim|aug|sus|add|alt|no|omit|°|ø|Δ|\+|-|b|#|\d{1,2}|\(|\)|,)*$/;
const ROOT_RE = /^([A-G][#b]?)(.*)$/;

/** Text that means "no chord". */
export const NO_CHORD_RE = /^(?:N\.?C\.?|n\.c\.)$/;

function splitRoot(s: string): { root: string; rest: string } | null {
  const m = ROOT_RE.exec(s);
  if (!m) return null;
  return { root: m[1]!, rest: m[2]! };
}

/** Parse a chord symbol ("C#m7b5", "D/F#", "Bbmaj7", "G♯m"). Returns null if not a chord. */
export function parseChord(input: string): Chord | null {
  const s = normalizeAccidentals(input.trim());
  if (!s) return null;
  const slash = s.lastIndexOf("/");
  let main = s;
  let bass: string | null = null;
  if (slash > 0) {
    const maybeBass = s.slice(slash + 1);
    // "/9" style suffixes (C6/9) are part of the suffix, not a bass note.
    if (/^[A-G][#b]?$/.test(maybeBass)) {
      main = s.slice(0, slash);
      bass = maybeBass;
    }
  }
  const parts = splitRoot(main);
  if (!parts) return null;
  const suffix = parts.rest;
  // Allow "/digit" inside the suffix (C6/9) by dropping it before validating.
  if (!SUFFIX_RE.test(suffix.replace(/\/(?=\d)/g, ""))) return null;
  const rootPc = noteToPitchClass(parts.root);
  if (rootPc === null) return null;
  const bassPc = bass ? noteToPitchClass(bass) : null;
  return { root: parts.root, rootPc, suffix, bass, bassPc };
}

/** True for chord symbols and "N.C.". */
export function isChordSymbol(s: string): boolean {
  return NO_CHORD_RE.test(s.trim()) || parseChord(s) !== null;
}

export function formatChord(c: Pick<Chord, "root" | "suffix" | "bass">): string {
  return `${c.root}${c.suffix}${c.bass ? `/${c.bass}` : ""}`;
}

/** Broad chord quality, used for key detection and voicing lookup. */
export function chordQuality(suffix: string): ChordQuality {
  const s = suffix;
  if (/^(m7b5|m7-5|ø)/.test(s)) return "halfdim";
  if (/^(dim|°)/.test(s)) return "dim";
  if (/^(aug|\+)/.test(s)) return "aug";
  if (/^(maj|ma(?!j)|M|Δ)/.test(s)) return "major";
  if (/^(min|mi|m|-)/.test(s)) return "minor";
  if (/^sus/.test(s) || /^\d*sus/.test(s)) return "sus";
  if (s === "5") return "power";
  return "major";
}

function resolveKey(target: Key | string | null | undefined): Key | null {
  if (!target) return null;
  return typeof target === "string" ? parseKey(target) : target;
}

/**
 * Transpose a chord symbol by `semitones`, spelling the result for `targetKey`
 * (e.g. Bb, not A#, in F major). Without a key, common chart spellings are used.
 * Returns the input unchanged for "N.C." and anything that isn't a chord.
 */
export function transposeChord(
  chord: string,
  semitones: number,
  targetKey?: Key | string | null,
): string {
  if (NO_CHORD_RE.test(chord.trim())) return chord;
  const c = parseChord(chord);
  if (!c) return chord;
  const key = resolveKey(targetKey) ?? keyFromPitchClass(0, "major");
  const root = spellPitchClass(mod12(c.rootPc + semitones), key);
  const bass = c.bassPc === null ? null : spellPitchClass(mod12(c.bassPc + semitones), key);
  return formatChord({ root, suffix: c.suffix, bass });
}

/** Re-spell a chord for a key without moving it (e.g. "A#" → "Bb" in F). */
export function respellChord(chord: string, key: Key | string): string {
  return transposeChord(chord, 0, key);
}
