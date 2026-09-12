import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";

let trackPromise: Promise<unknown>;
let duration = 180;
let pulls = 0;
let streams = 0;
let returned = 0;
let disposed = 0;
let nextSample: (() => Promise<IteratorResult<FakeSample>>) | null;
const samples: FakeSample[] = [];
const retainedFrames: { closed: boolean }[] = [];

function fakeFrame(timestamp: number, onClose = () => {}) {
  return {
    timestamp,
    codedWidth: 1920,
    codedHeight: 1080,
    displayWidth: 1920,
    displayHeight: 1080,
    close: onClose,
    clone: () => {
      const retained = { closed: false };
      retainedFrames.push(retained);
      return fakeFrame(timestamp, () => {
        retained.closed = true;
      });
    },
  };
}

class FakeSample {
  duration = 1 / 30;
  closed = false;
  frameClosed = false;
  constructor(readonly timestamp: number) {
    samples.push(this);
  }
  close() {
    this.closed = true;
  }
  toVideoFrame() {
    return fakeFrame(this.timestamp * 1e6, () => {
      this.frameClosed = true;
    });
  }
}

mock.module("mediabunny", () => ({
  MP4: {},
  UrlSource: class {},
  Input: class {
    getPrimaryVideoTrack() {
      return trackPromise;
    }
    dispose() {
      disposed++;
    }
  },
  VideoSampleSink: class {
    samples(start = 0) {
      streams++;
      let index = Math.floor(start * 30);
      return {
        async next() {
          pulls++;
          if (nextSample) return nextSample();
          if (index / 30 >= duration) return { done: true, value: undefined };
          return { done: false, value: new FakeSample(index++ / 30) };
        },
        async return() {
          returned++;
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    }
  },
}));

const { FixtureDecoder } = await import("./fixture-decoder");
const { RemappedFrameSource } = await import("./remapped-frame-source");
const originalDecoder = globalThis.VideoDecoder;
const originalFrame = globalThis.VideoFrame;
const originalCanvas = globalThis.OffscreenCanvas;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
let now = 0;
let nextRafId = 0;
const rafs = new Map<number, FrameRequestCallback>();
let clock: ReturnType<typeof spyOn>;
let player: InstanceType<typeof FixtureDecoder>;
let presented: number[];
let errors: string[];

async function settle() {
  for (let i = 0; i < 300; i++) await Promise.resolve();
}

async function advance(ms: number) {
  now = ms;
  const callbacks = [...rafs.values()];
  rafs.clear();
  callbacks.forEach((callback) => callback(now));
  await settle();
}

beforeEach(() => {
  duration = 180;
  pulls = streams = returned = disposed = now = nextRafId = 0;
  nextSample = null;
  samples.length = 0;
  retainedFrames.length = 0;
  presented = [];
  errors = [];
  rafs.clear();
  trackPromise = Promise.resolve({
    computeDuration: async () => duration,
    getDisplayWidth: async () => 1920,
    getDisplayHeight: async () => 1080,
  });
  globalThis.VideoDecoder = class {} as unknown as typeof VideoDecoder;
  globalThis.VideoFrame = class {
    constructor(_image: unknown, options: { timestamp: number }) {
      return fakeFrame(options.timestamp);
    }
  } as unknown as typeof VideoFrame;
  globalThis.OffscreenCanvas = class {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage() {} };
    }
    transferToImageBitmap() {
      const image = {
        closed: false,
        close() {
          this.closed = true;
        },
      };
      retainedFrames.push(image);
      return image;
    }
  } as unknown as typeof OffscreenCanvas;
  globalThis.requestAnimationFrame = (callback) => {
    rafs.set(++nextRafId, callback);
    return nextRafId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    rafs.delete(id);
  };
  clock = spyOn(performance, "now").mockImplementation(() => now);
  player = new FixtureDecoder({
    clipUrl: "/fixture.mp4",
    onFrame: (frame) => {
      presented.push(frame.timestamp);
    },
    onError: (message) => {
      errors.push(message);
    },
  });
});

