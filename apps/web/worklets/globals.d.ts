// Ambient types for the AudioWorkletGlobalScope (not in TypeScript's DOM lib).

declare const sampleRate: number;
declare const currentTime: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: {
    processorOptions?: Record<string, unknown>;
  }) => AudioWorkletProcessor,
): void;

// Minimal typings for the parts of soundtouchjs we use (the package ships no types).
declare module "soundtouchjs" {
  export class FifoSampleBuffer {
    readonly frameCount: number;
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
    receiveSamples(output: Float32Array, numFrames?: number): void;
    receive(numFrames?: number): void;
    clear(): void;
  }
  export class Stretch {
    setParameters(
      sampleRate: number,
      sequenceMs: number,
      seekWindowMs: number,
      overlapMs: number,
    ): void;
  }
  export class SoundTouch {
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    readonly stretch: Stretch;
    pitchSemitones: number;
    tempo: number;
    rate: number;
    process(): void;
    clear(): void;
  }
}
