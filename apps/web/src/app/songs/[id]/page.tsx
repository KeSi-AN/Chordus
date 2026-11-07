import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SongView } from "@/components/song/song-view";
import { DEFAULT_USER_ID } from "@/server/constants";
import { getDb } from "@/server/db/client";
import { getPrefsView } from "@/server/services/prefs";
import { getSongDetail, NotFoundError } from "@/server/services/songs";
import { listStrumPatterns } from "@/server/services/strum";

async function load(id: string) {
  const db = await getDb();
  try {
    return await getSongDetail(db, DEFAULT_USER_ID, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/songs/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const { song } = await load(id);
  return { title: song.title };
}

export default async function SongPage({ params }: PageProps<"/songs/[id]">) {
  await connection();
  const { id } = await params;
  const db = await getDb();
  const detail = await load(id);
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
