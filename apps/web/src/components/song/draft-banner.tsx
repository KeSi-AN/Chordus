"use client";

import { countUncertain, stripUncertainMarks } from "@chordus/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, Loader2, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { sendJson } from "@/lib/api-client";

/** Shown while the primary sheet is an unchecked draft detected from audio (plan section 7). */
export function DraftBanner({ songId, chordpro }: { songId: string; chordpro: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uncertain = countUncertain(chordpro);

  const markChecked = async () => {
    setSaving(true);
    setError(null);
    try {
      await sendJson(`/api/songs/${songId}/sheets`, "POST", {
        text: stripUncertainMarks(chordpro),
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <p>
        <span className="font-medium">Draft chords detected from audio.</span>{" "}
        {uncertain > 0 ? (
          <>
            {uncertain} low-confidence {uncertain === 1 ? "chord is" : "chords are"}{" "}
            <span className="underline decoration-amber-500 decoration-dotted decoration-2 underline-offset-4">
              underlined
            </span>
            . Play along, fix anything that&apos;s off, then mark the sheet as checked.
          </>
        ) : (
          "Play along and fix anything that's off, then mark the sheet as checked."
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={`/songs/${songId}/edit`}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          <Pencil /> Edit chords
        </Link>
        <Button size="sm" variant="outline" onClick={() => void markChecked()} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <CheckCheck />}
          Mark as checked
        </Button>
      </div>
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
