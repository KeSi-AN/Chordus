/**
 * Minimal ChordPro support: parse to a renderable model, serialize back, and transpose.
 * ChordPro is the storage format for every sheet; see https://www.chordpro.org/.
 */
import { isChordSymbol, NO_CHORD_RE, parseChord, transposeChord } from "./chords";
import { detectKeyFromChords } from "./detect-key";
import { formatKey, parseKey, transposeKey, type Key } from "./keys";

export interface Segment {
  /** Chord above this piece of lyrics (null when the lyrics start before the first chord). */
  chord: string | null;
  lyrics: string;
}

export type SheetLine =
  | { type: "lyrics"; segments: Segment[] }
  | { type: "comment"; text: string }
  | { type: "tab"; text: string }
  | { type: "empty" };

export interface SheetSection {
  /** "verse", "chorus", "bridge", "intro", "tab", ... or "none" for lines outside a section. */
  kind: string;
  label: string | null;
  lines: SheetLine[];
  /** True for a `{chorus}` recall of an earlier chorus. */
  isRepeat?: boolean;
}

export interface SheetMeta {
  title?: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  capo?: string;
  tempo?: string;
  time?: string;
  [name: string]: string | undefined;
}

export interface ParsedSheet {
  meta: SheetMeta;
  sections: SheetSection[];
}

const DIRECTIVE_ALIASES: Record<string, string> = {
  t: "title",
  st: "subtitle",
  c: "comment",
  ci: "comment_italic",
  cb: "comment_box",
  soc: "start_of_chorus",
  eoc: "end_of_chorus",
  sov: "start_of_verse",
  eov: "end_of_verse",
  sob: "start_of_bridge",
  eob: "end_of_bridge",
  sot: "start_of_tab",
  eot: "end_of_tab",
};

const META_DIRECTIVES = new Set([
  "title",
  "subtitle",
  "artist",
  "composer",
  "lyricist",
  "album",
  "year",
  "key",
  "capo",
  "tempo",
  "time",
  "duration",
  "copyright",
]);

const DIRECTIVE_RE = /^\{\s*([A-Za-z_][\w-]*)\s*(?::\s*(.*?))?\s*\}$/;
const CHORD_TOKEN_RE = /\[([^\]]*)\]/g;

export interface Directive {
  name: string;
  value: string | null;
}

export function parseDirective(line: string): Directive | null {
  const m = DIRECTIVE_RE.exec(line.trim());
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  return { name: DIRECTIVE_ALIASES[raw] ?? raw, value: m[2] ?? null };
}

/** Split a ChordPro lyric line ("A[G]mazing [G7]grace") into chord/lyric segments. */
export function parseLyricLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let pendingChord: string | null = null;
  for (const m of line.matchAll(CHORD_TOKEN_RE)) {
    const text = line.slice(last, m.index);
    if (pendingChord !== null || text.length > 0) {
      segments.push({ chord: pendingChord, lyrics: text });
    }
    pendingChord = m[1]!.trim();
    last = m.index + m[0].length;
  }
  const rest = line.slice(last);
  if (pendingChord !== null || rest.length > 0) segments.push({ chord: pendingChord, lyrics: rest });
  return segments;
}

function defaultLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Parse ChordPro text into metadata and sections. Unknown directives are ignored. */
export function parseChordPro(text: string): ParsedSheet {
  const meta: SheetMeta = {};
  const sections: SheetSection[] = [];
  let current: SheetSection | null = null;
  let lastChorus: SheetSection | null = null;

  const loose = (): SheetSection => {
    const tail = sections[sections.length - 1];
    if (current) return current;
    if (tail && tail.kind === "none") return tail;
    const s: SheetSection = { kind: "none", label: null, lines: [] };
    sections.push(s);
    return s;
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (current?.kind === "tab") {
      const d = parseDirective(line);
      if (d?.name === "end_of_tab") {
        current = null;
        continue;
      }
      current.lines.push({ type: "tab", text: line });
      continue;
    }
    if (line.startsWith("#")) continue;

    const d = parseDirective(line);
    if (d) {
      if (META_DIRECTIVES.has(d.name)) {
        if (d.value !== null) meta[d.name] = d.value;
      } else if (d.name.startsWith("start_of_")) {
        const kind = d.name.slice("start_of_".length);
        current = { kind, label: d.value || defaultLabel(kind), lines: [] };
        sections.push(current);
      } else if (d.name.startsWith("end_of_")) {
        if (current?.kind === "chorus") lastChorus = current;
        current = null;
      } else if (d.name.startsWith("comment")) {
        loose().lines.push({ type: "comment", text: d.value ?? "" });
      } else if (d.name === "chorus") {
        if (lastChorus) {
          sections.push({
            kind: "chorus",
            label: d.value || lastChorus.label,
            lines: lastChorus.lines,
            isRepeat: true,
          });
        } else {
          loose().lines.push({ type: "comment", text: d.value || "Chorus" });
        }
      }
      continue;
    }

    if (line.trim() === "") {
      // Blank lines inside a section are kept; between sections they only separate.
      if (current) current.lines.push({ type: "empty" });
      else {
        const tail = sections[sections.length - 1];
        if (tail?.kind === "none" && tail.lines.length > 0) tail.lines.push({ type: "empty" });
      }
      continue;
    }
    loose().lines.push({ type: "lyrics", segments: parseLyricLine(line) });
  }

  // Trim trailing blank lines in every section.
  for (const s of sections) {
    while (s.lines.length > 0 && s.lines[s.lines.length - 1]!.type === "empty" && !s.isRepeat) {
      s.lines.pop();
    }
  }
  return { meta, sections: sections.filter((s) => s.lines.length > 0 || s.kind !== "none") };
}

