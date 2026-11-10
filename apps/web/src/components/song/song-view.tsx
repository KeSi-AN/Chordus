"use client";

import {
  capoOptions as rankCapos,
  extractChords,
  formatKey,
  parseChordPro,
  parseKey,
  sheetKey,
  transposeChordPro,
  transposeChord,
  transposeKey,
  uniqueChords,
} from "@chordus/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { chordTokenIndices, SheetView } from "@/components/sheet-view";
import { buttonVariants } from "@/components/ui/button";
import { logClientEvent } from "@/lib/api-client";
import { heardTime, sameCursor, timelineCursor, type TimelineCursor } from "@/lib/timeline";
import { useStoredNumber } from "@/lib/use-stored-number";
import { cn } from "@/lib/utils";
import type { SheetOrigin, Song, Source, StrumPattern } from "@/server/db/schema";
import type { AnalysisView, SongTimeline } from "@/server/services/analysis";
import type { PrefsView } from "@/server/services/prefs";
import { AnalysisPanel } from "./analysis-panel";
import { AudioPanel } from "./audio-player";
import { ChordDiagrams } from "./chord-diagrams";
import { ConfirmPanel } from "./confirm-panel";
import { DraftBanner } from "./draft-banner";
import { NowPlaying } from "./now-playing";
import { SongToolbar } from "./song-toolbar";
import { StrumPanel } from "./strum-panel";
import { useAutoScroll } from "./use-auto-scroll";
import { useSongPrefs } from "./use-song-prefs";

const FONT_KEY = "sheetFontSize";
const validFontSize = (n: number) => n >= 11 && n <= 32;

/** Make sure the sheet declares the song's key, so transposition spells chords for it. */
function withKey(chordpro: string, key: string | null): string {
  if (!key || parseChordPro(chordpro).meta.key) return chordpro;
  return `{key: ${key}}\n${chordpro}`;
}

