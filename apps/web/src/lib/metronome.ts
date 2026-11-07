/**
 * Look-ahead Web Audio metronome. Schedules clicks slightly ahead of time for steady timing
 * and reports the current slot index (for highlighting a strum pattern grid).
 */
export interface MetronomeOptions {
  bpm: number;
  /** Slots per bar (e.g. 8 for 4/4 eighths). */
  slots: number;
  /** Slots per counted beat (e.g. 2 for eighths in 4/4). */
  slotsPerBeat: number;
  onSlot: (slot: number) => void;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private slot = 0;
  private opts: MetronomeOptions;
  private uiTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(opts: MetronomeOptions) {
    this.opts = opts;
  }

  update(opts: Partial<MetronomeOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  get running(): boolean {
    return this.timer !== null;
  }

  async start(): Promise<void> {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.slot = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.uiTimers.forEach(clearTimeout);
    this.uiTimers = [];
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { bpm, slots, slotsPerBeat } = this.opts;
    const slotDur = 60 / bpm / slotsPerBeat;
    while (this.nextTime < ctx.currentTime + 0.1) {
      const slot = this.slot % slots;
      if (slot % slotsPerBeat === 0) this.click(this.nextTime, slot === 0);
      const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
      this.uiTimers.push(setTimeout(() => this.opts.onSlot(slot), delay));
      this.nextTime += slotDur;
      this.slot++;
    }
    this.uiTimers = this.uiTimers.slice(-64);
  }

  private click(at: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}
