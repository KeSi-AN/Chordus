import { describe, expect, it } from "vitest";
import {
  extractChords,
  parseChordPro,
  parseDirective,
  parseLyricLine,
  serializeChordPro,
  sheetKey,
  transposeChordPro,
  uniqueChords,
} from "./chordpro";
import { formatKey } from "./keys";

const SONG = `{title: Test Song}
{artist: Someone}
{key: G}
{time: 3/4}
# a comment line that is ignored

{start_of_verse: Verse 1}
A[G]mazing [G7]grace, how [C]sweet the [G]sound
That saved a wretch like [D]me
{end_of_verse}

{soc}
[C]Oh my [G]darling
[D]    [G]
{eoc}

{c: Bridge riff}
{sot}
e|--[x]--3--|
{eot}

{chorus}
`;

describe("parseDirective", () => {
  it("parses names, values and aliases", () => {
    expect(parseDirective("{title: Hello: World}")).toEqual({
      name: "title",
      value: "Hello: World",
    });
    expect(parseDirective("{soc}")).toEqual({ name: "start_of_chorus", value: null });
    expect(parseDirective("{ c : note }")).toEqual({ name: "comment", value: "note" });
    expect(parseDirective("[G]not a directive")).toBeNull();
  });
});

describe("parseLyricLine", () => {
  it("splits chords and lyrics", () => {
    expect(parseLyricLine("A[G]mazing [G7]grace")).toEqual([
      { chord: null, lyrics: "A" },
      { chord: "G", lyrics: "mazing " },
      { chord: "G7", lyrics: "grace" },
    ]);
  });

  it("handles chord-only lines and trailing chords", () => {
    expect(parseLyricLine("[D]  [G]")).toEqual([
      { chord: "D", lyrics: "  " },
      { chord: "G", lyrics: "" },
    ]);
    expect(parseLyricLine("plain words")).toEqual([{ chord: null, lyrics: "plain words" }]);
  });
});

describe("parseChordPro", () => {
  const sheet = parseChordPro(SONG);

  it("reads metadata", () => {
    expect(sheet.meta).toMatchObject({
      title: "Test Song",
      artist: "Someone",
      key: "G",
      time: "3/4",
    });
  });

  it("builds sections with labels", () => {
    expect(sheet.sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
      ["none", null],
      ["tab", "Tab"],
      ["chorus", "Chorus"],
    ]);
    expect(sheet.sections[0]!.lines).toHaveLength(2);
    expect(sheet.sections[2]!.lines[0]).toEqual({ type: "comment", text: "Bridge riff" });
    expect(sheet.sections[3]!.lines[0]).toEqual({ type: "tab", text: "e|--[x]--3--|" });
  });

  it("recalls the last chorus for {chorus}", () => {
    const repeat = sheet.sections[4]!;
    expect(repeat.isRepeat).toBe(true);
    expect(repeat.lines).toBe(sheet.sections[1]!.lines);
  });

  it("puts loose lines into an unlabeled section", () => {
    const s = parseChordPro("[C]Hello\n\n[G]World\n");
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]!.lines.map((l) => l.type)).toEqual(["lyrics", "empty", "lyrics"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseChordPro("{title: X}\r\n[C]Hi\r\n").meta.title).toBe("X");
  });
});

describe("serializeChordPro", () => {
  it("round-trips", () => {
    const once = serializeChordPro(parseChordPro(SONG));
    const twice = serializeChordPro(parseChordPro(once));
    expect(twice).toBe(once);
    expect(once).toContain("{start_of_verse: Verse 1}");
    expect(once).toContain("{start_of_chorus}");
    expect(once).toContain("{chorus}");
    expect(once).toContain("A[G]mazing [G7]grace, how [C]sweet the [G]sound");
  });
});

describe("chord extraction", () => {
  it("lists chords in order, skipping tabs and N.C.", () => {
    const text = "[G]a [N.C.]b [*Riff] [C]\n{sot}\n[D]\n{eot}\n[G]";
    expect(extractChords(text)).toEqual(["G", "C", "G"]);
    expect(uniqueChords(SONG)).toEqual(["G", "G7", "C", "D"]);
  });
});

describe("sheetKey", () => {
  it("uses the {key} directive", () => {
    expect(sheetKey(SONG)).toMatchObject({ detected: false });
    expect(formatKey(sheetKey(SONG)!.key)).toBe("G");
  });

  it("falls back to detection", () => {
    const k = sheetKey("[F]Hello [C]there [C7]my [F]friend");
    expect(k?.detected).toBe(true);
    expect(formatKey(k!.key)).toBe("F");
  });

  it("returns null with no chords or key", () => {
    expect(sheetKey("just words")).toBeNull();
  });
});

describe("transposeChordPro", () => {
  it("transposes chords and the key with correct spelling", () => {
    const out = transposeChordPro(SONG, -2);
    expect(out).toContain("{key: F}");
    expect(out).toContain("A[F]mazing [F7]grace, how [Bb]sweet the [F]sound");
    expect(out).toContain("like [C]me");
  });

  it("leaves tabs, annotations and N.C. alone", () => {
    const out = transposeChordPro("{key: C}\n[C]a [N.C.] [*Riff]\n{sot}\n[C]\n{eot}", 2);
    expect(out).toBe("{key: D}\n[D]a [N.C.] [*Riff]\n{sot}\n[C]\n{eot}");
  });

  it("round-trips through opposite shifts", () => {
    expect(transposeChordPro(transposeChordPro(SONG, 5), -5)).toBe(SONG);
  });

  it("is a no-op for 0 and 12", () => {
    expect(transposeChordPro(SONG, 0)).toBe(SONG);
    expect(transposeChordPro(SONG, 12)).toBe(SONG);
  });

  it("spells for a detected key when there is no {key}", () => {
    expect(transposeChordPro("[G]a [C]b [D]c [G]d", 3)).toBe("[Bb]a [Eb]b [F]c [Bb]d");
  });
});
