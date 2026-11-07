"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { logClientEvent } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const FILTER_LABELS = [
  ["all", "All"],
  ["confirmed", "Confirmed"],
  ["unconfirmed", "Unconfirmed"],
  ["has_audio", "Has audio"],
] as const;

/** Search box + filters that live in the URL (?q=&filter=&key=). */
export function LibrarySearch({
  q,
  filter,
  songKey,
  keys,
}: {
  q: string;
  filter: string;
  songKey: string;
  keys: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const lastLogged = useRef(q);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && !(k === "filter" && v === "all")) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  // Debounce typing into the URL; log a search event once the query settles.
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => {
      update({ q: text.trim() });
      if (text.trim() && text.trim() !== lastLogged.current) {
        lastLogged.current = text.trim();
        logClientEvent("search", null, { query: text.trim() });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the text changes
  }, [text]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search title or artist"
          aria-label="Search songs"
          className={cn("pl-8", pending && "opacity-70")}
        />
        {text && (
          <button
            type="button"
            onClick={() => setText("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
        {FILTER_LABELS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => update({ filter: value })}
            aria-pressed={filter === value}
            className={cn(
              "h-8 rounded-lg border px-2.5 text-sm transition-colors",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {keys.length > 0 && (
        <select
          value={songKey}
          onChange={(e) => update({ key: e.target.value })}
          aria-label="Filter by key"
          className="h-8 rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">Any key</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
