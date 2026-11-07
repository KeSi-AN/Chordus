"use client";

import { useEffect, useState } from "react";
import { ChordDiagram } from "@/components/chord-diagram";
import { getJson } from "@/lib/api-client";
import type { ChordVoicing } from "@/server/voicings";

const cache = new Map<string, ChordVoicing | null>();

/** Diagrams for every chord in the (displayed) sheet. Click a diagram for the next voicing. */
export function ChordDiagrams({ chords }: { chords: string[] }) {
  const [, setVersion] = useState(0);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const key = chords.join(",");

  useEffect(() => {
    const missing = chords.filter((c) => !cache.has(c));
    if (missing.length === 0) return;
    let cancelled = false;
    const params = new URLSearchParams({ chords: missing.join(",") });
    getJson<{ voicings: Record<string, ChordVoicing> }>(`/api/voicings?${params}`)
      .then(({ voicings }) => {
        for (const c of missing) cache.set(c, voicings[c] ?? null);
        if (!cancelled) setVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the chord list
  }, [key]);

  if (chords.length === 0) return null;
  const unknown = chords.filter((c) => cache.get(c) === null);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Chords</h2>
      <div className="flex flex-wrap gap-x-2 gap-y-3">
        {chords.map((c) => {
          const v = cache.get(c);
          if (!v) return null;
          const idx = (choice[c] ?? 0) % v.positions.length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChoice((s) => ({ ...s, [c]: idx + 1 }))}
              title={
                v.positions.length > 1
                  ? `Voicing ${idx + 1} of ${v.positions.length}. Click for the next one.`
                  : undefined
              }
              className="rounded-md p-1 hover:bg-muted"
            >
              <ChordDiagram name={c} position={v.positions[idx]!} />
            </button>
          );
        })}
      </div>
      {unknown.length > 0 && (
        <p className="text-xs text-muted-foreground">No diagram for: {unknown.join(", ")}</p>
      )}
    </div>
  );
}
