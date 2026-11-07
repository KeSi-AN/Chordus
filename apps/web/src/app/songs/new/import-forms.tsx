"use client";

import { parseYouTubeVideoId } from "@chordus/core";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileAudio, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { sendJson } from "@/lib/api-client";

interface ImportResponse {
  songId: string;
  existing: boolean;
}

function OptionalMeta({
  title,
  artist,
  hint,
  onChange,
}: {
  title: string;
  artist: string;
  hint: string;
  onChange: (k: "title" | "artist" | "hint", v: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imp-title">Title (optional)</Label>
        <Input id="imp-title" value={title} onChange={(e) => onChange("title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imp-artist">Artist (optional)</Label>
        <Input
          id="imp-artist"
          value={artist}
          onChange={(e) => onChange("artist", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imp-hint">Vocalist</Label>
        <NativeSelect id="imp-hint" value={hint} onChange={(e) => onChange("hint", e.target.value)}>
          <option value="unknown">Unknown</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </NativeSelect>
      </div>
    </div>
  );
}

function useMeta() {
  const [meta, setMeta] = useState({ title: "", artist: "", hint: "unknown" });
  return {
    meta,
    onChange: (k: "title" | "artist" | "hint", v: string) => setMeta((m) => ({ ...m, [k]: v })),
  };
}

const ANALYSIS_NOTE =
  "The analyzer detects key, tempo and chords per bar (a draft to check by ear) and measures " +
  "the vocal range. It usually takes 1–3 minutes on this machine.";

export function YouTubeImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const { meta, onChange } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoId = parseYouTubeVideoId(url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await sendJson<ImportResponse>("/api/import", "POST", {
        youtubeUrl: url,
        title: meta.title || undefined,
        artist: meta.artist || undefined,
        vocalistHint: meta.hint,
      });
      router.push(`/songs/${r.songId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="yt-url">YouTube link</Label>
        <Input
          id="yt-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          {url && !videoId
            ? "That doesn't look like a YouTube video link."
            : "Karaoke videos work well. The audio is downloaded on this machine for personal use."}
        </p>
      </div>
      <OptionalMeta {...meta} onChange={onChange} />
      <p className="text-sm text-muted-foreground">{ANALYSIS_NOTE}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !videoId}>
        {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
        Import and analyze
      </Button>
    </form>
  );
}

export function FileImportForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const { meta, onChange } = useMeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (meta.title) form.append("title", meta.title);
    if (meta.artist) form.append("artist", meta.artist);
    form.append("vocalistHint", meta.hint);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = (await res.json()) as ImportResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
      router.push(`/songs/${body.songId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5">
      <div className="flex flex-col gap-1.5">
        <Label>Audio file</Label>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex items-center gap-3 rounded-lg border border-dashed p-5 text-left text-sm hover:bg-muted/50"
        >
          <FileAudio className="size-6 text-muted-foreground" aria-hidden />
          {file ? (
            <span>
              <span className="font-medium">{file.name}</span>
              <span className="ml-2 text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Choose an MP3, M4A, WAV, OGG or FLAC file</span>
          )}
        </button>
      </div>
      <OptionalMeta {...meta} onChange={onChange} />
      <p className="text-sm text-muted-foreground">{ANALYSIS_NOTE}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !file}>
        {busy && <Loader2 className="animate-spin" />}
        Upload and analyze
      </Button>
    </form>
  );
}
