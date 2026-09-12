import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { isRemapStatusMessage } from "./protocol";
const bundle = await Bun.build({
  entrypoints: [`${import.meta.dir}/remap.worker.ts`],
  target: "browser",
  format: "iife",
});
if (!bundle.success) throw new Error("Worker test bundle failed");
const source = await bundle.outputs[0].text();

async function runWorker(available = true, complete = true) {
  const messages: any[] = [];
  let now = 0;
  let tick!: () => void;
  let initCount = 0;
  const exports = {
    remap_init() {
      initCount++;
    },
    remap_tick: (time: number) => time / 2,
    ...(complete
      ? {
          remap_active_slice: () => 0,
          remap_loop_iteration: () => 1,
          remap_stutter_active: () => 0,
        }
      : {}),
  };
  const self = {
    postMessage: (message: unknown) => {
      messages.push(message);
    },
    onmessage: null as any,
  };
  runInNewContext(source, {
    self,
    fetch: async () => new Response(null, { status: available ? 200 : 404 }),
    WebAssembly: { instantiate: async () => ({ instance: { exports } }) },
    performance: { now: () => now },
    console: { warn() {} },
    setInterval(callback: () => void) {
      tick = callback;
      return 1;
    },
  });
  const send = (data: unknown) => self.onmessage({ data });
  expect(messages).toHaveLength(0);
  await send({
    type: "configure-remap",
    sourceDurationSeconds: 8,
    beatIntervalSeconds: 0.5,
    beats: [0, 0.4, 1, 1.5],
    gridDurationSeconds: 2,
  });
  return {
    messages,
    send,
    advance(ms: number) {
      now = ms;
      tick();
    },
    initCount: () => initCount,
    last: () => messages.at(-1),
  };
}

test("reports initialized WASM and starts paused at zero after configuration", async () => {
  const worker = await runWorker();
  expect(worker.messages[0]).toEqual({ type: "remap-status", mode: "wasm" });
  expect(worker.last()).toMatchObject({
    clockTimeSeconds: 0,
    sourceTimeSeconds: 0,
    playing: false,
  });
  worker.advance(5000);
  expect(worker.last().clockTimeSeconds).toBe(0);
});

test("manual scrub overrides source without resetting or pausing the locked clock", async () => {
  const worker = await runWorker();
  await worker.send({ type: "set-playing", playing: true });
  worker.advance(1000);
  expect(worker.last()).toMatchObject({
    clockTimeSeconds: 1,
    beatPosition: 2,
    sourceTimeSeconds: 0.5,
  });
  await worker.send({ type: "scrub", sourceTimeSeconds: 6 });
  worker.advance(1500);
  expect(worker.last()).toMatchObject({
    manual: true,
    sourceTimeSeconds: 6,
    clockTimeSeconds: 1.5,
  });
  await worker.send({ type: "resume-auto" });
  expect(worker.last()).toMatchObject({
    manual: false,
    sourceTimeSeconds: 0.75,
    clockTimeSeconds: 1.5,
  });
  expect(worker.initCount()).toBe(1);
});

test("pause freezes time and resume excludes time spent paused; reset returns to paused zero", async () => {
  const worker = await runWorker();
  await worker.send({ type: "set-playing", playing: true });
  worker.advance(1000);
  await worker.send({ type: "set-playing", playing: false });
  worker.advance(11000);
  await worker.send({ type: "set-playing", playing: true });
  worker.advance(11500);
  expect(worker.last().clockTimeSeconds).toBe(1.5);
  await worker.send({ type: "reset" });
  expect(worker.last()).toMatchObject({
    clockTimeSeconds: 0,
    sourceTimeSeconds: 0,
    playing: false,
    manual: false,
  });
});

for (const [name, available, complete] of [
  ["fetch failure", false, true],
  ["missing exports", true, false],
] as const) {
  test(`${name} reports fallback and still supports manual steering`, async () => {
    const worker = await runWorker(available, complete);
    expect(worker.messages[0]).toEqual({
      type: "remap-status",
      mode: "fallback",
    });
    await worker.send({ type: "scrub", sourceTimeSeconds: 3 });
    expect(worker.last()).toMatchObject({ manual: true, sourceTimeSeconds: 3 });
  });
}
test("status guard rejects unconfirmed loading messages", () => {
  expect(isRemapStatusMessage({ type: "remap-status", mode: "wasm" })).toBe(
    true,
  );
  expect(isRemapStatusMessage({ type: "remap-status", mode: "fallback" })).toBe(
    true,
  );
  expect(isRemapStatusMessage({ type: "remap-status", mode: "loading" })).toBe(
    false,
  );
});
