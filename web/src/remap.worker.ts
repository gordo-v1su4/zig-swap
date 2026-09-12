/// <reference lib="webworker" />

import type { RemapFrameMessage, WorkerInbound } from './protocol';

/**
 * Stub worker — loads Zig WASM core when built (V1S-79).
 * Until then, emits placeholder remap frames so the shell can wire messaging.
 */

let wasmReady = false;

async function initWasm(): Promise<void> {
  // TODO(V1S-79): import WASM from core/zig zig build -Dtarget=wasm32
  wasmReady = false;
}

void initWasm();

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const data = event.data;
  if (data?.type === 'transport-sample') {
    // Future: feed transport into WASM remap engine
  }
};

function postStubFrame(clockSeconds: number): void {
  const message: RemapFrameMessage = {
    type: 'remap-frame',
    sourceTimeSeconds: wasmReady ? clockSeconds : clockSeconds * 0.25,
    chopState: {
      gridIndex: 0,
      loopCount: 1,
      stutterActive: false,
    },
  };
  self.postMessage(message);
}

setInterval(() => {
  postStubFrame(performance.now() / 1000);
}, 1000 / 30);
