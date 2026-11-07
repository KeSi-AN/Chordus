import {
  formatKey,
  parseChordPro,
  parseKey,
  parseTimeSignature,
  sheetKey,
  toChordPro,
} from "@chordus/core";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  chordSheets,
  events,
  songPrefs,
  songs,
  sources,
  type ChordSheet,
  type SheetOrigin,
  type Song,
  type Source,
  type VocalistHint,
} from "../db/schema";
import { logEvent } from "./events";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface SongListItem {
  id: string;
  title: string;
  artist: string;
  originalKey: string | null;
  hasAudio: boolean;
  confirmed: boolean;
  updatedAt: Date;
  lastOpenedAt: Date | null;
}

export type SongFilter = "all" | "confirmed" | "unconfirmed" | "has_audio";

export interface ListSongsInput {
  userId: string;
  query?: string;
  filter?: SongFilter;
  key?: string;
  limit?: number;
}

/** Turn free text into a safe FTS5 prefix query: `"foo"* "bar"*`. */
export function toFtsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/'/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

/** Library listing with FTS search on title/artist and filters. */
export async function listSongs(db: Db, input: ListSongsInput): Promise<SongListItem[]> {
  const fts = input.query ? toFtsQuery(input.query) : null;
  // Drizzle renders columns unqualified inside select-list subqueries, so reference the outer
  // songs.id explicitly.
  const songId = sql.raw(`"songs"."id"`);
  const hasAudio = sql<number>`EXISTS (SELECT 1 FROM ${sources} WHERE ${sources.songId} = ${songId} AND ${sources.kind} IN ('file', 'youtube') AND ${sources.filePath} IS NOT NULL)`;
  const confirmed = sql<number>`EXISTS (SELECT 1 FROM ${songPrefs} WHERE ${songPrefs.songId} = ${songId} AND ${songPrefs.userId} = ${input.userId} AND ${songPrefs.confirmedAt} IS NOT NULL)`;
  const lastOpened = sql<
    number | null
  >`(SELECT MAX(${events.createdAt}) FROM ${events} WHERE ${events.songId} = ${songId} AND ${events.type} IN ('open_song', 'play'))`;

  const conditions = [eq(songs.userId, input.userId)];
  if (fts) {
    conditions.push(
      sql`${songs}.rowid IN (SELECT rowid FROM songs_fts WHERE songs_fts MATCH ${fts})`,
    );
  }
  if (input.filter === "confirmed") conditions.push(sql`${confirmed} = 1`);
  if (input.filter === "unconfirmed") conditions.push(sql`${confirmed} = 0`);
  if (input.filter === "has_audio") conditions.push(sql`${hasAudio} = 1`);
  if (input.key) {
    const k = parseKey(input.key);
    if (k) conditions.push(eq(songs.originalKey, formatKey(k)));
  }

  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      originalKey: songs.originalKey,
      updatedAt: songs.updatedAt,
      hasAudio,
      confirmed,
      lastOpened,
    })
    .from(songs)
    .where(and(...conditions))
    .orderBy(sql`lower(${songs.title})`)
    .limit(input.limit ?? 500);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    originalKey: r.originalKey,
    updatedAt: r.updatedAt,
    hasAudio: Boolean(r.hasAudio),
    confirmed: Boolean(r.confirmed),
    lastOpenedAt: r.lastOpened ? new Date(r.lastOpened) : null,
  }));
}

export interface CreateSongInput {
  userId: string;
  title: string;
  artist?: string;
  /** Pasted sheet: ChordPro or chords-over-words. */
  sheetText: string;
  key?: string | null;
  timeSignature?: string | null;
  bpm?: number | null;
  vocalistHint?: VocalistHint;
}

/** Fill in key / time / tempo: explicit input first, then the sheet's directives, then detection. */
function resolveSongMeta(chordpro: string, input: Partial<CreateSongInput>) {
  const meta = parseChordPro(chordpro).meta;
  const explicitKey = input.key ? parseKey(input.key) : null;
  const key = explicitKey ?? sheetKey(chordpro)?.key ?? null;
  const ts = input.timeSignature ?? meta.time ?? "4/4";
  const tempo = input.bpm ?? (meta.tempo ? Number(meta.tempo) : null);
  return {
    originalKey: key ? formatKey(key) : null,
    timeSignature: parseTimeSignature(ts) ? ts.replace(/\s+/g, "") : "4/4",
    bpm: tempo && Number.isFinite(tempo) && tempo > 0 ? tempo : null,
  };
}

export async function createSongFromSheet(db: Db, input: CreateSongInput): Promise<Song> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("Title is required");
  if (!input.sheetText.trim()) throw new ValidationError("Paste a chord sheet");
  const artist = input.artist?.trim() ?? "";

  const chordpro = toChordPro(input.sheetText, {
    title,
    ...(artist ? { artist } : {}),
    ...(input.key ? { key: input.key } : {}),
  });
  const meta = resolveSongMeta(chordpro, input);
  const id = crypto.randomUUID();

  await db.batch([
    db.insert(songs).values({
      id,
      userId: input.userId,
      title,
      artist,
      originalKey: meta.originalKey,
      timeSignature: meta.timeSignature,
      bpm: meta.bpm,
      vocalistHint: input.vocalistHint ?? "unknown",
    }),
    db.insert(sources).values({ songId: id, kind: "manual" }),
    db.insert(chordSheets).values({ songId: id, chordpro, origin: "pasted", isPrimary: true }),
  ]);
  await logEvent(db, { userId: input.userId, songId: id, type: "song_created", payload: {} });
  const [song] = await db.select().from(songs).where(eq(songs.id, id));
  return song!;
}

