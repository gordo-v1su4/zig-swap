import { isRemapFrameMessage, type RemapFrameMessage } from './protocol';
const canvas = document.querySelector<HTMLCanvasElement>('#pgm');const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const frameEl = document.querySelector<HTMLPreElement>('#frame');

if (!canvas || !statusEl || !frameEl) {
  throw new Error('Missing #pgm, #status, or #frame elements');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D context unavailable (WebGPU blit lands in V1S-78)');
}

const worker = new Worker('/remap.worker.js', { type: 'module' });

let lastFrame: RemapFrameMessage | null = null;

worker.onmessage = (event: MessageEvent) => {
  if (!isRemapFrameMessage(event.data)) return;
  lastFrame = event.data;
  drawPlaceholder();
};

worker.onerror = (error) => {
  statusEl.textContent = `Worker error: ${error.message}`;
};

function drawPlaceholder(): void {
  if (!lastFrame) return;

  const { width, height } = canvas;
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#7dd3fc';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('PGM placeholder — WebGPU blit in V1S-78', 24, 40);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(
    `sourceTime: ${lastFrame.sourceTimeSeconds.toFixed(3)}s`,
    24,
    72,
  );
  ctx.fillText(
    `chop grid=${lastFrame.chopState.gridIndex} loop=${lastFrame.chopState.loopCount} stutter=${lastFrame.chopState.stutterActive}`,
    24,
    94,
  );

  frameEl.textContent = JSON.stringify(lastFrame, null, 2);
  statusEl.textContent = 'Worker stub running (WASM core pending V1S-79)';
}

statusEl.textContent = 'Starting remap worker…';
drawPlaceholder();
