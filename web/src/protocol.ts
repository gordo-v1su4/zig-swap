/**
 * Worker ↔ main remap frame contract (ADR-0003).
 * WASM core will populate these fields; stub sends placeholders until V1S-79.
 */

export interface ChopState {
  readonly gridIndex: number;
  readonly loopCount: number;
  readonly stutterActive: boolean;
}

/** Main thread receives one message per worker tick / frame. */
export interface RemapFrameMessage {
  readonly type: 'remap-frame';
  readonly sourceTimeSeconds: number;
  readonly chopState: ChopState;
}

/** Main → worker transport sample (future: locked clock + beat grid). */
export interface TransportSampleMessage {
  readonly type: 'transport-sample';
  readonly clockTimeSeconds: number;
  readonly playbackRate: number;
}

export type WorkerInbound = TransportSampleMessage;
export type WorkerOutbound = RemapFrameMessage;

export function isRemapFrameMessage(value: unknown): value is RemapFrameMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== 'remap-frame') return false;
  if (typeof msg.sourceTimeSeconds !== 'number') return false;
  const chop = msg.chopState;
  if (typeof chop !== 'object' || chop === null) return false;
  const c = chop as Record<string, unknown>;
  return (
    typeof c.gridIndex === 'number' &&
    typeof c.loopCount === 'number' &&
    typeof c.stutterActive === 'boolean'
  );
}
