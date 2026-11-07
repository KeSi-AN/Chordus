/**
 * Suggestions for per-song preferences.
 *
 * Phase 1 only has the no-melody fallbacks from plan section 6.3: the median confirmed shift
 * for the same artist, then for the same vocalist type, then across all songs, else 0.
 * The full voice-fit engine (melody ranges + voice profile) arrives in Phase 3.
 */
import { capoOptions } from "./capo";
import { formatKey, type Key } from "./keys";
import { audioShiftForTranspose, formatSemitones } from "./pitch";
import { defaultPresetFor, type StrumPatternDef } from "./strum";

export type PrefState = "suggested" | "edited" | "confirmed";

export type SuggestionSource =
  | "artist_median"
  | "vocalist_median"
  | "global_median"
  | "default"
  | "linked"
  | "capo_ranking"
  | "time_signature"
  | "user";

export interface Suggestion<T> {
  value: T;
  source: SuggestionSource;
  /** 0..1 */
  confidence: number;
  reason: string;
}

/** A preference field as shown in the UI: every suggested value carries its provenance. */
export interface PrefField<T> extends Suggestion<T> {
  state: PrefState;
}

export type VocalistHint = "male" | "female" | "unknown";

export interface ConfirmedSongShift {
  songId: string;
  artist: string;
  vocalistHint: VocalistHint;
  transposeSemitones: number;
}

/** Median of integers, rounded toward zero on .5 so suggestions lean toward smaller shifts. */
export function medianShift(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const m = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const r = Math.trunc(m);
  return r === 0 ? 0 : r;
}

function normArtist(a: string): string {
  return a.trim().toLowerCase();
}

/** Round a confidence to two decimals (0..1). */
function conf(x: number): number {
  return Math.round(Math.max(0, Math.min(1, x)) * 100) / 100;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export interface TransposeFallbackInput {
  songId?: string;
  artist: string;
  vocalistHint: VocalistHint;
  /** Confirmed transposes of other songs. */
  history: readonly ConfirmedSongShift[];
}

/** Suggest a chord transpose for a song with no melody data (plan 6.3 fallbacks). */
export function suggestTransposeFallback(input: TransposeFallbackInput): Suggestion<number> {
  const others = input.history.filter((h) => h.songId !== input.songId);
  // Compare shifts in their smallest form, so −2 and +10 count as the same choice.
  const shift = (h: ConfirmedSongShift) => audioShiftForTranspose(h.transposeSemitones);

  const artist = normArtist(input.artist);
  const byArtist = artist ? others.filter((h) => normArtist(h.artist) === artist) : [];
  if (byArtist.length > 0) {
    const value = medianShift(byArtist.map(shift))!;
    return {
      value,
      source: "artist_median",
      confidence: conf(Math.min(0.8, 0.35 + 0.1 * byArtist.length)),
      reason: `${formatSemitones(value)}: your usual shift for ${input.artist.trim()} (${plural(byArtist.length, "confirmed song")})`,
    };
  }

  if (input.vocalistHint !== "unknown") {
    const byVoice = others.filter((h) => h.vocalistHint === input.vocalistHint);
    if (byVoice.length > 0) {
      const value = medianShift(byVoice.map(shift))!;
      return {
        value,
        source: "vocalist_median",
        confidence: conf(Math.min(0.6, 0.25 + 0.05 * byVoice.length)),
        reason: `${formatSemitones(value)}: your usual shift for ${input.vocalistHint}-vocal songs (${plural(byVoice.length, "confirmed song")})`,
      };
    }
  }

  if (others.length > 0) {
    const value = medianShift(others.map(shift))!;
    return {
      value,
      source: "global_median",
      confidence: conf(Math.min(0.5, 0.15 + 0.03 * others.length)),
      reason: `${formatSemitones(value)}: your usual shift across ${plural(others.length, "confirmed song")}`,
    };
  }

  return {
    value: 0,
    source: "default",
    confidence: 0.05,
    reason: "No history yet, so the original key. Confirm a few songs and suggestions will follow.",
  };
}

/** Audio pitch that follows a chord transpose (linked mode). */
export function suggestLinkedAudioShift(transpose: Suggestion<number>): Suggestion<number> {
  const value = audioShiftForTranspose(transpose.value);
  return {
    value,
    source: "linked",
    confidence: transpose.confidence,
    reason:
      value === transpose.value
        ? `Follows the chord transpose (${formatSemitones(value)})`
        : `Same chords as ${formatSemitones(transpose.value)}, using the smaller audio shift ${formatSemitones(value)}`,
  };
}

/** Suggest the most playable capo for a sounding key. */
export function suggestCapo(
  soundingKey: Key | null,
  chords: readonly string[],
): Suggestion<number> {
  if (!soundingKey) {
    return { value: 0, source: "default", confidence: 0.1, reason: "Key unknown, no capo" };
  }
  const best = capoOptions({ key: soundingKey, chords })[0];
  if (!best) return { value: 0, source: "default", confidence: 0.1, reason: "No capo" };
  return {
    value: best.capo,
    source: "capo_ranking",
    confidence: conf(Math.min(0.9, 0.4 + (best.openRatio ?? 0.5) * 0.5)),
    reason: `${best.reason} (song sounds in ${formatKey(soundingKey)})`,
  };
}

/** Suggest a strumming preset from the time signature (detection from audio is out of scope). */
export function suggestStrumPreset(timeSignature: string): Suggestion<StrumPatternDef | null> {
  const preset = defaultPresetFor(timeSignature);
  if (!preset) {
    return {
      value: null,
      source: "default",
      confidence: 0.1,
      reason: `No preset for ${timeSignature}; pick or build one`,
    };
  }
  return {
    value: preset,
    source: "time_signature",
    confidence: 0.3,
    reason: `A common ${timeSignature} pattern. Strumming isn't detected, so adjust to taste.`,
  };
}
