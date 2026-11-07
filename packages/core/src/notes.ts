/** Pitch classes 0..11 with C = 0. */
export type PitchClass = number;

const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Normalize unicode accidentals (♯ ♭) to ASCII (# b). */
export function normalizeAccidentals(s: string): string {
  return s.replace(/♯/g, "#").replace(/♭/g, "b");
}

/** Wrap any integer into 0..11. */
export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/**
 * Parse a note name like "C", "F#", "Bb", "Ebb" into a pitch class.
 * Returns null when the input is not a note name.
 */
export function noteToPitchClass(name: string): PitchClass | null {
  const m = /^([A-Ga-g])([#b]*)$/.exec(normalizeAccidentals(name.trim()));
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  let pc = NATURALS[letter]!;
  for (const acc of m[2]!) pc += acc === "#" ? 1 : -1;
  return mod12(pc);
}

/** Parse scientific pitch notation ("C4", "F#3", "Bb2") into a MIDI number (C4 = 60). */
export function noteToMidi(note: string): number | null {
  const m = /^([A-Ga-g][#b]*)(-?\d+)$/.exec(normalizeAccidentals(note.trim()));
  if (!m) return null;
  const letter = m[1]![0]!.toUpperCase();
  let semis = NATURALS[letter]!;
  for (const acc of m[1]!.slice(1)) semis += acc === "#" ? 1 : -1;
  const octave = Number(m[2]);
  return (octave + 1) * 12 + semis;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Name a pitch class using sharps or flats. */
export function pitchClassName(pc: PitchClass, prefer: "sharp" | "flat" = "sharp"): string {
  return (prefer === "flat" ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]!;
}

/** Convert a MIDI number to scientific pitch notation ("C4" for 60). */
export function midiToNote(midi: number, prefer: "sharp" | "flat" = "sharp"): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${pitchClassName(mod12(rounded), prefer)}${octave}`;
}

/** Smallest signed interval in semitones from pitch class a to b, in -5..+6. */
export function signedInterval(from: PitchClass, to: PitchClass): number {
  const d = mod12(to - from);
  return d > 6 ? d - 12 : d;
}

/** Frequency in Hz for a MIDI number (A4 = 440 Hz). */
export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI number for a frequency in Hz. */
export function frequencyToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}
