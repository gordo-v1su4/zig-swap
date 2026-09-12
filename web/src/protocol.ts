/**
 * Worker ↔ main remap frame contract (ADR-0003).
 * WASM core populates these fields each worker tick.
 */

export interface ChopState {
  readonly gridIndex: number;
  readonly loopCount: number;
  readonly stutterActive: boolean;
}

/** Main thread receives one message per worker tick / frame. */
export interface RemapFrameMessage {
  readonly type: "remap-frame";
  readonly sourceTimeSeconds: number;
  readonly clockTimeSeconds: number;
  readonly beatPosition: number;
  readonly playing: boolean;
  readonly manual: boolean;
  readonly chopState: ChopState;
}

/** Main → worker transport sample (future: locked clock + beat grid). */
export interface TransportSampleMessage {
  readonly type: "transport-sample";
  readonly clockTimeSeconds: number;
  readonly playbackRate: number;
}

/** Main → worker WASM init from locked prep analysis. */
export interface ConfigureRemapMessage {
  readonly type: "configure-remap";
  readonly sourceDurationSeconds: number;
  readonly beatIntervalSeconds: number;
  readonly beats: readonly number[];
  readonly gridDurationSeconds: number;
}

export type WorkerInbound =
  | ConfigureRemapMessage
  | { readonly type: "set-playing"; readonly playing: boolean }
  | { readonly type: "scrub"; readonly sourceTimeSeconds: number }
  | { readonly type: "resume-auto" }
  | { readonly type: "reset" };
export interface RemapStatusMessage {
  readonly type: "remap-status";
  readonly mode: "wasm" | "fallback";
}

export type WorkerOutbound = RemapFrameMessage | RemapStatusMessage;

export function isRemapStatusMessage(
  value: unknown,
): value is RemapStatusMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg.type === "remap-status" &&
    (msg.mode === "wasm" || msg.mode === "fallback")
  );
}

export function isRemapFrameMessage(
  value: unknown,
): value is RemapFrameMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== "remap-frame") return false;
  if (typeof msg.sourceTimeSeconds !== "number") return false;
  if (
    typeof msg.clockTimeSeconds !== "number" ||
    typeof msg.beatPosition !== "number"
  )
    return false;
  if (typeof msg.playing !== "boolean" || typeof msg.manual !== "boolean")
    return false;
  const chop = msg.chopState;
  if (typeof chop !== "object" || chop === null) return false;
  const c = chop as Record<string, unknown>;
  return (
    typeof c.gridIndex === "number" &&
    typeof c.loopCount === "number" &&
    typeof c.stutterActive === "boolean"
  );
}