afterEach(async () => {
  player.stop();
  await settle();
  clock.mockRestore();
  globalThis.VideoDecoder = originalDecoder;
  globalThis.VideoFrame = originalFrame;
  globalThis.OffscreenCanvas = originalCanvas;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
});

test("starts a long clip immediately and pulls only the next presentation sample", async () => {
  player.start();
  await settle();
  expect(presented).toEqual([0]);
  expect(pulls).toBe(2);
  expect(samples[0].closed && samples[0].frameClosed).toBe(true);
  expect(samples.filter((sample) => !sample.closed)).toHaveLength(1);
  await advance(40);
  expect(presented).toHaveLength(2);
  expect(pulls).toBe(3);
  player.stop();
  await settle();
  expect(samples.every((sample) => sample.closed)).toBe(true);
  expect(rafs.size).toBe(0);
  expect(disposed).toBe(1);
  expect(returned).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("closes a sample arriving after stop without presenting or converting it", async () => {
  let deliver!: (result: IteratorResult<FakeSample>) => void;
  nextSample = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  player.start();
  await settle();
  player.stop();
  const lateSample = new FakeSample(0);
  deliver({ done: false, value: lateSample });
  await settle();
  expect(lateSample.closed).toBe(true);
  expect(lateSample.frameClosed).toBe(false);
  expect(presented).toEqual([]);
  expect(errors).toEqual([]);
});

test("stop during metadata loading prevents a decode stream from starting", async () => {
  let deliver!: (track: unknown) => void;
  trackPromise = new Promise((resolve) => {
    deliver = resolve;
  });
  player.start();
  player.stop();
  deliver({});
  await settle();
  expect(streams).toBe(0);
  expect(disposed).toBe(1);
  expect(errors).toEqual([]);
});

test("reopens decoding at EOF after holding the last frame for its duration", async () => {
  duration = 1 / 30;
  player.start();
  await settle();
  expect(streams).toBe(1);
  await advance(34);
  expect(streams).toBe(2);
  expect(presented).toEqual([0, 0]);
  expect(samples.every((sample) => sample.closed && sample.frameClosed)).toBe(
    true,
  );
});

test("drops expired samples after a stall and continues playback", async () => {
  player.start();
  await settle();
  await advance(1010);
  expect(presented).toHaveLength(2);
  expect(presented[1]).toBe(1e6);
  expect(samples.filter((sample) => !sample.closed)).toHaveLength(1);
});

test("decode errors release the input and iterator", async () => {
  nextSample = async () => {
    throw new Error("decode failed");
  };
  player.start();
  await settle();
  expect(errors).toEqual(["decode failed"]);
  expect(disposed).toBe(1);
  expect(returned).toBeGreaterThan(0);
});

test("remapped output seeks forward and backward without retaining presented frames", async () => {
  const source = new RemappedFrameSource(
    "/fixture.mp4",
    (frame) => presented.push(frame.timestamp),
    (error) => errors.push(error),
  );
  await source.init();
  source.presentAt(60);
  await settle();
  source.presentAt(60.01);
  await settle();
  expect(presented).toEqual([60e6]);
  source.presentAt(120);
  await settle();
  source.presentAt(10);
  await settle();
  expect(presented).toEqual([60e6, 120e6, 10e6]);
  expect(samples.every((sample) => sample.closed && sample.frameClosed)).toBe(
    true,
  );
  expect(streams).toBe(3);
  source.stop();
  expect(errors).toEqual([]);
});

test("a newer scrub request replaces an in-flight request for another source region", async () => {
  let deliver!: (result: IteratorResult<FakeSample>) => void;
  nextSample = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  const source = new RemappedFrameSource(
    "/fixture.mp4",
    (frame) => presented.push(frame.timestamp),
    (error) => errors.push(error),
  );
  await source.init();
  source.presentAt(0);
  await settle();
  source.presentAt(60);
  nextSample = null;
  const stale = new FakeSample(0);
  deliver({ done: false, value: stale });
  await settle();
  expect(stale.closed).toBe(true);
  expect(presented).toEqual([60e6]);
  source.stop();
});

test("remapped output closes frames arriving after disposal", async () => {
  let deliver!: (result: IteratorResult<FakeSample>) => void;
  nextSample = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  const source = new RemappedFrameSource(
    "/fixture.mp4",
    (frame) => presented.push(frame.timestamp),
    (error) => errors.push(error),
  );
  await source.init();
  source.presentAt(0);
  await settle();
  source.stop();
  const late = new FakeSample(0);
  deliver({ done: false, value: late });
  await settle();
  expect(late.closed).toBe(true);
  expect(presented).toEqual([]);
  expect(errors).toEqual([]);
});

test("repeated chops reuse bounded frames and disposal releases the cache", async () => {
  const source = new RemappedFrameSource(
    "/fixture.mp4",
    (frame) => presented.push(frame.timestamp),
    (error) => errors.push(error),
    { cacheFrames: 2, cacheBytes: 32 * 1024 * 1024 },
  );
  await source.init();
  for (const time of [0, 1 / 30, 0, 1 / 30]) {
    source.presentAt(time);
    await settle();
  }
  expect(presented).toEqual([0, 1e6 / 30, 0, 33333]);
  expect(streams).toBe(1);
  expect(pulls).toBe(2);
  source.presentAt(2 / 30);
  await settle();
  expect(retainedFrames.filter((frame) => !frame.closed)).toHaveLength(2);
  source.stop();
  expect(retainedFrames.every((frame) => frame.closed)).toBe(true);
  expect(errors).toEqual([]);
});

test("cache obeys the byte budget and can be disabled", async () => {
  for (const cacheBytes of [1920 * 1080 * 4, 0]) {
    const source = new RemappedFrameSource(
      "/fixture.mp4",
      () => {},
      (error) => errors.push(error),
      { cacheBytes },
    );
    await source.init();
    for (const time of [0, 1, 2]) {
      source.presentAt(time);
      await settle();
      expect(source.getStats().estimatedCacheBytes).toBeLessThanOrEqual(
        cacheBytes,
      );
      expect(source.getStats().cachedFrames).toBe(cacheBytes ? 1 : 0);
    }
    source.stop();
  }
  expect(retainedFrames.every((frame) => frame.closed)).toBe(true);
});

test("a cached scrub supersedes a pending decode without a stale presentation", async () => {
  const source = new RemappedFrameSource(
    "/fixture.mp4",
    (frame) => presented.push(frame.timestamp),
    (error) => errors.push(error),
  );
  await source.init();
  for (const time of [0, 1]) {
    source.presentAt(time);
    await settle();
  }
  let deliver!: (result: IteratorResult<FakeSample>) => void;
  nextSample = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });
  source.presentAt(60);
  await settle();
  source.presentAt(0);
  expect(presented).toEqual([0, 1e6, 0]);
  const late = new FakeSample(60);
  deliver({ done: false, value: late });
  await settle();
  expect(presented).toEqual([0, 1e6, 0]);
  expect(late.closed).toBe(true);
  source.stop();
  expect(retainedFrames.every((frame) => frame.closed)).toBe(true);
});

test("returning to a clip presents its held frame again on a shared output", async () => {
  for (const cacheFrames of [0, 2]) {
    const source = new RemappedFrameSource(
      "/fixture.mp4",
      (frame) => presented.push(frame.timestamp),
      (error) => errors.push(error),
      { cacheFrames },
    );
    presented = [];
    await source.init();
    source.presentAt(0.1);
    await settle();
    // Another clip has since drawn into the canvas; the former frame must redraw.
    source.presentAt(0.1, true);
    await settle();
    expect(presented).toEqual([100000, 100000]);
    source.stop();
  }
});
