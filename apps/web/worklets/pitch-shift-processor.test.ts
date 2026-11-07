import { beforeAll, describe, expect, it } from "vitest";

/* Minimal AudioWorkletGlobalScope so the processor module can be loaded in Node. */
type ProcessorInstance = {
  port: { onmessage: ((e: { data: unknown }) => void) | null };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
let Processor: new () => ProcessorInstance;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = 44100;
  g.AudioWorkletProcessor = class {
    port = { onmessage: null as ((e: { data: unknown }) => void) | null };
  };
  g.registerProcessor = (_name: string, ctor: new () => ProcessorInstance) => {
    Processor = ctor;
  };
  await import("./pitch-shift-processor");
});

const SR = 44100;

function run(semitones: number, freq: number, seconds: number): Float32Array {
  const p = new Processor();
  p.port.onmessage?.({ data: { type: "pitch", semitones } });
  const blocks = Math.floor((seconds * SR) / 128);
  const out = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) {
    const inL = new Float32Array(128);
    for (let i = 0; i < 128; i++)
      inL[i] = 0.5 * Math.sin((2 * Math.PI * freq * (b * 128 + i)) / SR);
    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    p.process([[inL, inL]], [[outL, outR]]);
    out.set(outL, b * 128);
  }
  return out;
}

/** Estimate frequency from zero crossings over the last `seconds` of a signal. */
function estimateFrequency(signal: Float32Array, seconds: number): number {
  const tail = signal.subarray(signal.length - Math.floor(seconds * SR));
  let crossings = 0;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i - 1]! < 0 && tail[i]! >= 0) crossings++;
  }
  return crossings / seconds;
}

describe("pitch-shift worklet", () => {
  it("passes audio through untouched at 0 semitones", () => {
    const out = run(0, 440, 0.1);
    expect(out[100]).toBeCloseTo(0.5 * Math.sin((2 * Math.PI * 440 * 100) / SR), 6);
  });

  it.each([
    [12, 880],
    [-12, 220],
    [7, 440 * Math.pow(2, 7 / 12)],
    [-3, 440 * Math.pow(2, -3 / 12)],
  ])("shifts 440 Hz by %i semitones to ~%f Hz", (semis, expected) => {
    const out = run(semis, 440, 1.5);
    const f = estimateFrequency(out, 0.5);
    expect(Math.abs(f - expected) / expected).toBeLessThan(0.03);
  });

  it("keeps duration (output keeps flowing, no tempo change)", () => {
    const out = run(5, 440, 2);
    // After priming, the last second should be continuously non-silent.
    const last = out.subarray(out.length - SR);
    let silentRun = 0;
    let maxSilentRun = 0;
    for (const v of last) {
      silentRun = Math.abs(v) < 1e-6 ? silentRun + 1 : 0;
      maxSilentRun = Math.max(maxSilentRun, silentRun);
    }
    expect(maxSilentRun).toBeLessThan(64);
  });
});
