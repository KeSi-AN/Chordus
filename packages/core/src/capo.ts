import { chordQuality, parseChord, transposeChord } from "./chords";
import { formatKey, parseKey, transposeKey, type Key } from "./keys";

export interface CapoOption {
  capo: number;
  /** Key of the chord shapes you play with this capo (e.g. "G" for capo 3 in Bb). */
  shapeKey: string;
  /** Higher is easier. Roughly 0..10. */
  score: number;
  /** Fraction of the song's chords (by occurrence) that are open shapes, when chords are known. */
  openRatio: number | null;
  reason: string;
}

/** How comfortable each key's shapes are on guitar, ignoring the actual song. */
const MAJOR_EASE: Record<string, number> = { G: 10, C: 9.5, D: 9.5, A: 8.5, E: 8, F: 4 };
const MINOR_EASE: Record<string, number> = { Em: 10, Am: 10, Dm: 8, Bm: 5, "F#m": 4 };

/** Open-position shapes by root, per chord family. */
const OPEN_SHAPES: Record<string, ReadonlySet<string>> = {
  major: new Set(["C", "D", "E", "G", "A"]),
  minor: new Set(["A", "D", "E"]),
  dom7: new Set(["A", "B", "C", "D", "E", "G"]),
  min7: new Set(["A", "D", "E"]),
  maj7: new Set(["A", "C", "D", "E", "F", "G"]),
  sus: new Set(["A", "D", "E", "G"]),
  add9: new Set(["C", "G", "D", "E", "A"]),
  power: new Set(["E", "A", "D", "G"]),
  six: new Set(["A", "C", "D", "E", "G"]),
};

function chordFamily(suffix: string): keyof typeof OPEN_SHAPES | null {
  const s = suffix.replace(/\(.*\)/g, "");
  if (s === "" || s === "M" || s === "maj") return "major";
  if (s === "m" || s === "min" || s === "mi") return "minor";
  if (s === "7") return "dom7";
  if (s === "m7" || s === "min7") return "min7";
  if (/^(maj7|M7|Δ7?|maj9)$/.test(s)) return "maj7";
  if (/^(sus2|sus4|sus|7sus4|7sus2)$/.test(s)) return "sus";
  if (/^(add9|add2|2)$/.test(s)) return "add9";
  if (s === "5") return "power";
  if (s === "6" || s === "m6") return chordQuality(s) === "minor" ? null : "six";
  return null;
}

/** True if the chord has a common open-position shape (no full barre needed). */
export function isOpenShape(chord: string): boolean {
  const c = parseChord(chord);
  if (!c) return false;
  const family = chordFamily(c.suffix);
  return family !== null && OPEN_SHAPES[family]!.has(c.root);
}

function keyEase(key: Key): number {
  const table = key.mode === "major" ? MAJOR_EASE : MINOR_EASE;
  return table[formatKey(key)] ?? 2;
}

export interface CapoOptionsInput {
  /** Sounding key of the song (after any transpose). */
  key: Key | string;
  /** Sounding chords of the song in order (repeats included), if known. */
  chords?: readonly string[];
  /** Highest capo fret to consider (default 9). */
  maxCapo?: number;
}

/**
 * Rank capo positions for playing in `key`, best first. Prefers open-chord shape keys
 * (G, C, D, A, E, Em, Am) and, when the chords are known, positions where most of the
 * song's chords are open shapes. Higher capos are penalized slightly.
 */
export function capoOptions(input: CapoOptionsInput): CapoOption[] {
  const key = typeof input.key === "string" ? parseKey(input.key) : input.key;
  if (!key) return [];
  const maxCapo = input.maxCapo ?? 9;
  const chords = input.chords?.filter((c) => parseChord(c) !== null) ?? [];
  const options: CapoOption[] = [];

  for (let capo = 0; capo <= maxCapo; capo++) {
    const shapeKey = transposeKey(key, -capo);
    const ease = keyEase(shapeKey);
    const penalty = capo * 0.2 + (capo > 7 ? 1.5 : 0);
    let openRatio: number | null = null;
    let score: number;
    if (chords.length > 0) {
      const shapes = chords.map((c) => transposeChord(c, -capo, shapeKey));
      openRatio = shapes.filter(isOpenShape).length / shapes.length;
      score = openRatio * 7 + ease * 0.3 - penalty;
    } else {
      score = ease - penalty;
    }
    const shapeName = formatKey(shapeKey);
    const pct = openRatio === null ? "" : `, ${Math.round(openRatio * 100)}% open chords`;
    options.push({
      capo,
      shapeKey: shapeName,
      score: Math.round(score * 100) / 100,
      openRatio: openRatio === null ? null : Math.round(openRatio * 100) / 100,
      reason: capo === 0 ? `No capo, ${shapeName} shapes${pct}` : `Capo ${capo}, ${shapeName} shapes${pct}`,
    });
  }
  return options.sort((a, b) => b.score - a.score || a.capo - b.capo);
}

/** Chord shape to play for a sounding chord with a capo on `capo` (e.g. Bb with capo 3 → G). */
export function chordShapeForCapo(chord: string, capo: number, shapeKey?: Key | string): string {
  return transposeChord(chord, -capo, shapeKey ?? null);
}