export interface SongDetail {
  song: Song;
  sheet: ChordSheet | null;
  sources: Source[];
  /** Most recent uploaded audio file, if any. */
  audio: Source | null;
}

export async function getSongDetail(db: Db, userId: string, id: string): Promise<SongDetail> {
  const [song] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.userId, userId)));
  if (!song) throw new NotFoundError("Song");
  const [sheet] = await db
    .select()
    .from(chordSheets)
    .where(and(eq(chordSheets.songId, id), eq(chordSheets.isPrimary, true)))
    .orderBy(desc(chordSheets.createdAt))
    .limit(1);
  const srcs = await db
    .select()
    .from(sources)
    .where(eq(sources.songId, id))
    .orderBy(desc(sources.createdAt), desc(sql`${sources}.rowid`));
  const audio = srcs.find((s) => s.kind === "file" && s.filePath) ?? null;
  return { song, sheet: sheet ?? null, sources: srcs, audio };
}

export interface UpdateSongInput {
  title?: string;
  artist?: string;
  originalKey?: string | null;
  timeSignature?: string;
  bpm?: number | null;
  vocalistHint?: VocalistHint;
}

export async function updateSong(
  db: Db,
  userId: string,
  id: string,
  patch: UpdateSongInput,
): Promise<Song> {
  const set: Partial<typeof songs.$inferInsert> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new ValidationError("Title is required");
    set.title = patch.title.trim();
  }
  if (patch.artist !== undefined) set.artist = patch.artist.trim();
  if (patch.originalKey !== undefined) {
    const k = patch.originalKey ? parseKey(patch.originalKey) : null;
    if (patch.originalKey && !k) throw new ValidationError(`Unknown key "${patch.originalKey}"`);
    set.originalKey = k ? formatKey(k) : null;
  }
  if (patch.timeSignature !== undefined) {
    if (!parseTimeSignature(patch.timeSignature)) {
      throw new ValidationError(`Invalid time signature "${patch.timeSignature}"`);
    }
    set.timeSignature = patch.timeSignature.replace(/\s+/g, "");
  }
  if (patch.bpm !== undefined) set.bpm = patch.bpm;
  if (patch.vocalistHint !== undefined) set.vocalistHint = patch.vocalistHint;
  if (Object.keys(set).length > 0) {
    set.updatedAt = new Date();
    await db
      .update(songs)
      .set(set)
      .where(and(eq(songs.id, id), eq(songs.userId, userId)));
  }
  return (await getSongDetail(db, userId, id)).song;
}

/** Save an edited sheet as a new version and make it the primary one. */
export async function saveSheetVersion(
  db: Db,
  userId: string,
  songId: string,
  text: string,
  origin: SheetOrigin = "edited",
): Promise<ChordSheet> {
  const { song } = await getSongDetail(db, userId, songId);
  if (!text.trim()) throw new ValidationError("Sheet is empty");
  const chordpro = toChordPro(text, { title: song.title });
  const id = crypto.randomUUID();
  await db.batch([
    db.update(chordSheets).set({ isPrimary: false }).where(eq(chordSheets.songId, songId)),
    db.insert(chordSheets).values({ id, songId, chordpro, origin, isPrimary: true }),
    db.update(songs).set({ updatedAt: new Date() }).where(eq(songs.id, songId)),
  ]);
  await logEvent(db, { userId, songId, type: "sheet_edited", payload: { sheetId: id } });
  const [sheet] = await db.select().from(chordSheets).where(eq(chordSheets.id, id));
  return sheet!;
}

export async function deleteSong(db: Db, userId: string, id: string): Promise<Source[]> {
  const { sources: srcs } = await getSongDetail(db, userId, id);
  await db.delete(songs).where(and(eq(songs.id, id), eq(songs.userId, userId)));
  return srcs;
}

/** Songs most recently opened or played. */
export async function recentlyPlayed(db: Db, userId: string, limit = 6): Promise<SongListItem[]> {
  const all = await listSongs(db, { userId });
  return all
    .filter((s) => s.lastOpenedAt)
    .sort((a, b) => b.lastOpenedAt!.getTime() - a.lastOpenedAt!.getTime())
    .slice(0, limit);
}

/** Unconfirmed songs, most recently touched first. */
export async function needsConfirming(db: Db, userId: string, limit = 6): Promise<SongListItem[]> {
  const all = await listSongs(db, { userId, filter: "unconfirmed" });
  const touched = (s: SongListItem) =>
    Math.max(s.lastOpenedAt?.getTime() ?? 0, s.updatedAt.getTime());
  return all.sort((a, b) => touched(b) - touched(a)).slice(0, limit);
}

/** Distinct original keys in the library (for the key filter). */
export async function libraryKeys(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ key: songs.originalKey })
    .from(songs)
    .where(and(eq(songs.userId, userId), sql`${songs.originalKey} IS NOT NULL`));
  return rows.map((r) => r.key!).sort();
}