const META_ORDER = ["title", "subtitle", "artist", "key", "capo", "tempo", "time"];

function serializeLine(line: SheetLine): string {
  switch (line.type) {
    case "empty":
      return "";
    case "comment":
      return `{comment: ${line.text}}`;
    case "tab":
      return line.text;
    case "lyrics":
      return line.segments
        .map((s) => (s.chord !== null ? `[${s.chord}]` : "") + s.lyrics)
        .join("")
        .replace(/\s+$/, "");
  }
}

/** Serialize a parsed sheet back to ChordPro text. */
export function serializeChordPro(sheet: ParsedSheet): string {
  const out: string[] = [];
  const keys = [
    ...META_ORDER.filter((k) => sheet.meta[k] !== undefined),
    ...Object.keys(sheet.meta).filter((k) => !META_ORDER.includes(k) && sheet.meta[k] !== undefined),
  ];
  for (const k of keys) out.push(`{${k}: ${sheet.meta[k]}}`);
  for (const section of sheet.sections) {
    if (out.length > 0) out.push("");
    if (section.isRepeat) {
      out.push(section.label && section.label !== "Chorus" ? `{chorus: ${section.label}}` : "{chorus}");
      continue;
    }
    if (section.kind === "none") {
      for (const l of section.lines) out.push(serializeLine(l));
      continue;
    }
    const label = section.label && section.label !== defaultLabel(section.kind) ? `: ${section.label}` : "";
    out.push(`{start_of_${section.kind}${label}}`);
    for (const l of section.lines) out.push(serializeLine(l));
    out.push(`{end_of_${section.kind}}`);
  }
  return out.join("\n") + "\n";
}

/** All chord symbols in order of appearance (with repeats), excluding N.C. and annotations. */
export function extractChords(chordpro: string): string[] {
  const chords: string[] = [];
  let inTab = false;
  for (const line of chordpro.replace(/\r\n?/g, "\n").split("\n")) {
    const d = parseDirective(line);
    if (d?.name === "start_of_tab") inTab = true;
    if (d?.name === "end_of_tab") inTab = false;
    if (inTab || d) continue;
    for (const m of line.matchAll(CHORD_TOKEN_RE)) {
      const c = m[1]!.trim();
      if (!NO_CHORD_RE.test(c) && parseChord(c)) chords.push(c);
    }
  }
  return chords;
}

/** Unique chord symbols in order of first appearance. */
export function uniqueChords(chordpro: string): string[] {
  return [...new Set(extractChords(chordpro))];
}

/** The sheet's key: its {key} directive, else a guess from its chords. */
export function sheetKey(chordpro: string): { key: Key; detected: boolean } | null {
  const sheet = parseChordPro(chordpro);
  const declared = sheet.meta.key ? parseKey(sheet.meta.key) : null;
  if (declared) return { key: declared, detected: false };
  const guess = detectKeyFromChords(extractChords(chordpro));
  return guess ? { key: guess.key, detected: true } : null;
}

/**
 * Transpose every chord in a ChordPro sheet by `semitones`, spelled for the new key, and
 * update its {key} directive. Tab sections and annotations are left untouched.
 */
export function transposeChordPro(chordpro: string, semitones: number): string {
  const source = sheetKey(chordpro);
  const target = source ? transposeKey(source.key, semitones) : null;
  let inTab = false;
  return chordpro
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const d = parseDirective(line);
      if (d) {
        if (d.name === "start_of_tab") inTab = true;
        if (d.name === "end_of_tab") inTab = false;
        if (d.name === "key" && d.value && target) {
          const k = parseKey(d.value);
          if (k) return `{key: ${formatKey(transposeKey(k, semitones))}}`;
        }
        return line;
      }
      if (inTab || semitones % 12 === 0) return line;
      return line.replace(CHORD_TOKEN_RE, (whole, inner: string) =>
        isChordSymbol(inner) ? `[${transposeChord(inner.trim(), semitones, target)}]` : whole,
      );
    })
    .join("\n");
}
