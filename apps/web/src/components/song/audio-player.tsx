"use client";

import { COMFORTABLE_AUDIO_SHIFT, formatSemitones, MAX_AUDIO_SHIFT } from "@chordus/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Link2,
  Link2Off,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  Upload,
  X,
} from "lucide-react";
import { PrefChip } from "@/components/pref-chip";
import { Button } from "@/components/ui/button";
import { logClientEvent, uploadFile } from "@/lib/api-client";
import { PitchPlayer } from "@/lib/pitch-player";
import { cn } from "@/lib/utils";
import type { Source } from "@/server/db/schema";
import type { SongPrefsState } from "./use-song-prefs";

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.25];

/** Audio upload + player with pitch shift (linked to transpose), speed and A–B loop. */
export function AudioPanel({
  songId,
  audio,
  prefs,
  onAudioChange,
  onPlaybackTime,
}: {
  songId: string;
  audio: Source | null;
  prefs: SongPrefsState;
  onAudioChange: (s: Source) => void;
  /** Media time while playing (about 10×/s) and after seeks, for synced chord highlighting. */
  onPlaybackTime?: (seconds: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { source } = await uploadFile<{ source: Source }>(`/api/songs/${songId}/audio`, file);
      onAudioChange(source);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Audio &amp; pitch shift</h2>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {audio ? "Replace" : "Attach audio"}
        </Button>
      </div>
      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      {audio ? (
        <Player
          key={audio.id}
          songId={songId}
          source={audio}
          prefs={prefs}
          onPlaybackTime={onPlaybackTime}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Attach an MP3 (or M4A, WAV, OGG, FLAC) of this song. Then press play and use Pitch − / +
          to shift it to your key without changing the tempo.
        </p>
      )}
    </div>
  );
}

function Player({
  songId,
  source,
  prefs,
  onPlaybackTime,
}: {
  songId: string;
  source: Source;
  prefs: SongPrefsState;
  onPlaybackTime?: (seconds: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<PitchPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const lastPlayLog = useRef(0);
  const pitch = prefs.fields.audioPitch;

  // Report playback time often enough for chord highlighting (timeupdate is only ~4 Hz).
  useEffect(() => {
    if (!playing || !onPlaybackTime) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const el = audioRef.current;
      if (el && now - last > 90) {
        last = now;
        onPlaybackTime(el.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, onPlaybackTime]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const player = new PitchPlayer(el);
    playerRef.current = player;
    return () => {
      el.pause();
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setPitch(pitch.value);
  }, [pitch.value]);

  useEffect(() => {
    playerRef.current?.setSpeed(speed);
  }, [speed]);

  // A–B loop: check on every animation frame while playing (timeupdate is too coarse).
  useEffect(() => {
    if (!playing || loopA === null || loopB === null || loopB <= loopA) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el && el.currentTime >= loopB) el.currentTime = loopA;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loopA, loopB]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    const player = playerRef.current;
    if (!el || !player) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    await player.ensureGraph();
    setGraphError(player.error);
    if (loopA !== null && loopB !== null && (el.currentTime < loopA || el.currentTime > loopB)) {
      el.currentTime = loopA;
    }
    await el.play();
    if (Date.now() - lastPlayLog.current > 30_000) {
      lastPlayLog.current = Date.now();
      logClientEvent("play", songId, { sourceId: source.id, pitch: pitch.value, speed });
    }
  }, [loopA, loopB, pitch.value, songId, source.id, speed]);

  const seek = (t: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = t;
  };

  const tooFar = Math.abs(pitch.value) > COMFORTABLE_AUDIO_SHIFT;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <audio
        ref={audioRef}
        src={`/api/sources/${source.id}/audio`}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onSeeking={() => playerRef.current?.flush()}
        onSeeked={(e) => onPlaybackTime?.(e.currentTarget.currentTime)}
      />
      <div className="truncate text-xs text-muted-foreground" title={source.originalFilename ?? ""}>
        {source.originalFilename ?? "Audio"}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="icon"
          onClick={() => void togglePlay()}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span className="w-10 text-right font-mono text-xs tabular-nums">{fmtTime(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          className="flex-1 accent-primary"
        />
        <span className="w-10 font-mono text-xs tabular-nums">{fmtTime(duration)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Pitch</span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => prefs.setAudioPitch(pitch.value - 1)}
            disabled={pitch.value <= -MAX_AUDIO_SHIFT}
            aria-label="Pitch down"
          >
            <Minus />
          </Button>
          <span className="w-7 text-center font-mono text-sm tabular-nums">
            {formatSemitones(pitch.value)}
          </span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => prefs.setAudioPitch(pitch.value + 1)}
            disabled={pitch.value >= MAX_AUDIO_SHIFT}
            aria-label="Pitch up"
          >
            <Plus />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => prefs.setLinked(!prefs.pitchLinked)}
            aria-pressed={prefs.pitchLinked}
            title={
              prefs.pitchLinked
                ? "Linked to chord transpose (click to unlink)"
                : "Independent of chord transpose (click to link)"
            }
            aria-label={
              prefs.pitchLinked ? "Unlink pitch from transpose" : "Link pitch to transpose"
            }
          >
            {prefs.pitchLinked ? <Link2 /> : <Link2Off className="text-muted-foreground" />}
          </Button>
          <PrefChip state={pitch.state} reason={pitch.reason} />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Speed
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-6 rounded-md border bg-background px-1 text-xs text-foreground"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {Math.round(s * 100)}%
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Repeat className="size-3.5 text-muted-foreground" aria-hidden />
          <Button
            size="xs"
            variant={loopA !== null ? "secondary" : "outline"}
            onClick={() => setLoopA(time)}
            title="Set loop start at the current time"
          >
            A{loopA !== null ? ` ${fmtTime(loopA)}` : ""}
          </Button>
          <Button
            size="xs"
            variant={loopB !== null ? "secondary" : "outline"}
            onClick={() => setLoopB(time)}
            title="Set loop end at the current time"
          >
            B{loopB !== null ? ` ${fmtTime(loopB)}` : ""}
          </Button>
          {(loopA !== null || loopB !== null) && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setLoopA(null);
                setLoopB(null);
              }}
              aria-label="Clear loop"
            >
              <X />
            </Button>
          )}
        </div>
      </div>

      {(tooFar || graphError || (loopA !== null && loopB !== null && loopB <= loopA)) && (
        <div className="space-y-1 text-xs">
          {tooFar && (
            <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" aria-hidden /> Shifts beyond ±
              {COMFORTABLE_AUDIO_SHIFT} semitones sound noticeably artificial.
            </p>
          )}
          {graphError && <p className="text-destructive">{graphError}</p>}
          {loopA !== null && loopB !== null && loopB <= loopA && (
            <p className={cn("text-muted-foreground")}>Loop end must be after loop start.</p>
          )}
        </div>
      )}
    </div>
  );
}
