import type { Metadata } from "next";
import { connection } from "next/server";
import { SongView } from "@/components/song/song-view";
import { DEFAULT_USER_ID } from "@/server/constants";
import { getDb } from "@/server/db/client";
import { loadSongOr404 } from "@/server/pages";
import { getPrefsView } from "@/server/services/prefs";
import { listStrumPatterns } from "@/server/services/strum";

export async function generateMetadata({ params }: PageProps<"/songs/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const { song } = await loadSongOr404(id);
  return { title: song.title };
}

export default async function SongPage({ params }: PageProps<"/songs/[id]">) {
  await connection();
  const { id } = await params;
  const detail = await loadSongOr404(id);
  const db = await getDb();
  const [prefs, patterns] = await Promise.all([
    getPrefsView(db, DEFAULT_USER_ID, id),
    listStrumPatterns(db, DEFAULT_USER_ID),
  ]);
  return (
    <SongView
      song={detail.song}
      chordpro={detail.sheet?.chordpro ?? ""}
      initialAudio={detail.audio}
      initialPrefs={prefs}
      initialPatterns={patterns}
    />
  );
}
