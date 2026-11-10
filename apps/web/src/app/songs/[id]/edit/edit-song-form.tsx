"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { SheetEditor } from "@/components/sheet-form";
import { SongMetaFields, type SongMeta } from "@/components/song-meta-fields";
import { Button } from "@/components/ui/button";
import { deleteRequest, sendJson } from "@/lib/api-client";

export function EditSongForm({
  songId,
  initialMeta,
  initialSheet,
}: {
  songId: string;
  initialMeta: SongMeta;
  initialSheet: string;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState(initialMeta);
  const [sheet, setSheet] = useState(initialSheet);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await sendJson(`/api/songs/${songId}`, "PATCH", {
        title: meta.title,
        artist: meta.artist,
        originalKey: meta.key || null,
        timeSignature: meta.timeSignature || "4/4",
        bpm: meta.bpm ? Number(meta.bpm) : null,
        vocalistHint: meta.vocalistHint,
      });
      if (sheet !== initialSheet && sheet.trim()) {
        await sendJson(`/api/songs/${songId}/sheets`, "POST", { text: sheet });
      }
      router.push(`/songs/${songId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  // A song imported from audio has no sheet until its analysis finishes (or if it failed), and
  // its title, artist and key must still be editable. Only clearing an existing sheet is refused.
  const clearedSheet = !sheet.trim() && Boolean(initialSheet.trim());

  const remove = async () => {
    if (!window.confirm(`Delete "${meta.title}" and its audio? This can't be undone.`)) return;
    try {
      await deleteRequest(`/api/songs/${songId}`);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <SongMetaFields value={meta} onChange={setMeta} keyPlaceholder="Unknown" />
      <SheetEditor value={sheet} onChange={setSheet} title={meta.title} />
      <p className="text-xs text-muted-foreground">
        {clearedSheet
          ? "The sheet can't be saved empty. Cancel to keep the current one."
          : "Saving a changed sheet keeps the old version and makes this one the primary sheet."}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || !meta.title.trim() || clearedSheet}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="ml-auto"
          onClick={() => void remove()}
        >
          <Trash2 /> Delete song
        </Button>
      </div>
    </form>
  );
}
