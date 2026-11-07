import Link from "next/link";
import { connection } from "next/server";
import { Check, Music, Plus } from "lucide-react";
import { LibrarySearch } from "@/components/library-search";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/server/db/client";
import { DEFAULT_USER_ID } from "@/server/constants";
import {
  libraryKeys,
  listSongs,
  needsConfirming,
  recentlyPlayed,
  type SongFilter,
  type SongListItem,
} from "@/server/services/songs";
import { cn } from "@/lib/utils";

const FILTERS: SongFilter[] = ["all", "confirmed", "unconfirmed", "has_audio"];

export default async function LibraryPage({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const filterParam = typeof params.filter === "string" ? params.filter : "all";
  const filter = FILTERS.includes(filterParam as SongFilter) ? (filterParam as SongFilter) : "all";
  const key = typeof params.key === "string" ? params.key : "";

  const db = await getDb();
  const userId = DEFAULT_USER_ID;
  const [songs, keys, recent, pending] = await Promise.all([
    listSongs(db, { userId, query: q, filter, key: key || undefined }),
    libraryKeys(db, userId),
    recentlyPlayed(db, userId),
    needsConfirming(db, userId),
  ]);
  const browsing = !q && filter === "all" && !key;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
            {browsing ? "" : " matching"}
          </p>
        </div>
        <Link href="/songs/new" className={buttonVariants()}>
          <Plus /> Add song
        </Link>
      </div>

      <LibrarySearch q={q} filter={filter} songKey={key} keys={keys} />

      {browsing && (recent.length > 0 || pending.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {recent.length > 0 && <SongStrip title="Recently played" songs={recent} />}
          {pending.length > 0 && <SongStrip title="Needs confirming" songs={pending} />}
        </div>
      )}

      <section>
        {browsing && (
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">All songs</h2>
        )}
        {songs.length === 0 ? (
          <EmptyState searching={!browsing} />
        ) : (
          <ul className="divide-y rounded-xl border">
            {songs.map((s) => (
              <li key={s.id}>
                <SongRow song={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SongRow({ song }: { song: SongListItem }) {
  return (
    <Link
      href={`/songs/${song.id}`}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{song.title}</div>
        <div className="truncate text-sm text-muted-foreground">
          {song.artist || "Unknown artist"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {song.hasAudio && (
          <span className="flex items-center gap-1" title="Has audio">
            <Music className="size-3.5" aria-hidden />
            <span className="sr-only">Has audio</span>
          </span>
        )}
        {song.originalKey && (
          <span className="rounded border px-1.5 py-0.5 font-mono">{song.originalKey}</span>
        )}
        {song.confirmed ? (
          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden /> Confirmed
          </span>
        ) : (
          <span className="w-[4.75rem]" aria-hidden />
        )}
      </div>
    </Link>
  );
}

function SongStrip({ title, songs }: { title: string; songs: SongListItem[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="divide-y rounded-xl border">
        {songs.map((s) => (
          <li key={s.id}>
            <SongRow song={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="font-medium">{searching ? "No songs match" : "No songs yet"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {searching ? "Try a different search or filter." : "Paste a chord sheet to get started."}
      </p>
      {!searching && (
        <Link href="/songs/new" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          <Plus /> Add song
        </Link>
      )}
    </div>
  );
}