export function SongView({
  song,
  chordpro,
  sheetOrigin,
  initialAudio,
  hasYouTubeSource,
  analysis,
  timeline: songTimeline,
  initialPrefs,
  initialPatterns,
}: {
  song: Song;
  chordpro: string;
  sheetOrigin: SheetOrigin | null;
  initialAudio: Source | null;
  hasYouTubeSource: boolean;
  analysis: AnalysisView | null;
  /** Chord timeline of the song's detected sheet (see `latestTimeline`). */
  timeline: SongTimeline | null;
  initialPrefs: PrefsView;
  initialPatterns: StrumPattern[];
}) {
  const prefs = useSongPrefs(song.id, initialPrefs);
  const [audio, setAudio] = useState(initialAudio);
  const [patterns, setPatterns] = useState(initialPatterns);
  const [fontSize, changeFont] = useStoredNumber(FONT_KEY, 17, validFontSize);
  const scroll = useAutoScroll(song.bpm, fontSize);

  useEffect(() => {
    logClientEvent("open_song", song.id);
  }, [song.id]);

  const transpose = prefs.fields.transpose.value;
  const capo = prefs.fields.capo.value;
  const audioPitch = prefs.fields.audioPitch.value;
  const [cursor, setCursor] = useState<TimelineCursor | null>(null);

  const view = useMemo(() => {
    const base = withKey(chordpro, song.originalKey);
    const original = song.originalKey ? parseKey(song.originalKey) : (sheetKey(base)?.key ?? null);
    const sounding = original ? transposeKey(original, transpose) : null;
    const shapes = original ? transposeKey(original, transpose - capo) : null;
    const soundingSheet = transposeChordPro(base, transpose);
    const shownSheet = transposeChordPro(base, transpose - capo);
    return {
      originalKey: original ? formatKey(original) : null,
      soundingKey: sounding ? formatKey(sounding) : null,
      shapeKey: shapes ? formatKey(shapes) : null,
      parsed: parseChordPro(shownSheet),
      shownChords: uniqueChords(shownSheet),
      capoOptions: sounding
        ? rankCapos({ key: sounding, chords: extractChords(soundingSheet) })
        : [],
    };
  }, [chordpro, song.originalKey, transpose, capo]);

  // Synced chords: only when the timeline was computed from the audio that is playing.
  const timeline =
    songTimeline && audio && songTimeline.sourceId === audio.id ? songTimeline.entries : null;
  const tokenCount = useMemo(() => chordTokenIndices(view.parsed).count, [view.parsed]);
  // The player reports its time about ten times a second. Keeping that time in state would
  // re-render this whole page (sheet, diagrams, panels) at that rate for as long as audio plays;
  // the cursor only changes when the chord does.
  const onPlaybackTime = useCallback(
    (seconds: number) => {
      if (!timeline || timeline.length === 0) return;
      const next = timelineCursor(timeline, heardTime(seconds, audioPitch));
      setCursor((prev) => (sameCursor(prev, next) ? prev : next));
    },
    [timeline, audioPitch],
  );
  const sync = useMemo(() => {
    if (!timeline || timeline.length === 0 || cursor === null) return null;
    const shape = (c: string) =>
      c === "N" ? "N.C." : transposeChord(c, transpose - capo, view.shapeKey);
    // The cursor can outlive its timeline for a moment when a new analysis arrives.
    const current = cursor.index === null ? null : (timeline[cursor.index] ?? null);
    const next = cursor.nextIndex === null ? null : (timeline[cursor.nextIndex] ?? null);
    return {
      // The sheet can follow along only if it still has one chord token per timeline entry.
      sheetIndex: current && tokenCount === timeline.length ? cursor.index : null,
      current: current ? shape(current.chord) : null,
      uncertain: current ? current.confidence < 0.55 : false,
      next: next ? shape(next.chord) : null,
    };
  }, [timeline, cursor, transpose, capo, view.shapeKey, tokenCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{song.title}</h1>
          <p className="text-muted-foreground">
            {song.artist || "Unknown artist"}
            <span className="ml-2 text-xs">
              {song.timeSignature}
              {song.bpm ? ` · ${Math.round(song.bpm)} BPM` : ""}
            </span>
          </p>
        </div>
        <Link
          href={`/songs/${song.id}/edit`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Pencil /> Edit
        </Link>
      </div>

      <SongToolbar
        prefs={prefs}
        originalKey={view.originalKey}
        soundingKey={view.soundingKey}
        shapeKey={view.shapeKey}
        capoOptions={view.capoOptions}
        fontSize={fontSize}
        onFontSize={changeFont}
        scroll={scroll}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {capo > 0 && view.shapeKey && (
            <p className="text-sm text-muted-foreground">
              Capo {capo}: chords below are {view.shapeKey} shapes; the song sounds in{" "}
              {view.soundingKey}.
            </p>
          )}
          {sheetOrigin === "detected" && <DraftBanner songId={song.id} chordpro={chordpro} />}
          <ChordDiagrams chords={view.shownChords} />
          {sync && (
            <NowPlaying current={sync.current} next={sync.next} uncertain={sync.uncertain} />
          )}
          {chordpro.trim() ? (
            <SheetView
              sheet={view.parsed}
              fontSize={fontSize}
              activeChordIndex={sync?.sheetIndex ?? null}
              followActive={!scroll.running}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {analysis && (analysis.status === "queued" || analysis.status === "running")
                ? "The chord sheet appears here when the analysis finishes."
                : "No chord sheet yet. Detect chords from the audio, or paste a sheet via Edit."}
            </div>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
          <section className="rounded-xl border p-4">
            <ConfirmPanel prefs={prefs} patterns={patterns} />
          </section>
          <section className="rounded-xl border p-4">
            <AudioPanel
              songId={song.id}
              audio={audio}
              prefs={prefs}
              onAudioChange={setAudio}
              onPlaybackTime={onPlaybackTime}
            />
          </section>
          {(analysis || audio || hasYouTubeSource) && (
            <section className="rounded-xl border p-4">
              <AnalysisPanel
                songId={song.id}
                initial={analysis}
                canAnalyze={Boolean(audio) || hasYouTubeSource}
              />
            </section>
          )}
          <section className="rounded-xl border p-4">
            <StrumPanel
              patterns={patterns}
              timeSignature={song.timeSignature}
              bpm={song.bpm}
              prefs={prefs}
              onPatternCreated={(p) => setPatterns((ps) => [...ps, p])}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
