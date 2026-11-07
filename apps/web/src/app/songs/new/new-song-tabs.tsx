"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardPaste, FileAudio, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileImportForm, YouTubeImportForm } from "./import-forms";
import { NewSongForm } from "./new-song-form";

const TABS = [
  { id: "paste", label: "Paste a sheet", Icon: ClipboardPaste },
  { id: "file", label: "Audio file", Icon: FileAudio },
  { id: "youtube", label: "YouTube link", Icon: Link2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Three ways to add a song. The active tab lives in the URL (?from=youtube). */
export function NewSongTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const fromParam = params.get("from");
  const tab: TabId = TABS.some((t) => t.id === fromParam) ? (fromParam as TabId) : "paste";

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="How to add the song"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => router.replace(id === "paste" ? "/songs/new" : `/songs/new?from=${id}`)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "paste" && <NewSongForm />}
        {tab === "file" && <FileImportForm />}
        {tab === "youtube" && <YouTubeImportForm />}
      </div>
    </div>
  );
}
