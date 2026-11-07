"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SheetEditor } from "@/components/sheet-form";
import { SongMetaFields, type SongMeta } from "@/components/song-meta-fields";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/api-client";

export function NewSongForm() {
  const router = useRouter();
  const [meta, setMeta] = useState<SongMeta>({
    title: "",
    artist: "",
    key: "",
    timeSignature: "",
    bpm: "",
    vocalistHint: "unknown",
  });
  const [sheet, setSheet] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { song } = await sendJson<{ song: { id: string } }>("/api/songs", "POST", {
        title: meta.title,
        artist: meta.artist,
        sheetText: sheet,
        key: meta.key || null,
        timeSignature: meta.timeSignature || null,
        bpm: meta.bpm ? Number(meta.bpm) : null,
        vocalistHint: meta.vocalistHint,
      });
      router.push(`/songs/${song.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <SongMetaFields value={meta} onChange={setMeta} />
      <SheetEditor value={sheet} onChange={setSheet} title={meta.title} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !meta.title.trim() || !sheet.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          Save song
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
