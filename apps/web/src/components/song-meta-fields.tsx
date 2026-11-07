"use client";

import { allKeys, formatKey } from "@chordus/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export interface SongMeta {
  title: string;
  artist: string;
  key: string;
  timeSignature: string;
  bpm: string;
  vocalistHint: "male" | "female" | "unknown";
}

const KEY_OPTIONS = allKeys().map(formatKey);
const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "2/4", "12/8", "2/2"];

/** Title / artist / key / time / BPM / vocalist fields shared by the add and edit pages. */
export function SongMetaFields({
  value,
  onChange,
  keyPlaceholder = "Detect from chords",
}: {
  value: SongMeta;
  onChange: (v: SongMeta) => void;
  keyPlaceholder?: string;
}) {
  const set = <K extends keyof SongMeta>(k: K, v: SongMeta[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <Label htmlFor="artist">Artist</Label>
        <Input id="artist" value={value.artist} onChange={(e) => set("artist", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key">Key</Label>
        <NativeSelect id="key" value={value.key} onChange={(e) => set("key", e.target.value)}>
          <option value="">{keyPlaceholder}</option>
          {KEY_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vocalist">Vocalist</Label>
        <NativeSelect
          id="vocalist"
          value={value.vocalistHint}
          onChange={(e) => set("vocalistHint", e.target.value as SongMeta["vocalistHint"])}
        >
          <option value="unknown">Unknown</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="time">Time signature</Label>
        <NativeSelect
          id="time"
          value={value.timeSignature}
          onChange={(e) => set("timeSignature", e.target.value)}
        >
          <option value="">From sheet (or 4/4)</option>
          {TIME_SIGNATURES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bpm">BPM</Label>
        <Input
          id="bpm"
          type="number"
          min={20}
          max={400}
          inputMode="numeric"
          placeholder="Optional"
          value={value.bpm}
          onChange={(e) => set("bpm", e.target.value)}
        />
      </div>
    </div>
  );
}
