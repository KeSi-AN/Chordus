import type { Metadata } from "next";
import { Suspense } from "react";
import { NewSongTabs } from "./new-song-tabs";

export const metadata: Metadata = { title: "Add song" };

export default function NewSongPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a song</h1>
        <p className="text-sm text-muted-foreground">
          Paste a chord sheet, or start from audio and get a draft chord sheet detected for you.
        </p>
      </div>
      <Suspense>
        <NewSongTabs />
      </Suspense>
    </div>
  );
}
