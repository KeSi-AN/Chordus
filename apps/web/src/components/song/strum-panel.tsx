"use client";

import {
  countLabels,
  cycleStroke,
  formatPattern,
  parsePattern,
  resizePattern,
  slotsPerBar,
  slotsPerBeat,
  validatePattern,
  type StrumStroke,
} from "@chordus/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pause, Plus, Timer, X } from "lucide-react";
import { PrefChip } from "@/components/pref-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { sendJson } from "@/lib/api-client";
import { Metronome } from "@/lib/metronome";
import { cn } from "@/lib/utils";
import type { StrumPattern } from "@/server/db/schema";
import type { SongPrefsState } from "./use-song-prefs";

function StrokeIcon({ stroke }: { stroke: StrumStroke }) {
  if (stroke === "D") return <ArrowDown className="size-4" aria-label="down" />;
  if (stroke === "U") return <ArrowUp className="size-4" aria-label="up" />;
  if (stroke === "x") return <X className="size-3.5" aria-label="muted" />;
  return (
    <span className="text-muted-foreground" aria-label="rest">
      ·
    </span>
  );
}

/** One bar of a strum pattern as a grid of slots with beat counts. */
export function StrumGrid({
  pattern,
  timeSignature,
  subdivision,
  activeSlot,
  onToggle,
}: {
  pattern: string;
  timeSignature: string;
  subdivision: number;
  activeSlot?: number | null;
  onToggle?: (index: number) => void;
}) {
  const strokes = parsePattern(pattern);
  const labels = countLabels(timeSignature, subdivision);
  const perBeat = slotsPerBeat(timeSignature, subdivision);
  return (
    <div className="flex flex-wrap gap-y-2">
      {strokes.map((s, i) => {
        const Tag = onToggle ? "button" : "div";
        return (
          <Tag
            key={i}
            type={onToggle ? "button" : undefined}
            onClick={onToggle ? () => onToggle(i) : undefined}
            className={cn(
              "flex w-7 flex-col items-center gap-0.5 rounded py-1",
              i % perBeat === 0 && i > 0 && "ml-1.5",
              onToggle && "border hover:bg-muted",
              activeSlot === i && "bg-primary text-primary-foreground",
            )}
            aria-label={onToggle ? `Slot ${i + 1}: ${s}` : undefined}
          >
            <StrokeIcon stroke={s} />
            <span
              className={cn(
                "text-[10px]",
                activeSlot === i ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {labels[i]}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** Strum pattern picker, grid editor and click metronome. */
export function StrumPanel({
  patterns,
  timeSignature,
  bpm,
  prefs,
  onPatternCreated,
}: {
  patterns: StrumPattern[];
  timeSignature: string;
  bpm: number | null;
  prefs: SongPrefsState;
  onPatternCreated: (p: StrumPattern) => void;
}) {
  const field = prefs.fields.strum;
  const selected = patterns.find((p) => p.id === field.value) ?? null;
  const [editing, setEditing] = useState(false);
  const [tempo, setTempo] = useState(Math.round(bpm ?? 90));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const metronome = useRef<Metronome | null>(null);
  const [ticking, setTicking] = useState(false);

  const grouped = useMemo(() => {
    const same = patterns.filter((p) => p.timeSignature === timeSignature);
    const other = patterns.filter((p) => p.timeSignature !== timeSignature);
    return { same, other };
  }, [patterns, timeSignature]);

  useEffect(() => () => metronome.current?.dispose(), []);

  useEffect(() => {
    if (!selected) return;
    metronome.current?.update({
      bpm: tempo,
      slots: slotsPerBar(selected.timeSignature, selected.subdivision),
      slotsPerBeat: slotsPerBeat(selected.timeSignature, selected.subdivision),
    });
  }, [selected, tempo]);

  const toggleMetronome = async () => {
    if (ticking) {
      metronome.current?.stop();
      setTicking(false);
      setActiveSlot(null);
      return;
    }
    const ts = selected?.timeSignature ?? timeSignature;
    const sub = selected?.subdivision ?? 8;
    metronome.current ??= new Metronome({
      bpm: tempo,
      slots: slotsPerBar(ts, sub),
      slotsPerBeat: slotsPerBeat(ts, sub),
      onSlot: setActiveSlot,
    });
    await metronome.current.start();
    setTicking(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Strumming</h2>
        <PrefChip state={field.state} reason={field.reason} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={field.value ?? ""}
          onChange={(e) => prefs.setStrum(e.target.value || null)}
          aria-label="Strum pattern"
          className="max-w-full min-w-0 flex-1"
        >
          <option value="">No pattern</option>
          {grouped.same.length > 0 && (
            <optgroup label={`${timeSignature} patterns`}>
              {grouped.same.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {grouped.other.length > 0 && (
            <optgroup label="Other time signatures">
              {grouped.other.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.timeSignature})
                </option>
              ))}
            </optgroup>
          )}
        </NativeSelect>
        <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
          <Plus /> New
        </Button>
      </div>

      {selected && (
        <div className="space-y-2">
          <StrumGrid
            pattern={selected.pattern}
            timeSignature={selected.timeSignature}
            subdivision={selected.subdivision}
            activeSlot={activeSlot}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              size="xs"
              variant={ticking ? "secondary" : "outline"}
              onClick={() => void toggleMetronome()}
            >
              {ticking ? <Pause /> : <Timer />}
              {ticking ? "Stop" : "Metronome"}
            </Button>
            <label className="flex items-center gap-1">
              <Input
                type="number"
                min={30}
                max={260}
                value={tempo}
                onChange={(e) =>
                  setTempo(Math.max(30, Math.min(260, Number(e.target.value) || 90)))
                }
                className="h-6 w-16 px-1.5 text-xs"
                aria-label="Metronome BPM"
              />
              BPM
            </label>
          </div>
        </div>
      )}

      {editing && (
        <StrumEditor
          timeSignature={timeSignature}
          initial={selected?.timeSignature === timeSignature ? selected : null}
          onCancel={() => setEditing(false)}
          onSaved={(p) => {
            onPatternCreated(p);
            prefs.setStrum(p.id);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function StrumEditor({
  timeSignature,
  initial,
  onSaved,
  onCancel,
}: {
  timeSignature: string;
  initial: StrumPattern | null;
  onSaved: (p: StrumPattern) => void;
  onCancel: () => void;
}) {
  const [subdivision, setSubdivision] = useState<8 | 16>(initial?.subdivision === 16 ? 16 : 8);
  const [pattern, setPattern] = useState(() => {
    const slots = slotsPerBar(timeSignature, initial?.subdivision ?? 8);
    return initial ? resizePattern(initial.pattern, slots) : "D".padEnd(slots, "-");
  });
  const [name, setName] = useState(initial ? `${initial.name} (mine)` : "My pattern");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeSubdivision = (s: 8 | 16) => {
    setSubdivision(s);
    try {
      setPattern((p) => resizePattern(p, slotsPerBar(timeSignature, s)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (i: number) => {
    const strokes = parsePattern(pattern);
    strokes[i] = cycleStroke(strokes[i]!);
    setPattern(formatPattern(strokes));
  };

  const validation = validatePattern({ timeSignature, subdivision, pattern });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { pattern: created } = await sendJson<{ pattern: StrumPattern }>(
        "/api/strum-patterns",
        "POST",
        { name, timeSignature, subdivision, pattern },
      );
      onSaved(created);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 max-w-48 text-sm"
          aria-label="Pattern name"
        />
        <span className="text-xs text-muted-foreground">{timeSignature}</span>
        <NativeSelect
          value={subdivision}
          onChange={(e) => changeSubdivision(Number(e.target.value) as 8 | 16)}
          className="h-7 text-xs"
          aria-label="Slot length"
        >
          <option value={8}>8th notes</option>
          <option value={16}>16th notes</option>
        </NativeSelect>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a slot to cycle: down → up → muted → rest.
      </p>
      <StrumGrid
        pattern={pattern}
        timeSignature={timeSignature}
        subdivision={subdivision}
        onToggle={toggle}
      />
      {(error || !validation.ok) && (
        <p className="text-xs text-destructive">{error ?? validation.error}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving || !validation.ok || !name.trim()}
        >
          {saving && <Loader2 className="animate-spin" />}
          Save pattern
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
