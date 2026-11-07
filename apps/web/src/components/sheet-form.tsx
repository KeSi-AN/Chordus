"use client";

import { detectSheetFormat, formatKey, parseChordPro, sheetKey, toChordPro } from "@chordus/core";
import { useDeferredValue, useMemo } from "react";
import { SheetView } from "@/components/sheet-view";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Sheet textarea with a live UG-style preview of how it will be stored. */
export function SheetEditor({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
}) {
  const deferred = useDeferredValue(value);
  const preview = useMemo(() => {
    if (!deferred.trim()) return null;
    const chordpro = toChordPro(deferred, title ? { title } : {});
    const key = sheetKey(chordpro);
    return {
      format: detectSheetFormat(deferred),
      sheet: parseChordPro(chordpro),
      key: key ? `${formatKey(key.key)}${key.detected ? " (detected)" : ""}` : null,
    };
  }, [deferred, title]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sheet">Chord sheet</Label>
        <Textarea
          id="sheet"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={
            "Paste chords over words or ChordPro, e.g.\n\n[Verse 1]\nG       C          G\nAmazing grace, how sweet the sound"
          }
          className="min-h-96 flex-1 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Paste your own sheet, or one from a public-domain / open-licensed source. Section headers
          like [Verse] or Chorus: are recognized.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Preview</span>
          {preview && (
            <span className="text-xs text-muted-foreground">
              {preview.format === "chordpro" ? "ChordPro" : "Chords over words"}
              {preview.key ? ` · Key ${preview.key}` : ""}
            </span>
          )}
        </div>
        <div className="min-h-96 flex-1 overflow-auto rounded-lg border p-4">
          {preview ? (
            <SheetView sheet={preview.sheet} fontSize={14} />
          ) : (
            <p className="text-sm text-muted-foreground">The formatted sheet appears here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
