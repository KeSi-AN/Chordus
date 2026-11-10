import { parseYouTubeVideoId } from "@chordus/core";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  analyses,
  jobs,
  songs,
  sources,
  type Analysis,
  type ChordTimelineEntry,
  type Source,
  type VocalistHint,
} from "../db/schema";
import type { Storage } from "../storage";
import { attachAudioFile } from "./audio";
import { logEvent } from "./events";
import { getSongDetail, ValidationError } from "./songs";

/**
 * What the song page needs to show analysis progress and results. The chord timeline is left
 * out on purpose: this is polled every 2 s while a job runs, and a timeline is 10-15 KB.
 * The page loads it once through `latestTimeline`.
 */
export type AnalysisView = Pick<
  Analysis,
  | "id"
  | "status"
  | "stage"
  | "progress"
  | "error"
  | "key"
  | "keyConfidence"
  | "bpm"
  | "melodyLowMidi"
  | "melodyHighMidi"
  | "melodyP10Midi"
  | "melodyP90Midi"
  | "sourceId"
> & { createdAt: string };

function toView(a: Analysis): AnalysisView {
  return {
    id: a.id,
    status: a.status,
    stage: a.stage,
    progress: a.progress,
    error: a.error,
    key: a.key,
    keyConfidence: a.keyConfidence,
    bpm: a.bpm,
    melodyLowMidi: a.melodyLowMidi,
    melodyHighMidi: a.melodyHighMidi,
    melodyP10Midi: a.melodyP10Midi,
    melodyP90Midi: a.melodyP90Midi,
    sourceId: a.sourceId,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Queue an analysis job for one source of a song (the Python worker picks it up). */
export async function queueAnalysis(
  db: Db,
  userId: string,
  songId: string,
  sourceId: string,
): Promise<AnalysisView> {
  const analysisId = crypto.randomUUID();
  await db.batch([
    db.insert(analyses).values({ id: analysisId, songId, sourceId, status: "queued", progress: 0 }),
    db.insert(jobs).values({
      type: "analyze",
      payload: { analysisId, songId, sourceId },
      status: "queued",
    }),
  ]);
  await logEvent(db, {
    userId,
    songId,
    type: "analysis_queued",
    payload: { analysisId, sourceId },
  });
  return (await getAnalysis(db, userId, analysisId))!;
}

export async function getAnalysis(
  db: Db,
  userId: string,
  analysisId: string,
): Promise<AnalysisView | null> {
  const [row] = await db
    .select({ a: analyses })
    .from(analyses)
    .innerJoin(songs, eq(songs.id, analyses.songId))
    .where(and(eq(analyses.id, analysisId), eq(songs.userId, userId)));
  return row ? toView(row.a) : null;
}

export async function latestAnalysis(db: Db, songId: string): Promise<AnalysisView | null> {
  const [row] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.songId, songId))
    // createdAt can tie within a second for DB-defaulted rows; rowid breaks the tie.
    .orderBy(desc(analyses.createdAt), desc(sql`${analyses}.rowid`))
    .limit(1);
  return row ? toView(row) : null;
}

export interface SongTimeline {
  analysisId: string;
  /** The audio the timeline was computed from; it only applies while that audio plays. */
  sourceId: string | null;
  entries: ChordTimelineEntry[];
}

/**
 * The chord timeline that goes with the song's current detected sheet: the newest one any
 * analysis has produced, whatever that analysis's status.
 *
 * Not simply "the latest analysis, if done": a running analysis writes its draft timeline at
 * the moment its draft sheet becomes the primary one, minutes before it finishes, and an
 * analysis that failed or has only just started has none, in which case the previous
 * analysis's sheet (and so its timeline) is still what is on screen.
 */
export async function latestTimeline(db: Db, songId: string): Promise<SongTimeline | null> {
  const [row] = await db
    .select({
      analysisId: analyses.id,
      sourceId: analyses.sourceId,
      entries: analyses.chordTimeline,
    })
    .from(analyses)
    .where(and(eq(analyses.songId, songId), isNotNull(analyses.chordTimeline)))
    .orderBy(desc(analyses.createdAt), desc(sql`${analyses}.rowid`))
    .limit(1);
  if (!row?.entries || row.entries.length === 0) return null;
  return { analysisId: row.analysisId, sourceId: row.sourceId, entries: row.entries };
}

