/**
 * Chord transpose vs. audio pitch (plan section 5.1).
 *
 * Chord transpose only matters mod 12 (−2 and +10 give the same chords). Audio pitch is a real
 * shift (−2 sounds very different from +10). When linked, the audio follows the transpose using
 * the smallest absolute shift; when unlinked, they move independently.
 */

/** Wrap a chord transpose into −11..+11 (±12 becomes 0). */
export function normalizeTranspose(semitones: number): number {
  const n = Math.round(semitones) % 12;
  return n === 0 ? 0 : n; // avoid -0
}

/** The smallest audio shift that gives the same chords as `transpose`, in −6..+5 (ties go down). */
export function audioShiftForTranspose(transpose: number): number {
  const m = ((Math.round(transpose) % 12) + 12) % 12;
  const shift = m >= 6 ? m - 12 : m;
  return shift === 0 ? 0 : shift;
}

/** The chord transpose that matches an audio shift. */
export function transposeForAudioShift(audioShift: number): number {
  return normalizeTranspose(audioShift);
}

/** Playback-rate ratio for a pitch shift in semitones. */
export function pitchRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Format a shift for display: "+2", "−3" (unicode minus), "0". */
export function formatSemitones(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Audio shifts beyond this (in either direction) get audibly artificial. */
export const COMFORTABLE_AUDIO_SHIFT = 4;
/** Hard limit for the audio pitch control. */
export const MAX_AUDIO_SHIFT = 12;

export function clampAudioShift(semitones: number): number {
  return Math.max(-MAX_AUDIO_SHIFT, Math.min(MAX_AUDIO_SHIFT, Math.round(semitones)));
}
