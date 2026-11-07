import type { Metadata } from "next";
import { connection } from "next/server";
import { loadSongOr404 } from "@/server/pages";
import { EditSongForm } from "./edit-song-form";

export const metadata: Metadata = { title: "Edit song" };

export default async function EditSongPage({ params }: PageProps<"/songs/[id]/edit">) {
  await connection();
  const { id } = await params;
  const { song, sheet } = await loadSongOr404(id);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {song.title}</h1>
      <EditSongForm
        songId={song.id}
        initialMeta={{
          title: song.title,
          artist: song.artist,
          key: song.originalKey ?? "",
          timeSignature: song.timeSignature,
          bpm: song.bpm ? String(song.bpm) : "",
          vocalistHint: song.vocalistHint,
        }}
        initialSheet={sheet?.chordpro ?? ""}
      />
    </div>
  );
}
