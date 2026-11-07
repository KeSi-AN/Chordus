/**
 * Streaming pitch shifter (AudioWorklet). Pitch changes without changing tempo, using SoundTouch.
 *
 * Input comes from a live source (e.g. <audio> via createMediaElementSource), so the same
 * processor works for uploaded files in the web app and for <video> on youtube.com in the
 * Chrome extension (Phase 4). Speed changes are left to the media element's own
 * `playbackRate` + `preservesPitch`.
 *
 * Messages (node.port.postMessage):
 *   { type: "pitch", semitones: number }  set the shift (0 = bypass, no added latency)
 *   { type: "flush" }                      drop buffered audio (call on seek)
 */
import { SoundTouch } from "soundtouchjs";

const BLOCK = 128;
/** Frames buffered before output starts, to ride out SoundTouch's bursty output. */
const PRIME_FRAMES = 5120;
/** Upper bound on buffered output; beyond this we drop audio to keep latency bounded. */
const MAX_BUFFERED_FRAMES = 16384;

class PitchShiftProcessor extends AudioWorkletProcessor {
  private st = new SoundTouch();
  private semitones = 0;
  private primed = false;
  private interleaved = new Float32Array(BLOCK * 2);
  private out = new Float32Array(BLOCK * 2);

  constructor() {
    super();
    this.configure();
    this.port.onmessage = (e: MessageEvent<{ type: string; semitones?: number }>) => {
      const msg = e.data;
      if (msg.type === "pitch" && typeof msg.semitones === "number") {
        const next = Math.max(-24, Math.min(24, msg.semitones));
        if (next !== this.semitones) {
          if (this.semitones === 0 || next === 0) this.reset();
          this.semitones = next;
          this.st.pitchSemitones = next;
        }
      } else if (msg.type === "flush") {
        this.reset();
      }
    };
  }

  private configure(): void {
    // Shorter-than-default WSOLA windows keep latency around 100 ms at a small quality cost.
    this.st.stretch.setParameters(sampleRate, 70, 20, 8);
    this.st.pitchSemitones = this.semitones;
  }

  private reset(): void {
    this.st = new SoundTouch();
    this.configure();
    this.primed = false;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const outL = output[0];
    if (!outL) return true;
    const outR = output[1];
    const frames = outL.length;
    const inL = input[0];
    const inR = input[1] ?? inL;

    if (this.semitones === 0) {
      if (inL) {
        outL.set(inL);
        outR?.set(inR ?? inL);
      } else {
        outL.fill(0);
        outR?.fill(0);
      }
      return true;
    }

    if (this.interleaved.length < frames * 2) {
      this.interleaved = new Float32Array(frames * 2);
      this.out = new Float32Array(frames * 2);
    }
    for (let i = 0; i < frames; i++) {
      this.interleaved[2 * i] = inL ? inL[i]! : 0;
      this.interleaved[2 * i + 1] = inR ? inR[i]! : 0;
    }
    this.st.inputBuffer.putSamples(this.interleaved, 0, frames);
    this.st.process();

    const available = this.st.outputBuffer.frameCount;
    if (available > MAX_BUFFERED_FRAMES) this.st.outputBuffer.receive(available - PRIME_FRAMES);
    if (!this.primed && this.st.outputBuffer.frameCount >= PRIME_FRAMES) this.primed = true;

    if (!this.primed || this.st.outputBuffer.frameCount < frames) {
      // Still filling (or an underrun): output silence and re-prime.
      if (this.primed) this.primed = false;
      outL.fill(0);
      outR?.fill(0);
      return true;
    }

    this.st.outputBuffer.receiveSamples(this.out, frames);
    for (let i = 0; i < frames; i++) {
      outL[i] = this.out[2 * i]!;
      if (outR) outR[i] = this.out[2 * i + 1]!;
    }
    return true;
  }
}

registerProcessor("pitch-shift", PitchShiftProcessor);
