"use client";

import type { ParsedSheet, SheetLine, Segment } from "@chordus/core";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Index of every chord token in render order (repeat sections included), as
 * [section][line][segment] → index (or -1 for segments without a chord).
 */
export function chordTokenIndices(sheet: ParsedSheet): { map: number[][][]; count: number } {
  let n = 0;
  const map = sheet.sections.map((section) =>
    section.lines.map((line) =>
      line.type === "lyrics" ? line.segments.map((seg) => (seg.chord !== null ? n++ : -1)) : [],
    ),
  );
  return { map, count: n };
}

/**
 * Chords-above-lyrics rendering. Each segment is an inline column (chord on top, lyric below)
 * so chords stay over the right syllable and long lines wrap between segments.
 */
export function SheetView({
  sheet,
  fontSize = 16,
  className,
  activeChordIndex = null,
  followActive = false,
}: {
  sheet: ParsedSheet;
  fontSize?: number;
  className?: string;
  /** Chord token to highlight (synced playback), counted in render order. */
  activeChordIndex?: number | null;
  /** Keep the highlighted chord on screen. */
  followActive?: boolean;
}) {
  const { map } = useMemo(() => chordTokenIndices(sheet), [sheet]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!followActive || activeChordIndex === null) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-chord-index="${activeChordIndex}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeChordIndex, followActive]);

  if (sheet.sections.length === 0) {
    return <p className="text-sm text-muted-foreground">This sheet is empty.</p>;
  }
  return (
    <div ref={root} className={cn("space-y-5", className)} style={{ fontSize }}>
      {sheet.sections.map((section, i) => (
        <section
          key={i}
          className={cn(
            section.kind === "chorus" && "border-l-2 border-primary/30 pl-3",
            section.kind === "tab" && "overflow-x-auto",
          )}
        >
          {section.label && section.kind !== "none" && (
            <h3 className="mb-1 text-[0.75em] font-semibold tracking-wide text-muted-foreground uppercase">
              {section.label}
              {section.isRepeat && <span className="ml-1 font-normal normal-case">(repeat)</span>}
            </h3>
          )}
          {!section.isRepeat || section.lines.length > 0 ? (
            <div>
              {section.lines.map((line, j) => (
                <Line
                  key={j}
                  line={line}
                  indices={map[i]?.[j] ?? []}
                  activeIndex={activeChordIndex}
                />
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function Line({
  line,
  indices,
  activeIndex,
}: {
  line: SheetLine;
  indices: number[];
  activeIndex: number | null;
}) {
  switch (line.type) {
    case "empty":
      return <div className="h-[1em]" aria-hidden />;
    case "comment":
      return <p className="my-1 text-[0.85em] text-muted-foreground italic">{line.text}</p>;
    case "tab":
      return <pre className="font-mono text-[0.8em] leading-tight">{line.text}</pre>;
    case "lyrics":
      return <LyricLine segments={line.segments} indices={indices} activeIndex={activeIndex} />;
  }
}

/** Urdu, Arabic and Hebrew lyrics read right to left. */
const RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;

function LyricLine({
  segments,
  indices,
  activeIndex,
}: {
  segments: Segment[];
  indices: number[];
  activeIndex: number | null;
}) {
  const hasChords = segments.some((s) => s.chord !== null);
  const hasLyrics = segments.some((s) => s.lyrics.trim() !== "");
  const dir = segments.some((s) => RTL_RE.test(s.lyrics)) ? "rtl" : undefined;
  if (!hasChords) {
    return (
      <p dir={dir} className="leading-relaxed whitespace-pre-wrap">
        {segments.map((s) => s.lyrics).join("")}
      </p>
    );
  }
  return (
    <div dir={dir} className="flex flex-wrap items-end leading-tight">
      {segments.map((seg, i) => {
        const index = indices[i] ?? -1;
        const active = index >= 0 && index === activeIndex;
        return (
          <span key={i} className="inline-flex flex-col">
            <span
              className={cn(
                "min-h-[1.3em] pr-[0.4em] font-semibold whitespace-pre text-primary transition-colors",
                seg.chord === null && "select-none",
                active && "rounded bg-primary px-[0.2em] text-primary-foreground",
                seg.uncertain &&
                  "underline decoration-amber-500 decoration-dotted decoration-2 underline-offset-4",
              )}
              data-chord={seg.chord ?? undefined}
              data-chord-index={index >= 0 ? index : undefined}
              aria-current={active ? "true" : undefined}
              title={
                seg.uncertain ? "Low-confidence chord detected from audio. Check it." : undefined
              }
            >
              {seg.chord ?? " "}
            </span>
            {hasLyrics && <span className="min-h-[1.3em] whitespace-pre">{seg.lyrics || " "}</span>}
          </span>
        );
      })}
    </div>
  );
}
