"use client";

import {
  audioShiftForTranspose,
  clampAudioShift,
  normalizeTranspose,
  transposeForAudioShift,
  type PrefField,
  type Suggestion,
} from "@chordus/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, logClientEvent, sendJson, type ClientEventType } from "@/lib/api-client";
import type { PrefsView, PrefFieldName, SongSuggestions } from "@/server/services/prefs";

export type Fields = {
  transpose: PrefField<number>;
  audioPitch: PrefField<number>;
  capo: PrefField<number>;
  strum: PrefField<string | null>;
};

const EVENT_FOR: Record<PrefFieldName, ClientEventType> = {
  transpose: "transpose_change",
  audioPitch: "pitch_change",
  capo: "capo_change",
  strum: "strum_change",
};

const NEUTRAL: { [K in PrefFieldName]: Fields[K]["value"] } = {
  transpose: 0,
  audioPitch: 0,
  capo: 0,
  strum: null,
};

function fromView(v: PrefsView): Fields {
  return { transpose: v.transpose, audioPitch: v.audioPitch, capo: v.capo, strum: v.strum };
}

function edited<T>(field: PrefField<T>, value: T): PrefField<T> {
  return {
    ...field,
    value,
    state: "edited",
    source: "user",
    reason: "Changed by you, not saved yet",
  };
}

/**
 * Suggest → edit → confirm state for one song (plan section 7).
 * Edits stay local until Confirm; changes and rejections are logged as events.
 */
