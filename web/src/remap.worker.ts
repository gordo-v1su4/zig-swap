/// <reference lib="webworker" />
import { LockedClock, beatAt } from "./locked-clock";
import type {
  ConfigureRemapMessage,
  RemapFrameMessage,
  RemapStatusMessage,
  WorkerInbound,
} from "./protocol";
interface RemapWasmExports {
  remap_init(
    time: number,
    beat: number,
    interval: number,
    duration: number,
    slices: number,
  ): void;
  remap_tick(time: number, beat: number, interval: number): number;
  remap_active_slice(): number;
  remap_loop_iteration(): number;
  remap_stutter_active(): number;
}
const clock = new LockedClock();
let config: ConfigureRemapMessage | null = null;
let wasm: RemapWasmExports | null = null;
let manualTime: number | null = null;
let initialized = false;

async function loadWasm(): Promise<void> {
  try {
    const response = await fetch("/remap.wasm");
    if (!response.ok) throw new Error(`WASM fetch failed (${response.status})`);
    const { instance } = await WebAssembly.instantiate(
      await response.arrayBuffer(),
      {},
    );
    const exports = instance.exports as unknown as RemapWasmExports;
    for (const name of [
      "remap_init",
      "remap_tick",
      "remap_active_slice",
      "remap_loop_iteration",
      "remap_stutter_active",
    ] as const) {
      if (typeof exports[name] !== "function")
        throw new Error(`Missing WASM export: ${name}`);
    }
    wasm = exports;
  } catch (error) {
    console.warn("[remap.worker] WASM unavailable, using stub", error);
  }
}
const loaded = loadWasm();

function initialize(): void {
  if (!config) return;
  clock.reset(performance.now());
  manualTime = null;
  try {
    const beat = beatAt(0, config.beats, config.gridDurationSeconds);
    wasm?.remap_init(
      0,
      beat.position,
      beat.interval,
      config.sourceDurationSeconds,
      4,
    );
  } catch (error) {
    wasm = null;
    console.warn(
      "[remap.worker] WASM initialization failed, using stub",
      error,
    );
  }
  initialized = true;
  self.postMessage({
    type: "remap-status",
    mode: wasm ? "wasm" : "fallback",
  } satisfies RemapStatusMessage);
  postFrame();
}

function postFrame(): void {
  if (!config || !initialized) return;
  const time = clock.time(performance.now());
  const beat = beatAt(time, config.beats, config.gridDurationSeconds);
  // The core keeps advancing during manual override; returning to Auto never resets it.
  const automaticTime =
    wasm?.remap_tick(time, beat.position, beat.interval) ??
    time % config.sourceDurationSeconds;
  const loopCount = wasm?.remap_loop_iteration() ?? 1;
  self.postMessage({
    type: "remap-frame",
    sourceTimeSeconds: manualTime ?? automaticTime,
    clockTimeSeconds: time,
    beatPosition: beat.position,
    playing: clock.playing,
    manual: manualTime !== null,
    chopState: {
      gridIndex: wasm?.remap_active_slice() ?? 0,
      loopCount,
      stutterActive: loopCount > 1,
    },
  } satisfies RemapFrameMessage);
}

self.onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const data = event.data;
  if (data.type === "configure-remap") {
    config = data;
    initialized = false;
    await loaded;
    initialize();
    return;
  }
  if (!initialized || !config) return;
  switch (data.type) {
    case "set-playing":
      clock.setPlaying(data.playing, performance.now());
      break;
    case "scrub":
      if (Number.isFinite(data.sourceTimeSeconds)) {
        manualTime = Math.max(
          0,
          Math.min(
            config.sourceDurationSeconds - 0.001,
            data.sourceTimeSeconds,
          ),
        );
      }
      break;
    case "resume-auto":
      manualTime = null;
      break;
    case "reset":
      initialize();
      return;
  }
  postFrame();
};
setInterval(() => {
  if (clock.playing) postFrame();
}, 1000 / 30);
