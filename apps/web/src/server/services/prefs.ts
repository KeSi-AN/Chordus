import {
  audioShiftForTranspose,
  clampAudioShift,
  extractChords,
  formatSemitones,
  normalizeTranspose,
  parseKey,
  suggestCapo,
  suggestLinkedAudioShift,
  suggestStrumPreset,
  suggestTransposeFallback,
  transposeChordPro,
  transposeKey,
  type PrefField,
  type Suggestion,
  type SuggestionSource,
} from "@chordus/core";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { songPrefs, songs, strumPatterns, type SongPrefs, type SuggestionMeta } from "../db/schema";
import { presetId } from "../seed/seed";
import { logEvent } from "./events";
import { getSongDetail, ValidationError } from "./songs";

export type PrefFieldName = "transpose" | "audioPitch" | "capo" | "strum";
export const PREF_FIELDS: readonly PrefFieldName[] = ["transpose", "audioPitch", "capo", "strum"];

export interface SongSuggestions {
  transpose: Suggestion<number>;
  audioPitch: Suggestion<number>;
  capo: Suggestion<number>;
  strum: Suggestion<string | null>;
}

/** What the song view shows: each field is either confirmed or a suggestion. */
export interface PrefsView {
  transpose: PrefField<number>;
  audioPitch: PrefField<number>;
  capo: PrefField<number>;
  strum: PrefField<string | null>;
  pitchLinked: boolean;
  confirmedAt: string | null;
}

export interface ConfirmInput {
  transposeSemitones: number;
  audioPitchSemitones: number;
  pitchLinked: boolean;
  capoFret: number;
  strumPatternId: string | null;
}

/**
 * Compute fresh suggestions for every field, ignoring confirmed values.
 * Phase 1: transpose comes from the artist / vocalist / global median fallbacks.
 */
export async function computeSuggestions(
  db: Db,
  userId: string,
  songId: string,
  opts: { transposeOverride?: number } = {},
): Promise<SongSuggestions> {
  const { song, sheet } = await getSongDetail(db, userId, songId);

  const history = await db
    .select({
      songId: songPrefs.songId,
      transposeSemitones: songPrefs.transposeSemitones,
      artist: songs.artist,
      vocalistHint: songs.vocalistHint,
    })
    .from(songPrefs)
    .innerJoin(songs, eq(songs.id, songPrefs.songId))
    .where(
      and(
        eq(songPrefs.userId, userId),
        eq(songPrefs.transposeState, "confirmed"),
        isNotNull(songPrefs.confirmedAt),
      ),
    );

  const transpose = suggestTransposeFallback({
    songId,
    artist: song.artist,
    vocalistHint: song.vocalistHint,
    history,
  });
  // Capo is ranked for whatever transpose ends up in effect.
  const effectiveTranspose = opts.transposeOverride ?? transpose.value;
  const audioPitch = suggestLinkedAudioShift(transpose);

  const originalKey = song.originalKey ? parseKey(song.originalKey) : null;
  const soundingKey = originalKey ? transposeKey(originalKey, effectiveTranspose) : null;
  const soundingChords = sheet
    ? extractChords(transposeChordPro(sheet.chordpro, effectiveTranspose))
    : [];
  const capo = suggestCapo(soundingKey, soundingChords);

  const strumSuggestion = suggestStrumPreset(song.timeSignature);
  const strum: Suggestion<string | null> = {
    ...strumSuggestion,
    value: strumSuggestion.value ? presetId(strumSuggestion.value.name) : null,
  };
  return { transpose, audioPitch, capo, strum };
}

function confirmedField<T>(value: T, confirmedAt: Date | null): PrefField<T> {
  return {
    value,
    state: "confirmed",
    source: "user" as SuggestionSource,
    confidence: 1,
    reason: confirmedAt ? `Confirmed ${confirmedAt.toISOString().slice(0, 10)}` : "Confirmed",
  };
}

function suggestedField<T>(s: Suggestion<T>): PrefField<T> {
  return { ...s, state: "suggested" };
}

export async function getPrefsRow(
  db: Db,
  userId: string,
  songId: string,
): Promise<SongPrefs | null> {
  const [row] = await db
    .select()
    .from(songPrefs)
    .where(and(eq(songPrefs.userId, userId), eq(songPrefs.songId, songId)));
  return row ?? null;
}

