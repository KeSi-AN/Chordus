import type { ParsedSheet, SheetLine, Segment } from "@chordus/core";
import { cn } from "@/lib/utils";

/**
 * Chords-above-lyrics rendering. Each segment is an inline column (chord on top, lyric below)
 * so chords stay over the right syllable and long lines wrap between segments.
 */
export function SheetView({
  sheet,
  fontSize = 16,
  className,
}: {
  sheet: ParsedSheet;
  fontSize?: number;
  className?: string;
}) {
  if (sheet.sections.length === 0) {
    return <p className="text-sm text-muted-foreground">This sheet is empty.</p>;
  }
  return (
    <div className={cn("space-y-5", className)} style={{ fontSize }}>
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
                <Line key={j} line={line} />
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function Line({ line }: { line: SheetLine }) {
  switch (line.type) {
    case "empty":
      return <div className="h-[1em]" aria-hidden />;
    case "comment":
      return <p className="my-1 text-[0.85em] text-muted-foreground italic">{line.text}</p>;
    case "tab":
      return <pre className="font-mono text-[0.8em] leading-tight">{line.text}</pre>;
    case "lyrics":
      return <LyricLine segments={line.segments} />;
  }
}

function LyricLine({ segments }: { segments: Segment[] }) {
  const hasChords = segments.some((s) => s.chord !== null);
  const hasLyrics = segments.some((s) => s.lyrics.trim() !== "");
  if (!hasChords) {
    return (
      <p className="leading-relaxed whitespace-pre-wrap">
        {segments.map((s) => s.lyrics).join("")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end leading-tight">
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex flex-col">
          <span
            className={cn(
              "min-h-[1.3em] pr-[0.4em] font-semibold whitespace-pre text-primary",
              seg.chord === null && "select-none",
              seg.uncertain &&
                "underline decoration-amber-500 decoration-dotted decoration-2 underline-offset-4",
            )}
            data-chord={seg.chord ?? undefined}
            title={
              seg.uncertain ? "Low-confidence chord detected from audio. Check it." : undefined
            }
          >
            {seg.chord ?? " "}
          </span>
          {hasLyrics && <span className="min-h-[1.3em] whitespace-pre">{seg.lyrics || " "}</span>}
        </span>
      ))}
    </div>
  );
}