export function useSongPrefs(songId: string, initial: PrefsView) {
  const [fields, setFields] = useState<Fields>(() => fromView(initial));
  const [pitchLinked, setPitchLinked] = useState(initial.pitchLinked);
  const [confirmedAt, setConfirmedAt] = useState(initial.confirmedAt);

  // The server sends fresh suggestions whenever the page refreshes, which it does each time the
  // analyzer delivers something (audio, key, a sheet). Take them for every field the user has
  // not edited here; unsaved edits stay, and nothing else on the page has to remount.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    const server = fromView(initial);
    const keep = <T>(local: PrefField<T>, fresh: PrefField<T>) =>
      local.state === "edited" ? local : fresh;
    setFields((f) => ({
      transpose: keep(f.transpose, server.transpose),
      audioPitch: keep(f.audioPitch, server.audioPitch),
      capo: keep(f.capo, server.capo),
      strum: keep(f.strum, server.strum),
    }));
    if (!Object.values(fields).some((f) => f.state === "edited")) {
      setPitchLinked(initial.pitchLinked);
      setConfirmedAt(initial.confirmedAt);
    }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuggested, setResuggested] = useState<SongSuggestions | null>(null);

  // Debounced change logging: one event per field after the user settles on a value.
  const pending = useRef(
    new Map<PrefFieldName, { from: unknown; timer: ReturnType<typeof setTimeout> }>(),
  );
  const logChange = useCallback(
    (field: PrefFieldName, from: unknown, to: unknown) => {
      const prev = pending.current.get(field);
      if (prev) clearTimeout(prev.timer);
      const origin = prev ? prev.from : from;
      const timer = setTimeout(() => {
        pending.current.delete(field);
        if (origin !== to) logClientEvent(EVENT_FOR[field], songId, { from: origin, to });
      }, 1000);
      pending.current.set(field, { from: origin, timer });
    },
    [songId],
  );
  useEffect(() => {
    const map = pending.current;
    return () => map.forEach((p) => clearTimeout(p.timer));
  }, []);

  const setTranspose = useCallback(
    (value: number) => {
      setFields((f) => {
        const t = normalizeTranspose(value);
        logChange("transpose", f.transpose.value, t);
        const next = { ...f, transpose: edited(f.transpose, t) };
        if (pitchLinked) {
          const a = audioShiftForTranspose(t);
          if (a !== f.audioPitch.value) logChange("audioPitch", f.audioPitch.value, a);
          next.audioPitch = edited(f.audioPitch, a);
        }
        return next;
      });
    },
    [logChange, pitchLinked],
  );

  const setAudioPitch = useCallback(
    (value: number) => {
      setFields((f) => {
        const a = clampAudioShift(value);
        logChange("audioPitch", f.audioPitch.value, a);
        const next = { ...f, audioPitch: edited(f.audioPitch, a) };
        if (pitchLinked) {
          const t = transposeForAudioShift(a);
          if (t !== f.transpose.value) logChange("transpose", f.transpose.value, t);
          next.transpose = edited(f.transpose, t);
        }
        return next;
      });
    },
    [logChange, pitchLinked],
  );

  const setCapo = useCallback(
    (value: number) =>
      setFields((f) => {
        logChange("capo", f.capo.value, value);
        return { ...f, capo: edited(f.capo, value) };
      }),
    [logChange],
  );

  const setStrum = useCallback(
    (value: string | null) =>
      setFields((f) => {
        logChange("strum", f.strum.value, value);
        return { ...f, strum: edited(f.strum, value) };
      }),
    [logChange],
  );

  const setLinked = useCallback((linked: boolean) => {
    setPitchLinked(linked);
    if (linked) {
      setFields((f) => ({
        ...f,
        audioPitch: edited(f.audioPitch, audioShiftForTranspose(f.transpose.value)),
      }));
    } else {
      // Unlinking is itself an edit worth confirming.
      setFields((f) => ({ ...f, audioPitch: edited(f.audioPitch, f.audioPitch.value) }));
    }
  }, []);

  /** "✕ Not right": log the rejected suggestion and fall back to the neutral value. */
  const reject = useCallback(
    (field: PrefFieldName) => {
      const current = fields[field];
      void sendJson(`/api/songs/${songId}/prefs/reject`, "POST", {
        field,
        suggestedValue: current.value,
        source: current.source,
      }).catch(() => {});
      if (field === "transpose") setTranspose(0);
      else if (field === "audioPitch") setAudioPitch(0);
      else if (field === "capo") setCapo(0);
      else setStrum(NEUTRAL.strum);
    },
    [fields, songId, setTranspose, setAudioPitch, setCapo, setStrum],
  );

  const confirm = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const { prefs } = await sendJson<{ prefs: PrefsView }>(
        `/api/songs/${songId}/prefs/confirm`,
        "POST",
        {
          transposeSemitones: fields.transpose.value,
          audioPitchSemitones: fields.audioPitch.value,
          pitchLinked,
          capoFret: fields.capo.value,
          strumPatternId: fields.strum.value,
        },
      );
      setFields(fromView(prefs));
      setPitchLinked(prefs.pitchLinked);
      setConfirmedAt(prefs.confirmedAt);
      setResuggested(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [fields, pitchLinked, songId]);

  /** Ask the engine what it would pick now (for comparing against confirmed values). */
  const resuggest = useCallback(async () => {
    try {
      const { suggestions } = await getJson<{ suggestions: SongSuggestions }>(
        `/api/songs/${songId}/suggestions`,
      );
      setResuggested(suggestions);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [songId]);

  const applySuggestions = useCallback(() => {
    if (!resuggested) return;
    const s = resuggested;
    const asField = <T>(sg: Suggestion<T>): PrefField<T> => ({ ...sg, state: "edited" });
    setFields({
      transpose: asField(s.transpose),
      audioPitch: asField(
        pitchLinked ? s.audioPitch : { ...s.audioPitch, value: fields.audioPitch.value },
      ),
      capo: asField(s.capo),
      strum: asField(s.strum),
    });
    setResuggested(null);
  }, [resuggested, pitchLinked, fields.audioPitch.value]);

  const dirty = Object.values(fields).some((f) => f.state === "edited");
  const unconfirmed = Object.values(fields).some((f) => f.state !== "confirmed");

  return {
    fields,
    pitchLinked,
    confirmedAt,
    saving,
    error,
    dirty,
    unconfirmed,
    resuggested,
    setTranspose,
    setAudioPitch,
    setCapo,
    setStrum,
    setLinked,
    reject,
    confirm,
    resuggest,
    applySuggestions,
    dismissResuggest: () => setResuggested(null),
  };
}

export type SongPrefsState = ReturnType<typeof useSongPrefs>;
