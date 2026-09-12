import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { isRemapStatusMessage } from './protocol';

const source = new Bun.Transpiler({ loader: 'ts', target: 'browser' })
  .transformSync(await Bun.file(`${import.meta.dir}/remap.worker.ts`).text());

async function runWorker(fetchResponse: () => Promise<Response>, exports?: Record<string, unknown>) {
  const messages: unknown[] = [];
  let tick: (() => void) | undefined;
  let started!: () => void;
  const ticking = new Promise<void>((resolve) => { started = resolve; });
  const scope = {
    self: { postMessage: (message: unknown) => { messages.push(message); } },
    fetch: fetchResponse,
    WebAssembly: { instantiate: async () => ({ instance: { exports } }) },
    performance: { now: () => 1000 },
    console: { warn() {} },
    setInterval(callback: () => void) { tick = callback; started(); return 1; },
    clearInterval() {},
  };
  runInNewContext(source, scope);
  await ticking;
  tick!();
  return messages;
}

test('reports WASM only once loading and initialization have succeeded', async () => {
  let initialized = false;
  const messages = await runWorker(async () => new Response(new Uint8Array()), {
    remap_init() { initialized = true; },
    remap_tick: () => 2,
    remap_active_slice: () => 0,
    remap_loop_iteration: () => 1,
    remap_stutter_active: () => 0,
  });
  expect(initialized).toBe(true);
  expect(messages[0]).toEqual({ type: 'remap-status', mode: 'wasm' });
  expect(messages[1]).toMatchObject({ type: 'remap-frame', sourceTimeSeconds: 2 });
});

test('failed fetch reports fallback before the first stub frame', async () => {
  const messages = await runWorker(async () => new Response(null, { status: 404 }));
  expect(messages[0]).toEqual({ type: 'remap-status', mode: 'fallback' });
  expect(messages[1]).toMatchObject({ type: 'remap-frame', sourceTimeSeconds: 0.25 });
});

test('incomplete WASM exports report fallback instead of failing on the first tick', async () => {
  const messages = await runWorker(async () => new Response(new Uint8Array()), {
    remap_init() {}, remap_tick() {},
  });
  expect(messages[0]).toEqual({ type: 'remap-status', mode: 'fallback' });
  expect(messages[1]).toMatchObject({ type: 'remap-frame', sourceTimeSeconds: 0.25 });
});

test('status guard accepts only explicit initialized or fallback messages', () => {
  expect(isRemapStatusMessage({ type: 'remap-status', mode: 'wasm' })).toBe(true);
  expect(isRemapStatusMessage({ type: 'remap-status', mode: 'fallback' })).toBe(true);
  expect(isRemapStatusMessage({ type: 'configure-remap', mode: 'wasm' })).toBe(false);
  expect(isRemapStatusMessage({ type: 'remap-status', mode: 'loading' })).toBe(false);
});
