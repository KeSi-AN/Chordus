import type { Db } from "../db/client";
import { events } from "../db/schema";

/** Event types from plan section 5, plus a few lifecycle events. */
export const EVENT_TYPES = [
  "search",
  "open_song",
  "play",
  "transpose_change",
  "pitch_change",
  "capo_change",
  "strum_change",
  "confirm",
  "reject_suggestion",
  "range_test_result",
  "extension_pitch_apply",
  "song_created",
  "sheet_edited",
  "audio_attached",
  "analysis_queued",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface LogEventInput {
  userId: string;
  songId?: string | null;
  type: EventType;
  payload?: Record<string, unknown>;
}

/** Append a row to the event log. The learning loop depends on these. */
export async function logEvent(db: Db, input: LogEventInput): Promise<void> {
  await db.insert(events).values({
    userId: input.userId,
    songId: input.songId ?? null,
    type: input.type,
    payload: input.payload ?? {},
  });
}
