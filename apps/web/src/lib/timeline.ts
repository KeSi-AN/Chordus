import type { ChordTimelineEntry } from "@/server/db/schema";

/**
 * Extra delay the pitch-shift worklet adds while shifting (its prime buffer, ~5120 frames at
 * 44.1 kHz). At 0 semitones the worklet bypasses and adds none.
 */
export const PITCH_SHIFT_LATENCY_SECONDS = 0.12;

/** Index of the timeline entry playing at `t` seconds, or null outside the timeline. */
export function activeTimelineIndex(
  timeline: readonly ChordTimelineEntry[],
  t: number,
): number | null {
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = timeline[mid]!;
    if (t < e.start) hi = mid - 1;
    else if (t >= e.end) lo = mid + 1;
    else return mid;
  }
  return null;
}

/** Media time the listener is actually hearing, given the shifter's latency. */
export function heardTime(currentTime: number, pitchSemitones: number): number {
  return pitchSemitones === 0
    ? currentTime
    : Math.max(0, currentTime - PITCH_SHIFT_LATENCY_SECONDS);
}

/** Where playback is in a timeline. It changes a few times a bar, not with every time update. */
export interface TimelineCursor {
  /** The entry playing now, or null in a gap (before the first chord, after the last). */
  index: number | null;
  /** The next entry with a different chord (or, in a gap, the next entry of any chord). */
  nextIndex: number | null;
}

export function timelineCursor(timeline: readonly ChordTimelineEntry[], t: number): TimelineCursor {
  const index = activeTimelineIndex(timeline, t);
  let nextIndex: number | null = null;
  if (index === null) {
    const i = timeline.findIndex((e) => e.start > t);
    nextIndex = i === -1 ? null : i;
  } else {
    const chord = timeline[index]!.chord;
    for (let i = index + 1; i < timeline.length; i++) {
      if (timeline[i]!.chord !== chord) {
        nextIndex = i;
        break;
      }
    }
  }
  return { index, nextIndex };
}

export function sameCursor(a: TimelineCursor | null, b: TimelineCursor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.index === b.index && a.nextIndex === b.nextIndex;
}