/** Confirmed values always win; anything not confirmed is filled with a fresh suggestion. */
export async function getPrefsView(db: Db, userId: string, songId: string): Promise<PrefsView> {
  const row = await getPrefsRow(db, userId, songId);
  const confirmed = (state: string | undefined) => state === "confirmed";
  const transposeConfirmed = row && confirmed(row.transposeState);
  const suggestions = await computeSuggestions(db, userId, songId, {
    transposeOverride: transposeConfirmed ? row.transposeSemitones : undefined,
  });
  const at = row?.confirmedAt ?? null;
  const pitchLinked = row?.pitchLinked ?? true;

  let audioPitch: PrefField<number>;
  if (row && confirmed(row.audioPitchState)) {
    audioPitch = confirmedField(row.audioPitchSemitones, at);
  } else if (transposeConfirmed && pitchLinked) {
    const value = audioShiftForTranspose(row.transposeSemitones);
    audioPitch = {
      value,
      state: "suggested",
      source: "linked",
      confidence: 0.9,
      reason: `Follows your confirmed transpose (${formatSemitones(value)})`,
    };
  } else {
    audioPitch = suggestedField(suggestions.audioPitch);
  }

  return {
    transpose: transposeConfirmed
      ? confirmedField(row.transposeSemitones, at)
      : suggestedField(suggestions.transpose),
    audioPitch,
    capo:
      row && confirmed(row.capoState)
        ? confirmedField(row.capoFret, at)
        : suggestedField(suggestions.capo),
    strum:
      row && confirmed(row.strumState)
        ? confirmedField(row.strumPatternId, at)
        : suggestedField(suggestions.strum),
    pitchLinked,
    confirmedAt: at ? at.toISOString() : null,
  };
}

function toMeta(s: Suggestion<unknown>): SuggestionMeta {
  return { source: s.source, confidence: s.confidence, reason: s.reason };
}

/**
 * Save the current values as confirmed, remembering what was suggested at the time,
 * and log a `confirm` event (which will drive the voice-fit recompute in Phase 3).
 */
export async function confirmPrefs(
  db: Db,
  userId: string,
  songId: string,
  input: ConfirmInput,
): Promise<PrefsView> {
  const capoFret = Math.round(input.capoFret);
  if (capoFret < 0 || capoFret > 12) throw new ValidationError("Capo must be between 0 and 12");
  if (input.strumPatternId) {
    const [p] = await db
      .select({ id: strumPatterns.id })
      .from(strumPatterns)
      .where(eq(strumPatterns.id, input.strumPatternId));
    if (!p) throw new ValidationError("Unknown strum pattern");
  }
  const values = {
    transposeSemitones: normalizeTranspose(input.transposeSemitones),
    audioPitchSemitones: clampAudioShift(input.audioPitchSemitones),
    pitchLinked: input.pitchLinked,
    capoFret,
    strumPatternId: input.strumPatternId,
  };

  const suggested = await computeSuggestions(db, userId, songId);
  const now = new Date();
  const set = {
    ...values,
    transposeState: "confirmed" as const,
    audioPitchState: "confirmed" as const,
    capoState: "confirmed" as const,
    strumState: "confirmed" as const,
    suggestionMeta: {
      transpose: toMeta(suggested.transpose),
      audioPitch: toMeta(suggested.audioPitch),
      capo: toMeta(suggested.capo),
      strum: toMeta(suggested.strum),
    },
    confirmedAt: now,
    updatedAt: now,
  };
  await db
    .insert(songPrefs)
    .values({ userId, songId, ...set })
    .onConflictDoUpdate({ target: [songPrefs.userId, songPrefs.songId], set });

  await logEvent(db, {
    userId,
    songId,
    type: "confirm",
    payload: {
      values,
      suggested: {
        transpose: suggested.transpose.value,
        audioPitch: suggested.audioPitch.value,
        capo: suggested.capo.value,
        strum: suggested.strum.value,
      },
    },
  });
  return getPrefsView(db, userId, songId);
}

export interface RejectInput {
  field: PrefFieldName;
  suggestedValue: number | string | null;
  source: string;
  /** Value the user switched to, if any. */
  replacedWith?: number | string | null;
}

/** "✕ Not right": weaker evidence than a confirmation, but still logged for learning. */
export async function rejectSuggestion(
  db: Db,
  userId: string,
  songId: string,
  input: RejectInput,
): Promise<void> {
  await getSongDetail(db, userId, songId);
  await logEvent(db, {
    userId,
    songId,
    type: "reject_suggestion",
    payload: { ...input },
  });
}
