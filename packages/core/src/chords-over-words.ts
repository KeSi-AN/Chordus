/**
 * Convert the common pasted "chords over words" format into ChordPro:
 *
 *   [Verse 1]
 *   G        C       G
 *   Amazing grace, how sweet
 *
 * becomes `{start_of_verse: Verse 1}` / `[G]Amazing [C]grace, how [G]sweet` / `{end_of_verse}`.
 */
import { isChordSymbol } from "./chords";
import {
  parseChordPro,
  parseDirective,
  parseLyricLine,
  serializeChordPro,
  type ParsedSheet,
  type SheetLine,
  type SheetMeta,
  type SheetSection,
} from "./chordpro";

const SECTION_WORDS =
  "verse|chorus|refrain|pre-?chorus|bridge|intro|outro|solo|interlude|instrumental|tag|coda|hook|ending|break|post-?chorus|riff";
const SECTION_LABEL_RE = new RegExp(
  `^\\s*[\\[(]?\\s*((?:${SECTION_WORDS})(?:\\s*\\d+)?(?:\\s*[a-z0-9 ]{0,12})?)\\s*[\\])]?\\s*:?\\s*$`,
  "i",
);
const BRACKET_HEADER_RE = /^\s*\[([^\]]+)\]\s*$/;
const INLINE_LABEL_RE = new RegExp(`^\\s*((?:${SECTION_WORDS})(?:\\s*\\d+)?)\\s*:\\s*(.+)$`, "i");
const TAB_LINE_RE = /^\s*[A-Ga-g][#b]?\s*\|[-\d|hpbrsx/\\~()*.=\s]*$/;
/** Non-chord tokens allowed on a chord line. */
const CHORD_LINE_EXTRAS_RE = /^(?:\|+|:?\|\|?:?|x\d+|\(x\d+\)|\d+x|-+|\/+|%|\.{2,}|\*+|>|\(|\))$/i;

export type SheetFormat = "chordpro" | "chords-over-words";

function tokenize(line: string): { token: string; col: number }[] {
  return [...line.matchAll(/\S+/g)].map((m) => ({ token: m[0], col: m.index }));
}

function stripParens(t: string): string {
  return t.replace(/^\(+/, "").replace(/\)+$/, "");
}

/** True if every token is a chord (or bar/repeat marks) and at least one is a chord. */
export function isChordLine(line: string): boolean {
  const tokens = tokenize(line);
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const { token } of tokens) {
    if (isChordSymbol(stripParens(token))) chords++;
    else if (!CHORD_LINE_EXTRAS_RE.test(token)) return false;
  }
  return chords > 0;
}

function sectionKind(label: string): string {
  const word =
    label
      .toLowerCase()
      .replace(/[^a-z]/g, " ")
      .trim()
      .split(/\s+/)[0] ?? "";
  if (word === "refrain") return "chorus";
  if (word === "pre" || word === "prechorus") return "prechorus";
  if (word === "post" || word === "postchorus") return "postchorus";
  return new RegExp(`^(?:${SECTION_WORDS})$`).test(word) ? word : "verse";
}

