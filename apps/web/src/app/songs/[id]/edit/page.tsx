import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DEFAULT_USER_ID } from "@/server/constants";
import { getDb } from "@/server/db/client";
import { getSongDetail, NotFoundError } from "@/server/services/songs";
import { EditSongForm } from "./edit-song-form";

export const metadata: Metadata = { title: "Edit song" };

export default async function EditSongPage({ params }: PageProps<"/songs/[id]/edit">) {
  await connection();
  const { id } = await params;
  const db = await getDb();
  try {
    const { song, sheet } = await getSongDetail(db, DEFAULT_USER_ID, id);
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
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
