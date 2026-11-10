import type { Metadata } from "next";
import { connection } from "next/server";
import { SongView } from "@/components/song/song-view";
import { DEFAULT_USER_ID } from "@/server/constants";
import { getDb } from "@/server/db/client";
import { loadSongOr404 } from "@/server/pages";
import { latestAnalysis, latestTimeline } from "@/server/services/analysis";
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
  const [prefs, patterns, analysis, timeline] = await Promise.all([
    getPrefsView(db, DEFAULT_USER_ID, id),
    listStrumPatterns(db, DEFAULT_USER_ID),
    latestAnalysis(db, id),
    latestTimeline(db, id),
  ]);
  return (
    <SongView
      // Remount when the analyzer delivers a new sheet or audio, so local state starts fresh.
      key={`${detail.sheet?.id ?? "none"}:${detail.audio?.id ?? "none"}`}
      song={detail.song}
      chordpro={detail.sheet?.chordpro ?? ""}
      sheetOrigin={detail.sheet?.origin ?? null}
      initialAudio={detail.audio}
      hasYouTubeSource={detail.sources.some((s) => s.kind === "youtube" && s.youtubeVideoId)}
      analysis={analysis}
      timeline={timeline}
      initialPrefs={prefs}
      initialPatterns={patterns}
    />
  );
}
