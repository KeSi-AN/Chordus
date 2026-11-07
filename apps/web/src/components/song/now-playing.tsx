import { cn } from "@/lib/utils";

/** Big "now / next" chord strip while analyzed audio plays. */
export function NowPlaying({
  current,
  next,
  uncertain,
}: {
  current: string | null;
  next: string | null;
  uncertain: boolean;
}) {
  return (
    <div
      className="sticky top-14 z-10 flex items-baseline gap-4 rounded-xl border bg-card/95 px-4 py-2 backdrop-blur"
      aria-live="off"
    >
      <span className="text-xs text-muted-foreground uppercase">Now</span>
      <span
        className={cn(
          "min-w-[3ch] text-3xl font-bold text-primary",
          uncertain && "underline decoration-amber-500 decoration-dotted underline-offset-8",
        )}
      >
        {current ?? "–"}
      </span>
      <span className="text-xs text-muted-foreground uppercase">Next</span>
      <span className="text-xl font-semibold text-muted-foreground">{next ?? "–"}</span>
    </div>
  );
}
