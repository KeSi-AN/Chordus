import { chordQuality, parseChord, type ChordQuality } from "./chords";
import { allKeys, type Key } from "./keys";
import { mod12 } from "./notes";

export interface KeyGuess {
  key: Key;
  /** 0..1: how sure the guess is. */
  confidence: number;
}

type Triad = "maj" | "min" | "dim";

/** Diatonic triads by scale degree offset from the tonic. */
const MAJOR_TRIADS: ReadonlyArray<[number, Triad]> = [
  [0, "maj"],
  [2, "min"],
  [4, "min"],
  [5, "maj"],
  [7, "maj"],
  [9, "min"],
  [11, "dim"],
];
/** Natural minor plus the harmonic-minor V (very common in songs). */
const MINOR_TRIADS: ReadonlyArray<[number, Triad]> = [
  [0, "min"],
  [2, "dim"],
  [3, "maj"],
  [5, "min"],
  [7, "min"],
  [7, "maj"],
  [8, "maj"],
  [10, "maj"],
];

function triadOf(q: ChordQuality): Triad | null {
  if (q === "major") return "maj";
  if (q === "minor") return "min";
  if (q === "dim" || q === "halfdim") return "dim";
  return null; // sus, power, aug: root-only evidence
}

function scoreKey(key: Key, chords: { pc: number; triad: Triad | null }[]): number {
  const table = key.mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
  let score = 0;
  chords.forEach((c, i) => {
    const offset = mod12(c.pc - key.tonic);
    const matches = table.filter(([o]) => o === offset);
    if (matches.length === 0) score -= 0.75;
    else if (c.triad === null) score += 0.5;
    else if (matches.some(([, t]) => t === c.triad)) score += 1;
    else score -= 0.25;

    const isTonic = offset === 0 && (c.triad === null || c.triad === table[0]![1]);
    if (isTonic) {
      score += 0.25;
      if (i === 0) score += 1.5;
      if (i === chords.length - 1) score += 2;
    }
  });
  return score;
}

/**
 * Guess the key of a song from its chord sequence (in order of appearance, repeats included).
 * Used as a fallback when a pasted sheet has no {key}. Returns null for no usable chords.
 */
export function detectKeyFromChords(chordSymbols: readonly string[]): KeyGuess | null {
  const chords = chordSymbols
    .map((s) => parseChord(s))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({ pc: c.rootPc, triad: triadOf(chordQuality(c.suffix)) }));
  if (chords.length === 0) return null;

  const scored = allKeys()
    .map((key) => ({ key, score: scoreKey(key, chords) }))
    // Stable sort keeps majors (listed first) ahead of minors on ties.
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  const second = scored[1]!;
  const maxScore = chords.length * 1.25 + 3.5;
  const fit = Math.max(0, best.score) / maxScore;
  const margin = Math.min(1, (best.score - second.score) / 3);
  const confidence = Math.round(Math.min(1, fit * (0.5 + 0.5 * margin)) * 100) / 100;
  return { key: best.key, confidence };
}
