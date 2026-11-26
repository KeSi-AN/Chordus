import {
  audioShiftForTranspose,
  capoOptions,
  extractChords,
  formatKey,
  parseChordPro,
  parseKey,
  sheetChordTokens,
  sheetKey,
  transposeChordPro,
  transposeChordTokens,
  transposeKey,
  type CapoOption,
  type ParsedSheet,
} from "@chordus/core";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { chordSheets, songPrefs, songs, sources, type SheetOrigin } from "../db/schema";
import { getPrefsView, type PrefsView } from "./prefs";
import { getSongDetail, listSongs, type SongListItem } from "./songs";

/**
 * What the Android app needs to show a song offline, with every transpose and capo choice
 * already worked out here (all music theory stays in @chordus/core):
 *
 * - `sheet.parsed` is the sheet once, untransposed; `sheet.chords` lists its chord tokens.
 * - `shapes[i].chords` are those tokens as played when the shapes are `i` semitones above the
 *   original (i = (transpose − capo) mod 12), which is what the sheet shows.
 * - `sounding[t]` is the song at transpose t (mod 12): the key it sounds in, its capo options
 *   ranked for playability, and the audio shift that matches it when pitch is linked.
 */
export interface MobileSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string | null;
  bpm: number | null;
  timeSignature: string;
  /** Changes whenever anything shown here changes (see `songVersion`). */
  version: string;
  sheet: {
    id: string;
    origin: SheetOrigin;
    parsed: ParsedSheet;
    chords: string[];
  } | null;
  shapes: { key: string | null; chords: string[] }[];
  sounding: { key: string | null; capoOptions: CapoOption[]; audioShift: number }[];
  prefs: PrefsView;
  audio: { sourceId: string; filename: string | null; mimeType: string | null } | null;
}

export interface MobileSongSummary extends SongListItem {
  version: string;
}

/** Make sure the sheet declares the song's key, so transposition spells chords for it. */
function withKey(chordpro: string, key: string | null): string {
  if (!key || parseChordPro(chordpro).meta.key) return chordpro;
  return `{key: ${key}}\n${chordpro}`;
}

/**
 * Per-song version strings for syncing: the song row, its newest sheet, its prefs and its
 * newest audio source. (Suggestions for unconfirmed fields also depend on other songs; the app
 * refreshes a song it opens while online, so those don't need to be part of the version.)
 */
async function songVersions(db: Db, userId: string): Promise<Map<string, string>> {
  const songId = sql.raw(`"songs"."id"`);
  const rows = await db
    .select({
      id: songs.id,
      updated: songs.updatedAt,
      sheet: sql<
        number | null
      >`(SELECT MAX(${chordSheets.createdAt}) FROM ${chordSheets} WHERE ${chordSheets.songId} = ${songId})`,
      prefs: sql<
        number | null
      >`(SELECT MAX(${songPrefs.updatedAt}) FROM ${songPrefs} WHERE ${songPrefs.songId} = ${songId} AND ${songPrefs.userId} = ${userId})`,
      audio: sql<
        number | null
      >`(SELECT MAX(${sources.createdAt}) FROM ${sources} WHERE ${sources.songId} = ${songId})`,
    })
    .from(songs)
    .where(eq(songs.userId, userId));
  return new Map(
    rows.map((r) => [
      r.id,
      [r.updated.getTime(), r.sheet ?? 0, r.prefs ?? 0, r.audio ?? 0].join("."),
    ]),
  );
}

export async function listMobileSongs(db: Db, userId: string): Promise<MobileSongSummary[]> {
  const [list, versions] = await Promise.all([
    listSongs(db, { userId, limit: 5000 }),
    songVersions(db, userId),
  ]);
  return list.map((s) => ({ ...s, version: versions.get(s.id) ?? "0" }));
}

export async function getMobileSong(db: Db, userId: string, id: string): Promise<MobileSong> {
  const [detail, prefs, versions] = await Promise.all([
    getSongDetail(db, userId, id),
    getPrefsView(db, userId, id),
    songVersions(db, userId),
  ]);
  const { song, sheet, audio } = detail;
  const base = sheet ? withKey(sheet.chordpro, song.originalKey) : "";
  const original = song.originalKey ? parseKey(song.originalKey) : (sheetKey(base)?.key ?? null);
  const parsed = sheet ? parseChordPro(base) : null;
  const tokens = parsed ? sheetChordTokens(parsed) : [];
  const steps = Array.from({ length: 12 }, (_, i) => i);

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    originalKey: song.originalKey,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    version: versions.get(id) ?? "0",
    sheet: sheet && parsed ? { id: sheet.id, origin: sheet.origin, parsed, chords: tokens } : null,
    shapes: steps.map((i) => ({
      key: original ? formatKey(transposeKey(original, i)) : null,
      chords: transposeChordTokens(base, tokens, i),
    })),
    sounding: steps.map((t) => {
      const key = original ? transposeKey(original, t) : null;
      return {
        key: key ? formatKey(key) : null,
        capoOptions: key
          ? capoOptions({ key, chords: extractChords(transposeChordPro(base, t)) })
          : [],
        audioShift: audioShiftForTranspose(t),
      };
    }),
    prefs,
    audio: audio
      ? { sourceId: audio.id, filename: audio.originalFilename, mimeType: audio.mimeType }
      : null,
  };
}
