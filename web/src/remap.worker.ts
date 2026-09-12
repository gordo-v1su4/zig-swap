/// <reference lib="webworker" />

import type { RemapFrameMessage, WorkerInbound } from './protocol';

interface RemapWasmExports {
  remap_init(
    transportSeconds: number,
    beatPosition: number,
    beatInterval: number,
    sourceDuration: number,
    sliceCount: number,
  ): void;
  remap_tick(transportSeconds: number, beatPosition: number, beatInterval: number): number;
  remap_active_slice(): number;
  remap_loop_iteration(): number;
  remap_stutter_active(): number;
}

let wasmReady = false;
let wasmExports: RemapWasmExports | null = null;
let beatIntervalSeconds = 0.5;
let transportSeconds = 0;
let sourceDurationSeconds = 8;
let tickTimer: ReturnType<typeof setInterval> | null = null;

async function initWasm(): Promise<void> {
  try {
    const response = await fetch('/remap.wasm');
    if (!response.ok) {
      throw new Error(`WASM fetch failed (${response.status})`);
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports as unknown as RemapWasmExports;

    if (typeof exports.remap_init !== 'function' || typeof exports.remap_tick !== 'function') {
      throw new Error('remap.wasm missing exports');
    }

    wasmExports = exports;
    wasmExports.remap_init(0, 0, beatIntervalSeconds, sourceDurationSeconds, 4);
    wasmReady = true;
  } catch (error) {
    wasmReady = false;
    wasmExports = null;
    console.warn('[remap.worker] WASM unavailable, using stub', error);
  }
}

function postRemapFrame(clockSeconds: number): void {
  let sourceTimeSeconds = clockSeconds * 0.25;
  let gridIndex = 0;
  let loopCount = 1;
  let stutterActive = false;

  if (wasmReady && wasmExports) {
    transportSeconds = clockSeconds;
    const beatPosition = beatIntervalSeconds > 0 ? clockSeconds / beatIntervalSeconds : 0;
    sourceTimeSeconds = wasmExports.remap_tick(
      transportSeconds,
      beatPosition,
      beatIntervalSeconds,
    );
    gridIndex = wasmExports.remap_active_slice();
    loopCount = wasmExports.remap_loop_iteration();
    stutterActive = wasmExports.remap_stutter_active() === 1;
  }

  const message: RemapFrameMessage = {
    type: 'remap-frame',
    sourceTimeSeconds,
    chopState: {
      gridIndex,
      loopCount,
      stutterActive,
    },
  };
  self.postMessage(message);
}

function startTickLoop(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    postRemapFrame(performance.now() / 1000);
  }, 1000 / 30);
}

void initWasm().finally(startTickLoop);

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const data = event.data;
  if (data?.type === 'transport-sample') {
    transportSeconds = data.clockTimeSeconds;
    if (data.playbackRate > 0 && beatIntervalSeconds > 0) {
      // playback rate reserved for future locked-clock integration
    }
  }

  if (data?.type === 'configure-remap') {
    sourceDurationSeconds = data.sourceDurationSeconds;
    beatIntervalSeconds = data.beatIntervalSeconds;
    if (wasmExports) {
      wasmExports.remap_init(0, 0, beatIntervalSeconds, sourceDurationSeconds, 4);
      wasmReady = true;
    }
  }
};
