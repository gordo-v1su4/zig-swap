import { FixtureDecoder } from './fixture-decoder';
import { isRemapFrameMessage, isRemapStatusMessage, type RemapFrameMessage } from './protocol';
import { PgmBlitter } from './pgm-blitter';

const canvas = document.querySelector<HTMLCanvasElement>('#pgm');
const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const frameEl = document.querySelector<HTMLPreElement>('#frame');

if (!canvas || !statusEl || !frameEl) {
  throw new Error('Missing #pgm, #status, or #frame elements');
}

const CLIP_URL = '/fixtures/test-media/video/fixture-clip.mp4';
const BEATS_URL = '/fixtures/test-media/analysis/track.beats.json';

let worker: Worker | null = null;
let blitter: PgmBlitter | null = null;
let decoder: FixtureDecoder | null = null;

let lastFrame: RemapFrameMessage | null = null;
let wasmLabel = 'loading WASM…';
let videoLabel = 'WebCodecs → WebGPU (starting…)';

function updateOverlay(): void {
  if (lastFrame) {
    frameEl.textContent = JSON.stringify(lastFrame, null, 2);
  }
  statusEl.textContent = `PGM: ${videoLabel} | remap: ${wasmLabel}`;
}

function disposeSession(): void {
  decoder?.stop();
  decoder = null;
  worker?.terminate();
  worker = null;
  blitter?.destroy();
  blitter = null;
}

async function loadBeatGrid(): Promise<{ beatIntervalSeconds: number; durationSeconds: number }> {
  const response = await fetch(BEATS_URL);
  if (!response.ok) {
    throw new Error(`Failed to load track.beats.json (${response.status})`);
  }
  const payload = (await response.json()) as { bpm: number; duration: number };
  if (!Number.isFinite(payload.bpm) || payload.bpm <= 0) {
    throw new Error('track.beats.json missing valid bpm');
  }
  return {
    beatIntervalSeconds: 60 / payload.bpm,
    durationSeconds: payload.duration,
  };
}

async function boot(): Promise<void> {
  disposeSession();
  lastFrame = null;
  wasmLabel = 'loading WASM…';
  videoLabel = 'WebCodecs → WebGPU (starting…)';
  statusEl.textContent = 'Initializing WebGPU + WebCodecs…';

  blitter = new PgmBlitter();
  await blitter.init(canvas);

  worker = new Worker('/remap.worker.js', { type: 'module' });
  worker.onmessage = (event: MessageEvent) => {
    if (isRemapStatusMessage(event.data)) {
      wasmLabel = event.data.mode === 'wasm' ? 'Zig WASM' : 'stub fallback (WASM unavailable)';
      updateOverlay();
      return;
    }
    if (!isRemapFrameMessage(event.data)) return;
    lastFrame = event.data;
    updateOverlay();
  };
  worker.onerror = (error) => {
    statusEl.textContent = `Worker error: ${error.message}`;
  };

  const beats = await loadBeatGrid();
  worker.postMessage({
    type: 'configure-remap',
    sourceDurationSeconds: beats.durationSeconds,
    beatIntervalSeconds: beats.beatIntervalSeconds,
  });
  updateOverlay();

  decoder = new FixtureDecoder({
    clipUrl: CLIP_URL,
    onBuffering: (decodedFrames) => {
      videoLabel =
        decodedFrames > 0
          ? `WebCodecs → WebGPU (buffering… ${decodedFrames} frames)`
          : 'WebCodecs → WebGPU (buffering clip…)';
      updateOverlay();
    },
    onReady: (info) => {
      videoLabel = `WebCodecs → WebGPU (${info.width}×${info.height}, ${Math.round(info.fps)}fps)`;
      updateOverlay();
    },
    onFrame: (frame) => {
      try {
        blitter?.present(frame);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        videoLabel = `WebGPU blit error: ${message}`;
        updateOverlay();
      }
    },
    onError: (message) => {
      videoLabel = `Decoder error: ${message}`;
      updateOverlay();
    },
  });

  decoder.start();
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  statusEl.textContent = `Boot failed: ${message}`;
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeSession();
  });
  import.meta.hot.accept();
}
