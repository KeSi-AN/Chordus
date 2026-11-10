/**
 * Routes an <audio> element through the SoundTouch pitch-shift worklet:
 *   <audio> → MediaElementSource → AudioWorkletNode("pitch-shift") → destination
 * Speed is handled by the element itself (playbackRate + preservesPitch).
 */

const WORKLET_URL = "/worklets/pitch-shift-processor.js";

/** createMediaElementSource may only be called once per element, ever. */
const sources = new WeakMap<
  HTMLMediaElement,
  { ctx: AudioContext; node: MediaElementAudioSourceNode }
>();

export class PitchPlayer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private semitones = 0;
  private building: Promise<void> | null = null;
  /** Set if the graph could not be built; playback then continues without pitch shift. */
  error: string | null = null;

  constructor(private readonly audio: HTMLAudioElement) {
    audio.preservesPitch = true;
  }

  /** Build the audio graph. Must be called from a user gesture (e.g. the play button). */
  async ensureGraph(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    this.building ??= this.build();
    await this.building;
  }

  private async build(): Promise<void> {
    try {
      const existing = sources.get(this.audio);
      const ctx = existing?.ctx ?? new AudioContext();
      if (ctx.state === "closed") throw new Error("Audio context was closed");
      await ctx.audioWorklet.addModule(WORKLET_URL);
      const source = existing?.node ?? ctx.createMediaElementSource(this.audio);
      sources.set(this.audio, { ctx, node: source });
      const node = new AudioWorkletNode(ctx, "pitch-shift", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { semitones: this.semitones },
      });
      source.disconnect();
      source.connect(node).connect(ctx.destination);
      this.ctx = ctx;
      this.node = node;
      this.setPitch(this.semitones);
      if (ctx.state === "suspended") await ctx.resume();
    } catch (err) {
      this.error = `Pitch shifting unavailable: ${(err as Error).message}`;
      console.error(err);
      await this.playUnshifted();
    }
  }

  /**
   * Once createMediaElementSource has run, the element only sounds through the graph. If the
   * shifter then fails to load, wire the element straight to the speakers: playing at the
   * original pitch (with the error shown) beats a player that runs silently.
   */
  private async playUnshifted(): Promise<void> {
    const routed = sources.get(this.audio);
    if (!routed || routed.ctx.state === "closed") return;
    try {
      routed.node.disconnect();
      routed.node.connect(routed.ctx.destination);
      this.ctx = routed.ctx;
      if (routed.ctx.state === "suspended") await routed.ctx.resume();
    } catch (err) {
      console.error(err);
    }
  }

  setPitch(semitones: number): void {
    this.semitones = semitones;
    this.node?.port.postMessage({ type: "pitch", semitones });
  }

  setSpeed(rate: number): void {
    this.audio.playbackRate = rate;
    this.audio.preservesPitch = true;
  }

  /** Drop buffered audio inside the shifter (call when seeking). */
  flush(): void {
    this.node?.port.postMessage({ type: "flush" });
  }

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    const ctx = this.ctx;
    const audio = this.audio;
    this.ctx = null;
    this.building = null;
    if (!ctx) return;
    // The context is tied to the element (see `sources`), and the element may be about to be
    // reused: React re-runs effects on the same element in development. So suspend now, and
    // close only once the element has really left the page. Without the close, every song
    // played leaves a suspended AudioContext behind until the tab is reloaded.
    void ctx.suspend().catch(() => {});
    setTimeout(() => {
      if (audio.isConnected) return;
      sources.delete(audio);
      void ctx.close().catch(() => {});
    }, 0);
  }
}