function placeholderTitle(kind: "youtube" | "file", name?: string): string {
  if (kind === "file" && name)
    return name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_]+/g, " ")
      .trim();
  return "Untitled (YouTube)";
}

export interface ImportResult {
  songId: string;
  analysis: AnalysisView | null;
  /** True when this YouTube video was already in the library. */
  existing: boolean;
}

export interface ImportYouTubeInput {
  userId: string;
  url: string;
  title?: string;
  artist?: string;
  vocalistHint?: VocalistHint;
}

/** New song from a YouTube link: the analyzer downloads the audio and drafts the chords. */
export async function importFromYouTube(db: Db, input: ImportYouTubeInput): Promise<ImportResult> {
  const videoId = parseYouTubeVideoId(input.url);
  if (!videoId) throw new ValidationError("That doesn't look like a YouTube link");

  const [dupe] = await db
    .select({ songId: sources.songId })
    .from(sources)
    .innerJoin(songs, eq(songs.id, sources.songId))
    .where(and(eq(sources.youtubeVideoId, videoId), eq(songs.userId, input.userId)))
    .limit(1);
  if (dupe)
    return { songId: dupe.songId, analysis: await latestAnalysis(db, dupe.songId), existing: true };

  const songId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  await db.batch([
    db.insert(songs).values({
      id: songId,
      userId: input.userId,
      title: input.title?.trim() || placeholderTitle("youtube"),
      artist: input.artist?.trim() ?? "",
      vocalistHint: input.vocalistHint ?? "unknown",
    }),
    db.insert(sources).values({
      id: sourceId,
      songId,
      kind: "youtube",
      youtubeVideoId: videoId,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    }),
  ]);
  await logEvent(db, {
    userId: input.userId,
    songId,
    type: "song_created",
    payload: { from: "youtube", videoId },
  });
  return {
    songId,
    analysis: await queueAnalysis(db, input.userId, songId, sourceId),
    existing: false,
  };
}

export interface ImportFileInput {
  userId: string;
  file: File;
  maxBytes: number;
  title?: string;
  artist?: string;
  vocalistHint?: VocalistHint;
}

/** New song from an audio file: stored now, analyzed by the worker. */
export async function importFromFile(
  db: Db,
  storage: Storage,
  input: ImportFileInput,
): Promise<ImportResult> {
  const songId = crypto.randomUUID();
  await db.insert(songs).values({
    id: songId,
    userId: input.userId,
    title: input.title?.trim() || placeholderTitle("file", input.file.name) || "Untitled",
    artist: input.artist?.trim() ?? "",
    vocalistHint: input.vocalistHint ?? "unknown",
  });
  let source: Source;
  try {
    source = await attachAudioFile(db, storage, {
      userId: input.userId,
      songId,
      file: input.file,
      maxBytes: input.maxBytes,
    });
  } catch (err) {
    await db.delete(songs).where(eq(songs.id, songId));
    throw err;
  }
  await logEvent(db, {
    userId: input.userId,
    songId,
    type: "song_created",
    payload: { from: "file" },
  });
  return {
    songId,
    analysis: await queueAnalysis(db, input.userId, songId, source.id),
    existing: false,
  };
}

/** (Re-)analyze a song's current audio: its uploaded file, or its YouTube source. */
export async function analyzeSong(db: Db, userId: string, songId: string): Promise<AnalysisView> {
  const { sources: srcs } = await getSongDetail(db, userId, songId);
  const source =
    srcs.find((s) => (s.kind === "file" || s.kind === "youtube") && s.filePath) ??
    srcs.find((s) => s.kind === "youtube" && s.youtubeVideoId);
  if (!source) throw new ValidationError("Attach audio or a YouTube link first");
  const running = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.songId, songId), inArray(analyses.status, ["queued", "running"])));
  if (running.length > 0) throw new ValidationError("An analysis is already in progress");
  return queueAnalysis(db, userId, songId, source.id);
}
