/**
 * Stub seam for Graft indexing until the Zig/Rust spike lands (V1S-73, V1S-74).
 * Describes the remap engine boundary from ADR-0003 and the v0 spec.
 */

export interface ChopState {
  readonly gridIndex: number;
  readonly loopCount: number;
  readonly stutterActive: boolean;
}

export interface RemapOutput {
  readonly sourceTimeSeconds: number;
  readonly chopState: ChopState;
}

export interface TransportSample {
  readonly clockTimeSeconds: number;
  readonly playbackRate: number;
}

/** Remap engine: maps locked clock + beat grid to source time and chop state. */
export function remapAtTransport(sample: TransportSample): RemapOutput {
  return {
    sourceTimeSeconds: sample.clockTimeSeconds * sample.playbackRate,
    chopState: {
      gridIndex: 0,
      loopCount: 1,
      stutterActive: false,
    },
  };
}
