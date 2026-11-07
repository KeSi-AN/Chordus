"use client";

import { midiToNote } from "@chordus/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, AudioWaveform, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson, sendJson } from "@/lib/api-client";
import type { AnalysisView } from "@/server/services/analysis";

const POLL_MS = 2000;

function noteRange(low: number | null, high: number | null): string | null {
  if (low === null || high === null) return null;
  return `${midiToNote(low)}–${midiToNote(high)}`;
}

/** Analysis status for the song: progress while running, results when done, retry on failure. */
export function AnalysisPanel({
  songId,
  initial,
  canAnalyze,
}: {
  songId: string;
  initial: AnalysisView | null;
  canAnalyze: boolean;
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initial);
  const [analyzerOnline, setAnalyzerOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const active = analysis?.status === "queued" || analysis?.status === "running";
  const lastStatus = useRef(analysis?.status);
  const lastStage = useRef(analysis?.stage ?? null);

  // Poll while the job is active; refresh the page (new sheet, audio, key) once it finishes.
  useEffect(() => {
    if (!active || !analysis) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { analysis: next } = await getJson<{ analysis: AnalysisView }>(
          `/api/analyses/${analysis.id}`,
        );
        if (cancelled) return;
        setAnalysis(next);
        // Refresh the page at the moments new content exists: audio downloaded ("Decoding"),
        // draft sheet saved (vocal isolation starts right after), and when the job finishes.
        const prevStage = lastStage.current;
        const entered = (prefix: string) =>
          Boolean(next.stage?.startsWith(prefix)) && !prevStage?.startsWith(prefix);
        if (
          (lastStatus.current !== next.status && next.status === "done") ||
          entered("Decoding") ||
          entered("Isolating")
        ) {
          router.refresh();
        }
        lastStage.current = next.stage;
        lastStatus.current = next.status;
      } catch {
        // Transient; try again next tick.
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, analysis, router]);

  // If nothing has started after a few seconds, check whether the analyzer is running at all.
  useEffect(() => {
    if (analysis?.status !== "queued") return;
    const timer = setTimeout(() => {
      getJson<{ online: boolean }>("/api/analyzer/health")
        .then((h) => setAnalyzerOnline(h.online))
        .catch(() => setAnalyzerOnline(false));
    }, 4000);
    return () => clearTimeout(timer);
  }, [analysis?.status]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { analysis: next } = await sendJson<{ analysis: AnalysisView }>(
        `/api/songs/${songId}/analyze`,
        "POST",
        {},
      );
      lastStatus.current = next.status;
      setAnalyzerOnline(null);
      setAnalysis(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (!analysis && !canAnalyze) return null;

  const range = analysis ? noteRange(analysis.melodyP10Midi, analysis.melodyP90Midi) : null;
  const extremes = analysis ? noteRange(analysis.melodyLowMidi, analysis.melodyHighMidi) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <AudioWaveform className="size-4" aria-hidden /> Chords from audio
        </h2>
        {analysis && !active && canAnalyze && (
          <Button size="xs" variant="ghost" onClick={() => void start()} disabled={starting}>
            <RotateCw /> Analyze again
          </Button>
        )}
      </div>

      {!analysis && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Detect the key, tempo, chords and vocal range from this song&apos;s audio.
          </p>
          <Button size="sm" variant="outline" onClick={() => void start()} disabled={starting}>
            {starting ? <Loader2 className="animate-spin" /> : <AudioWaveform />}
            Detect chords
          </Button>
        </div>
      )}

      {analysis && active && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {analysis.status === "queued" ? "Waiting for the analyzer…" : analysis.stage}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(analysis.progress * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(3, analysis.progress * 100)}%` }}
            />
          </div>
          {analyzerOnline === false && (
            <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                The analyzer isn&apos;t running. Start it with <code>pnpm analyzer</code> (or run
                everything with <code>pnpm dev</code>); this job will start automatically.
              </span>
            </p>
          )}
        </div>
      )}

      {analysis?.status === "failed" && (
        <div className="space-y-2 text-sm">
          <p className="flex gap-1.5 text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {analysis.error ?? "The analysis failed."}
          </p>
          {canAnalyze && (
            <Button size="sm" variant="outline" onClick={() => void start()} disabled={starting}>
              <RotateCw /> Try again
            </Button>
          )}
        </div>
      )}

      {analysis?.status === "done" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Key</dt>
          <dd>
            {analysis.key ?? "?"}
            {analysis.keyConfidence !== null && analysis.keyConfidence < 0.4 && (
              <span className="ml-1 text-xs text-muted-foreground">(unsure)</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Tempo</dt>
          <dd>{analysis.bpm ? `${Math.round(analysis.bpm)} BPM` : "?"}</dd>
          <dt className="text-muted-foreground">Vocal range</dt>
          <dd>
            {range ? (
              <span title={extremes ? `Extremes ${extremes}` : undefined}>
                {range} <span className="text-xs text-muted-foreground">(most of the melody)</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {analysis.stage && analysis.stage !== "Done"
                  ? analysis.stage.replace(/^Done \(|\)$/g, "")
                  : "not measured"}
              </span>
            )}
          </dd>
        </dl>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
