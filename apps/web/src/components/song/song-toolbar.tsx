"use client";

import { formatSemitones, type CapoOption } from "@chordus/core";
import { ChevronsDown, Minus, Pause, Plus, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { PrefChip } from "@/components/pref-chip";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { SongPrefsState } from "./use-song-prefs";
import type { useAutoScroll } from "./use-auto-scroll";

/** Transpose, key, capo, font size and auto-scroll controls above the sheet. */
export function SongToolbar({
  prefs,
  originalKey,
  soundingKey,
  shapeKey,
  capoOptions,
  fontSize,
  onFontSize,
  scroll,
}: {
  prefs: SongPrefsState;
  originalKey: string | null;
  soundingKey: string | null;
  shapeKey: string | null;
  capoOptions: CapoOption[];
  fontSize: number;
  onFontSize: (n: number) => void;
  scroll: ReturnType<typeof useAutoScroll>;
}) {
  const { transpose, capo } = prefs.fields;
  const ranked = capoOptions.slice(0, 4).map((o) => o.capo);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Transpose</span>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => prefs.setTranspose(transpose.value - 1)}
          aria-label="Transpose down"
        >
          <Minus />
        </Button>
        <span className="w-8 text-center font-mono tabular-nums">
          {formatSemitones(transpose.value)}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => prefs.setTranspose(transpose.value + 1)}
          aria-label="Transpose up"
        >
          <Plus />
        </Button>
        {transpose.value !== 0 && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => prefs.setTranspose(0)}
            aria-label="Reset transpose"
          >
            <RotateCcw />
          </Button>
        )}
        <PrefChip state={transpose.state} reason={transpose.reason} />
        {transpose.state === "suggested" && transpose.source !== "default" && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => prefs.reject("transpose")}
            title="Not right: log it and go back to the original key"
            aria-label="Reject transpose suggestion"
          >
            <X />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Key</span>
        <span className="font-semibold">{soundingKey ?? "?"}</span>
        {originalKey && soundingKey !== originalKey && (
          <span className="text-xs text-muted-foreground">(orig. {originalKey})</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor="capo" className="text-muted-foreground">
          Capo
        </label>
        <NativeSelect
          id="capo"
          value={capo.value}
          onChange={(e) => prefs.setCapo(Number(e.target.value))}
        >
          {Array.from({ length: 10 }, (_, fret) => {
            const opt = capoOptions.find((o) => o.capo === fret);
            const rank = ranked.indexOf(fret);
            return (
              <option key={fret} value={fret}>
                {fret === 0 ? "None" : fret}
                {opt ? ` · ${opt.shapeKey} shapes` : ""}
                {rank === 0 ? " ★" : rank > 0 ? " ☆" : ""}
              </option>
            );
          })}
        </NativeSelect>
        {capo.value > 0 && shapeKey && (
          <span className="text-xs text-muted-foreground">play {shapeKey} shapes</span>
        )}
        <PrefChip state={capo.state} reason={capo.reason} />
        {capo.state === "suggested" && capo.value !== 0 && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => prefs.reject("capo")}
            title="Not right: log it and remove the capo"
            aria-label="Reject capo suggestion"
          >
            <X />
          </Button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => onFontSize(Math.max(11, fontSize - 1))}
          aria-label="Smaller text"
        >
          <ZoomOut />
        </Button>
        <span className="w-6 text-center text-xs text-muted-foreground tabular-nums">
          {fontSize}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => onFontSize(Math.min(32, fontSize + 1))}
          aria-label="Larger text"
        >
          <ZoomIn />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant={scroll.running ? "secondary" : "ghost"}
          onClick={scroll.toggle}
          title="Auto-scroll (speed follows the BPM)"
        >
          {scroll.running ? <Pause /> : <ChevronsDown />}
          Scroll
        </Button>
        {scroll.running && (
          <>
            <Button size="icon-xs" variant="ghost" onClick={scroll.slower} aria-label="Slower">
              <Minus />
            </Button>
            <span className="w-8 text-center text-xs tabular-nums">{scroll.multiplier}×</span>
            <Button size="icon-xs" variant="ghost" onClick={scroll.faster} aria-label="Faster">
              <Plus />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
