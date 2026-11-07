import { describe, expect, it } from "vitest";
import { parseChordPro } from "./chordpro";
import {
  detectSheetFormat,
  isChordLine,
  mergeChordAndLyricLines,
  parseChordsOverWords,
  toChordPro,
} from "./chords-over-words";

describe("isChordLine", () => {
  it.each([
    ["G        C       G", true],
    ["  Am   F   C   G  ", true],
    ["| G  C | D  G |", true],
    ["G C D x2", true],
    ["(G)  D/F#  Em7", true],
    ["N.C.", true],
    ["A man walked in", false],
    ["Am I wrong", false],
    ["Do re mi", false],
    ["", false],
    ["| | |", false],
  ])("%j → %s", (line, expected) => {
    expect(isChordLine(line)).toBe(expected);
  });
});

describe("mergeChordAndLyricLines", () => {
  it("places chords at their columns", () => {
    expect(
      mergeChordAndLyricLines("G       C          G", "Amazing grace, how sweet the sound"),
    ).toBe("[G]Amazing [C]grace, how [G]sweet the sound");
  });

  it("places chords mid-word", () => {
    expect(mergeChordAndLyricLines(" G", "Amazing")).toBe("A[G]mazing");
  });

  it("pads short lyric lines for trailing chords", () => {
    expect(mergeChordAndLyricLines("C         G", "Oh my")).toBe("[C]Oh my     [G]");
  });
});

describe("parseChordsOverWords", () => {
  const TEXT = `Capo: 2
Key: G

[Intro]
G  C  G  D

[Verse 1]
G       C          G
Amazing grace, how sweet the sound
                    D
That saved a wretch like me

Chorus:
C          G
Oh my darling
no chords on this line

Outro: G C G
e|-----3---|
B|---0-----|
`;
  const sheet = parseChordsOverWords(TEXT);

  it("extracts metadata", () => {
    expect(sheet.meta).toEqual({ capo: "2", key: "G" });
  });

  it("builds sections", () => {
    expect(sheet.sections.map((s) => [s.kind, s.label])).toEqual([
      ["intro", "Intro"],
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
      ["outro", "Outro"],
      ["tab", "Tab"],
    ]);
  });

  it("merges chord lines into lyrics", () => {
    const verse = sheet.sections[1]!;
    expect(verse.lines).toHaveLength(2);
    expect(verse.lines[0]).toEqual({
      type: "lyrics",
      segments: [
        { chord: "G", lyrics: "Amazing " },
        { chord: "C", lyrics: "grace, how " },
        { chord: "G", lyrics: "sweet the sound" },
      ],
    });
  });

  it("keeps chord-only lines and plain lyric lines", () => {
    const intro = sheet.sections[0]!.lines[0]!;
    expect(intro.type === "lyrics" && intro.segments.map((s) => s.chord)).toEqual([
      "G",
      "C",
      "G",
      "D",
    ]);
    const chorus = sheet.sections[2]!;
    expect(chorus.lines[1]).toEqual({
      type: "lyrics",
      segments: [{ chord: null, lyrics: "no chords on this line" }],
    });
  });

  it("puts inline 'Label: chords' on the section", () => {
    const outro = sheet.sections[3]!.lines[0]!;
    expect(outro.type === "lyrics" && outro.segments.map((s) => s.chord)).toEqual([
      "G",
      "C",
      "G",
    ]);
  });

  it("groups tab lines", () => {
    expect(sheet.sections[4]!.lines).toHaveLength(2);
  });

  it("treats lyrics without any chords as loose lines", () => {
    const s = parseChordsOverWords("Just some words\nAnd more words");
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]!.kind).toBe("none");
  });
});

describe("detectSheetFormat", () => {
  it("recognizes ChordPro", () => {
    expect(detectSheetFormat("{title: X}\nhello")).toBe("chordpro");
    expect(detectSheetFormat("A[G]mazing grace")).toBe("chordpro");
  });

  it("recognizes chords over words", () => {
    expect(detectSheetFormat("[Verse]\nG   C\nHello there")).toBe("chords-over-words");
    expect(detectSheetFormat("[G] [C] [D]")).toBe("chords-over-words");
  });
});

describe("toChordPro", () => {
  it("converts chords over words and adds metadata", () => {
    const out = toChordPro("[Chorus]\nC     G\nOh my darling", { title: "Clementine", artist: "" });
    expect(out).toBe(
      "{title: Clementine}\n\n{start_of_chorus}\n[C]Oh my [G]darling\n{end_of_chorus}\n",
    );
  });

  it("normalizes ChordPro input without losing content", () => {
    const src = "{title: A}\n{key: G}\n\n{start_of_verse}\n[G]Hi [C]there\n{end_of_verse}\n";
    expect(toChordPro(src)).toBe(src);
  });

  it("does not override declared metadata", () => {
    const out = toChordPro("{title: Real}\n[G]Hi there", { title: "Other", key: "G" });
    expect(parseChordPro(out).meta).toEqual({ title: "Real", key: "G" });
  });
});
