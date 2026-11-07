"use client";

import { formatSemitones, type PrefField } from "@chordus/core";
import { useEffect } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { PrefChip } from "@/components/pref-chip";
import { Button } from "@/components/ui/button";
import type { StrumPattern } from "@/server/db/schema";
import type { PrefFieldName } from "@/server/services/prefs";
import type { SongPrefsState } from "./use-song-prefs";

const LABELS: Record<PrefFieldName, string> = {
  transpose: "Transpose",
  audioPitch: "Audio pitch",
  capo: "Capo",
  strum: "Strum",
};

/** The suggest → edit → confirm panel (plan section 7). Ctrl/⌘ + Enter confirms. */
export function ConfirmPanel({
  prefs,
  patterns,
}: {
  prefs: SongPrefsState;
  patterns: StrumPattern[];
}) {
  const { confirm, saving } = prefs;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !saving) {
        e.preventDefault();
        void confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, saving]);

  const show = (field: PrefFieldName, value: number | string | null): string => {
    if (field === "transpose" || field === "audioPitch") return formatSemitones(value as number);
    if (field === "capo") return value ? `Fret ${value}` : "None";
    return patterns.find((p) => p.id === value)?.name ?? "None";
  };

  const isNeutral = (field: PrefFieldName, value: number | string | null) =>
    value === 0 || value === null;

  const status = prefs.dirty
    ? "Unsaved changes"
    : prefs.confirmedAt && !prefs.unconfirmed
      ? `Confirmed ${new Date(prefs.confirmedAt).toLocaleDateString()}`
      : "Not confirmed yet";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Settings for this song</h2>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      <ul className="space-y-1.5">
        {(Object.keys(LABELS) as PrefFieldName[]).map((name) => {
          const f = prefs.fields[name] as PrefField<number | string | null>;
          return (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-muted-foreground">{LABELS[name]}</span>
              <span
                className={f.state === "suggested" ? "text-muted-foreground italic" : "font-medium"}
              >
                {show(name, f.value)}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <PrefChip state={f.state} reason={f.reason} />
                {f.state === "suggested" && !isNeutral(name, f.value) && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => prefs.reject(name)}
                    title="Not right"
                    aria-label={`Reject ${LABELS[name]} suggestion`}
                  >
                    <X />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {prefs.error && <p className="text-sm text-destructive">{prefs.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void confirm()} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          Confirm
          <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 text-[10px] opacity-70 sm:inline">
            Ctrl+Enter
          </kbd>
        </Button>
        {prefs.confirmedAt && (
          <Button variant="link" size="sm" onClick={() => void prefs.resuggest()}>
            <Sparkles /> Re-suggest
          </Button>
        )}
      </div>

      {prefs.resuggested && (
        <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">What the engine would pick now</p>
          <ul className="space-y-1">
            {(Object.keys(LABELS) as PrefFieldName[]).map((name) => {
              const s = prefs.resuggested![name];
              return (
                <li key={name} className="flex gap-2">
                  <span className="w-24 shrink-0 text-muted-foreground">{LABELS[name]}</span>
                  <span>
                    <span className="font-medium">{show(name, s.value)}</span>
                    <span className="block text-xs text-muted-foreground">{s.reason}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={prefs.applySuggestions}>
              Use these
            </Button>
            <Button size="sm" variant="ghost" onClick={prefs.dismissResuggest}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
