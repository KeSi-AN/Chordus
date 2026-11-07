import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema. Every user-owned table carries `userId` so more users can be added later.
 * IDs are text UUIDs (safe to merge across local + hosted databases).
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    // Set in the app too: columns added by ALTER TABLE can only have a constant DB default.
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export type VocalistHint = "male" | "female" | "unknown";
export type SourceKind = "file" | "youtube" | "import" | "manual";
export type SheetOrigin = "detected" | "pasted" | "imported_open" | "edited";
export type AnalysisStatus = "queued" | "running" | "done" | "failed";
export type PrefState = "suggested" | "edited" | "confirmed";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ChordTimelineEntry {
  start: number;
  end: number;
  chord: string;
  confidence: number;
}

export interface SuggestionMeta {
  source: string;
  confidence: number;
  reason: string;
}

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const songs = sqliteTable(
  "songs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    originalKey: text("original_key"),
    bpm: real("bpm"),
    timeSignature: text("time_signature").notNull().default("4/4"),
    durationSec: real("duration_sec"),
    vocalistHint: text("vocalist_hint").$type<VocalistHint>().notNull().default("unknown"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("songs_user_idx").on(t.userId), index("songs_artist_idx").on(t.artist)],
);

export const sources = sqliteTable(
  "sources",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SourceKind>().notNull(),
    youtubeVideoId: text("youtube_video_id"),
    /** Storage key (relative path inside the storage backend), not an absolute path. */
    filePath: text("file_path"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    license: text("license"),
    attribution: text("attribution"),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_song_idx").on(t.songId), index("sources_yt_idx").on(t.youtubeVideoId)],
);

export const chordSheets = sqliteTable(
  "chord_sheets",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    chordpro: text("chordpro").notNull(),
    origin: text("origin").$type<SheetOrigin>().notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("chord_sheets_song_idx").on(t.songId, t.isPrimary)],
);

export const analyses = sqliteTable(
  "analyses",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    status: text("status").$type<AnalysisStatus>().notNull().default("queued"),
    /** Human-readable pipeline stage ("Downloading", "Detecting chords", ...). */
    stage: text("stage"),
    /** 0..1 progress for the UI. */
    progress: real("progress").notNull().default(0),
    error: text("error"),
    key: text("key"),
    keyConfidence: real("key_confidence"),
    bpm: real("bpm"),
    chordTimeline: text("chord_timeline", { mode: "json" }).$type<ChordTimelineEntry[]>(),
    melodyLowMidi: real("melody_low_midi"),
    melodyHighMidi: real("melody_high_midi"),
    melodyP10Midi: real("melody_p10_midi"),
    melodyP90Midi: real("melody_p90_midi"),
    vocalStemPath: text("vocal_stem_path"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("analyses_song_idx").on(t.songId)],
);

export const strumPatterns = sqliteTable("strum_patterns", {
  id: id(),
  /** Null for built-in presets. */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  timeSignature: text("time_signature").notNull(),
  /** Slot length as a note value: 8 = eighth notes, 16 = sixteenth notes. */
  subdivision: integer("subdivision").notNull(),
  /** One character per slot: D = down, U = up, x = muted, - = rest. */
  pattern: text("pattern").notNull(),
  isPreset: integer("is_preset", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const songPrefs = sqliteTable(
  "song_prefs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    transposeSemitones: integer("transpose_semitones").notNull().default(0),
    transposeState: text("transpose_state").$type<PrefState>().notNull().default("suggested"),
    audioPitchSemitones: integer("audio_pitch_semitones").notNull().default(0),
    audioPitchState: text("audio_pitch_state").$type<PrefState>().notNull().default("suggested"),
    /** Whether audio pitch follows chord transpose (see plan section 5.1). */
    pitchLinked: integer("pitch_linked", { mode: "boolean" }).notNull().default(true),
    capoFret: integer("capo_fret").notNull().default(0),
    capoState: text("capo_state").$type<PrefState>().notNull().default("suggested"),
    strumPatternId: text("strum_pattern_id").references(() => strumPatterns.id, {
      onDelete: "set null",
    }),
    strumState: text("strum_state").$type<PrefState>().notNull().default("suggested"),
    /** Suggestion metadata per field, keyed by field name. */
    suggestionMeta: text("suggestion_meta", { mode: "json" }).$type<
      Partial<Record<"transpose" | "audioPitch" | "capo" | "strum", SuggestionMeta>>
    >(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("song_prefs_user_song_idx").on(t.userId, t.songId)],
);

export const events = sqliteTable(
  "events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id").references(() => songs.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_user_created_idx").on(t.userId, t.createdAt),
    index("events_song_idx").on(t.songId),
    index("events_type_idx").on(t.type),
  ],
);

export const voiceProfile = sqliteTable(
  "voice_profile",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    comfortLowMidi: real("comfort_low_midi"),
    comfortHighMidi: real("comfort_high_midi"),
    maxLowMidi: real("max_low_midi"),
    maxHighMidi: real("max_high_midi"),
    confidence: real("confidence").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type ChordSheet = typeof chordSheets.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
export type StrumPattern = typeof strumPatterns.$inferSelect;
export type SongPrefs = typeof songPrefs.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type VoiceProfile = typeof voiceProfile.$inferSelect;
export type Job = typeof jobs.$inferSelect;
