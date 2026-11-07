/**
 * Guitar chord voicings from @tombatossals/chords-db (MIT licensed).
 * Server-only: the JSON is ~240 KB, so the client fetches just the chords it needs.
 */
import { parseChord } from "@chordus/core";
import guitar from "@tombatossals/chords-db/lib/guitar.json";

export interface ChordPosition {
  /** Fret per string, low E to high e. -1 = muted, 0 = open. Relative to baseFret. */
  frets: number[];
  fingers: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
}

export interface ChordVoicing {
  /** The chord symbol that was looked up. */
  chord: string;
  /** The name the voicing is filed under (may drop extensions, e.g. "C6/9" → "C69"). */
  matched: string;
  positions: ChordPosition[];
}

interface DbChord {
  key: string;
  suffix: string;
  positions: ChordPosition[];
}

const DB_KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const DB_PROP = ["C", "Csharp", "D", "Eb", "E", "F", "Fsharp", "G", "Ab", "A", "Bb", "B"];

const SUFFIX_MAP: Record<string, string> = {
  "": "major",
  M: "major",
  maj: "major",
  m: "minor",
  min: "minor",
  mi: "minor",
  "-": "minor",
  dim: "dim",
  "°": "dim",
  dim7: "dim7",
  "°7": "dim7",
  sus: "sus4",
  sus2: "sus2",
  sus4: "sus4",
  "7sus4": "7sus4",
  "7sus": "7sus4",
  aug: "aug",
  "+": "aug",
  "6": "6",
  "6/9": "69",
  "69": "69",
  "7": "7",
  "7b5": "7b5",
  aug7: "aug7",
  "+7": "aug7",
  "7#5": "aug7",
  "9": "9",
  "9b5": "9b5",
  "7b9": "7b9",
  "7#9": "7#9",
  "11": "11",
  "9#11": "9#11",
  "13": "13",
  maj7: "maj7",
  M7: "maj7",
  Δ: "maj7",
  Δ7: "maj7",
  maj9: "maj9",
  maj11: "maj11",
  maj13: "maj13",
  m6: "m6",
  m69: "m69",
  "m6/9": "m69",
  m7: "m7",
  min7: "m7",
  "-7": "m7",
  m7b5: "m7b5",
  ø: "m7b5",
  ø7: "m7b5",
  m9: "m9",
  m11: "m11",
  mmaj7: "mmaj7",
  "m(maj7)": "mmaj7",
  mM7: "mmaj7",
  add9: "add9",
  add2: "add9",
  "2": "add9",
  madd9: "madd9",
  "m(add9)": "madd9",
};

/** Simplify suffixes the DB doesn't have to a close, playable relative. */
function simplify(suffix: string): string | null {
  if (/^m/.test(suffix) && !/^maj/.test(suffix)) return "minor";
  if (/^7/.test(suffix)) return "7";
  if (/^maj/.test(suffix)) return "maj7";
  if (suffix === "5") return "major"; // no power-chord entries; a full triad is a fine stand-in
  return null;
}

const chords = (guitar as unknown as { chords: Record<string, DbChord[]> }).chords;

function find(prop: string, suffix: string): DbChord | undefined {
  return chords[prop]?.find((c) => c.suffix === suffix);
}

/** Look up voicings for a chord symbol, or null when nothing reasonable exists. */
export function lookupVoicing(chord: string): ChordVoicing | null {
  const c = parseChord(chord);
  if (!c) return null;
  const prop = DB_PROP[c.rootPc]!;
  const keyName = DB_KEYS[c.rootPc]!;
  const mapped = SUFFIX_MAP[c.suffix] ?? simplify(c.suffix);
  if (!mapped) return null;

  // Slash chords: the DB has major "/X" and minor "m/X" inversions for some roots.
  if (c.bassPc !== null && (mapped === "major" || mapped === "minor")) {
    const bassName = DB_KEYS[c.bassPc]!;
    const slash = find(prop, `${mapped === "minor" ? "m" : ""}/${bassName}`);
    if (slash) {
      return { chord, matched: `${keyName}${slash.suffix}`, positions: slash.positions };
    }
  }
  const entry = find(prop, mapped);
  if (!entry) return null;
  const shown = mapped === "major" ? "" : mapped === "minor" ? "m" : mapped;
  return { chord, matched: `${keyName}${shown}`, positions: entry.positions };
}

/** Voicings for a list of chords (unknown chords are omitted). */
export function lookupVoicings(chordList: readonly string[]): Record<string, ChordVoicing> {
  const out: Record<string, ChordVoicing> = {};
  for (const ch of chordList) {
    if (out[ch]) continue;
    const v = lookupVoicing(ch);
    if (v) out[ch] = v;
  }
  return out;
}
