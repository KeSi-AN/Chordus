"use client";

import type { PrefState } from "@chordus/core";
import { Check, Pencil, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STYLES: Record<PrefState, { label: string; className: string; Icon: typeof Check }> = {
  suggested: {
    label: "Suggested",
    className: "border-dashed border-muted-foreground/40 text-muted-foreground",
    Icon: Sparkles,
  },
  edited: {
    label: "Edited",
    className: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: Pencil,
  },
  confirmed: {
    label: "Confirmed",
    className: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: Check,
  },
};

/** "Suggested" / "Edited" / "Confirmed" chip with the reason on hover or tap. */
export function PrefChip({ state, reason }: { state: PrefState; reason?: string }) {
  const s = STYLES[state];
  const chip = (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium",
        s.className,
      )}
    >
      <s.Icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
  if (!reason) return chip;
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="cursor-help rounded-full" />}>
        {chip}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}
