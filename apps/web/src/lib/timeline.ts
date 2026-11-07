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
