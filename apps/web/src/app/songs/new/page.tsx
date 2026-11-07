import type { Metadata } from "next";
import { NewSongForm } from "./new-song-form";

export const metadata: Metadata = { title: "Add song" };

export default function NewSongPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a song</h1>
        <p className="text-sm text-muted-foreground">
          Paste a chord sheet. Audio upload is available on the song page once it&apos;s saved.
        </p>
      </div>
      <NewSongForm />
    </div>
  );
}