function tidyLabel(label: string): string {
  const t = label.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Bracket every chord token of a chord-only line in place, keeping the spacing. */
function chordOnlyToChordPro(line: string): string {
  let out = "";
  let last = 0;
  for (const { token, col } of tokenize(line)) {
    out += line.slice(last, col);
    const inner = stripParens(token);
    if (isChordSymbol(inner)) {
      const lead = token.slice(0, token.indexOf(inner));
      const trail = token.slice(token.indexOf(inner) + inner.length);
      out += `${lead}[${inner}]${trail}`;
    } else out += token;
    last = col + token.length;
  }
  return out.trimEnd();
}

/** Insert the chords of `chordLine` into `lyricLine` at their column positions. */
export function mergeChordAndLyricLines(chordLine: string, lyricLine: string): string {
  const chords = tokenize(chordLine)
    .map(({ token, col }) => ({ chord: stripParens(token), col }))
    .filter(({ chord }) => isChordSymbol(chord));
  let lyric = lyricLine.replace(/\s+$/, "");
  const maxCol = Math.max(...chords.map((c) => c.col), 0);
  if (lyric.length < maxCol) lyric = lyric.padEnd(maxCol, " ");
  for (let i = chords.length - 1; i >= 0; i--) {
    const { chord, col } = chords[i]!;
    lyric = `${lyric.slice(0, col)}[${chord}]${lyric.slice(col)}`;
  }
  return lyric.replace(/\s+$/, "");
}

interface HeaderMatch {
  label: string;
  rest: string | null;
}

function matchHeader(line: string): HeaderMatch | null {
  const bracket = BRACKET_HEADER_RE.exec(line);
  if (bracket && !isChordSymbol(bracket[1]!.trim())) return { label: bracket[1]!, rest: null };
  const plain = SECTION_LABEL_RE.exec(line);
  if (plain && !isChordLine(line)) return { label: plain[1]!, rest: null };
  const inline = INLINE_LABEL_RE.exec(line);
  if (inline && isChordLine(inline[2]!)) return { label: inline[1]!, rest: inline[2]! };
  return null;
}

function matchMeta(line: string): [string, string] | null {
  let m = /^\s*capo\s*:?\s*(\d{1,2})/i.exec(line);
  if (m) return ["capo", String(Number(m[1]))];
  m = /^\s*key\s*:\s*([A-G][#b♯♭]?m?)\s*$/i.exec(line);
  if (m) return ["key", m[1]!];
  m = /^\s*(?:tempo|bpm)\s*:?\s*(\d{2,3})\s*(?:bpm)?\s*$/i.exec(line);
  if (m) return ["tempo", m[1]!];
  m = /^\s*time(?:\s*signature)?\s*:\s*(\d{1,2}\/\d{1,2})\s*$/i.exec(line);
  if (m) return ["time", m[1]!];
  return null;
}

/** Guess whether pasted text is already ChordPro or chords-over-words. */
export function detectSheetFormat(text: string): SheetFormat {
  for (const line of text.split(/\r?\n/)) {
    if (parseDirective(line)) return "chordpro";
    // An inline [Chord] sitting next to lyric text is a ChordPro lyric line.
    const segs = parseLyricLine(line);
    const hasInlineChord = segs.some((s) => s.chord !== null && isChordSymbol(s.chord));
    const hasWords = segs.some((s) => /[a-z]{2,}/i.test(s.lyrics));
    if (hasInlineChord && hasWords) return "chordpro";
  }
  return "chords-over-words";
}

/** Parse chords-over-words text into a sheet model. */
export function parseChordsOverWords(text: string, meta: SheetMeta = {}): ParsedSheet {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const sheet: ParsedSheet = { meta: { ...meta }, sections: [] };
  let current: SheetSection | null = null;

  const target = (): SheetSection => {
    if (current) return current;
    current = { kind: "none", label: null, lines: [] };
    sheet.sections.push(current);
    return current;
  };
  const push = (line: SheetLine) => target().lines.push(line);
  const lyricsLine = (chordpro: string): SheetLine => ({
    type: "lyrics",
    segments: parseLyricLine(chordpro),
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\s+$/, "");

    if (line.trim() === "") {
      if (current && current.lines.length > 0) push({ type: "empty" });
      continue;
    }

    const metaMatch = matchMeta(line);
    if (metaMatch) {
      const [k, v] = metaMatch;
      if (sheet.meta[k] === undefined) sheet.meta[k] = v;
      continue;
    }

    if (TAB_LINE_RE.test(line)) {
      const tab: SheetSection = { kind: "tab", label: "Tab", lines: [] };
      while (i < lines.length && TAB_LINE_RE.test(lines[i]!)) {
        tab.lines.push({ type: "tab", text: lines[i]!.replace(/\s+$/, "") });
        i++;
      }
      i--;
      sheet.sections.push(tab);
      current = null;
      continue;
    }

    const header = matchHeader(line);
    if (header) {
      current = { kind: sectionKind(header.label), label: tidyLabel(header.label), lines: [] };
      sheet.sections.push(current);
      if (header.rest) push(lyricsLine(chordOnlyToChordPro(header.rest)));
      continue;
    }

    if (isChordLine(line)) {
      const next = lines[i + 1]?.replace(/\s+$/, "");
      const nextIsLyric =
        next !== undefined &&
        next.trim() !== "" &&
        !isChordLine(next) &&
        !matchHeader(next) &&
        !matchMeta(next) &&
        !TAB_LINE_RE.test(next);
      if (nextIsLyric) {
        push(lyricsLine(mergeChordAndLyricLines(line, next)));
        i++;
      } else {
        push(lyricsLine(chordOnlyToChordPro(line)));
      }
      continue;
    }

    push({ type: "lyrics", segments: [{ chord: null, lyrics: line }] });
  }

  for (const s of sheet.sections) {
    while (s.lines.length > 0 && s.lines[s.lines.length - 1]!.type === "empty") s.lines.pop();
  }
  sheet.sections = sheet.sections.filter((s) => s.lines.length > 0);
  return sheet;
}

/**
 * Normalize pasted sheet text (ChordPro or chords-over-words) into ChordPro, filling in
 * any metadata given (title, artist, key...) that the sheet doesn't already declare.
 */
export function toChordPro(text: string, meta: SheetMeta = {}): string {
  const format = detectSheetFormat(text);
  const sheet = format === "chordpro" ? parseChordPro(text) : parseChordsOverWords(text);
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined && v !== "" && sheet.meta[k] === undefined) sheet.meta[k] = v;
  }
  return serializeChordPro(sheet);
}
