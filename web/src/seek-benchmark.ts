import { RemappedFrameSource } from "./remapped-frame-source";
import { PgmBlitter } from "./pgm-blitter";

const run = document.querySelector<HTMLButtonElement>("#run")!;
const progress = document.querySelector<HTMLElement>("#progress")!;
const results = document.querySelector<HTMLElement>("#results")!;
const canvas = document.querySelector<HTMLCanvasElement>("#output")!;
const media = document.querySelector<HTMLSelectElement>("#media")!;
const cache = document.querySelector<HTMLSelectElement>("#cache")!;
const backend = document.querySelector<HTMLSelectElement>("#backend")!;
const history = document.querySelector<HTMLElement>("#history")!;
const records: Record<string, unknown>[] = [];
const saveReport = (report: Record<string, unknown>) => {
  records.push(report);
  results.textContent = JSON.stringify(report, null, 2);
  history.textContent = records
    .map(
      (r, i) =>
        `${i + 1}. ${r.backend} | cache ${r.cacheEnabled ? "on" : "off"} | p50 ${r.p50Ms ?? "—"} ms | p95 ${r.p95Ms ?? "—"} ms | p99 ${r.p99Ms ?? "—"} ms | wrong ${r.wrongFrames ?? "—"}${r.failure ? " | FAILED" : ""}`,
    )
    .join("\n");
};
document.querySelector<HTMLButtonElement>("#download")!.onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "zig-swap-seek-results.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
backend.onchange = () => {
  cache.disabled = backend.value === "html";
};
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ].toFixed(3),
  );
};

run.onclick = async () => {
  run.disabled = media.disabled = cache.disabled = backend.disabled = true;
  const clips = (
    media.value === "multi"
      ? [
          "benchmark-redline.mp4",
          "benchmark-redline-2.mp4",
          "benchmark-redline-3.mp4",
        ]
      : [media.value]
  ).map((name) => `/fixtures/test-media/video/${name}`);
  const clip = clips[0];
  results.textContent = "";
  const blitter = new PgmBlitter();
  let source: RemappedFrameSource | undefined;
  const sources: RemappedFrameSource[] = [];
  const videos: HTMLVideoElement[] = [];
  let cancelFrame: (() => void) | undefined;
  const timings: number[] = [];
  try {
    await blitter.init(canvas);
    let complete: ((frame: VideoFrame) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    const infos = [];
    for (const clip of clips) {
      if (backend.value === "html") {
        const video = document.createElement("video");
        videos.push(video);
        video.muted = true;
        video.preload = "auto";
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => finish(new Error("Video loading timed out")),
            15000,
          );
          const finish = (error?: Error) => {
            clearTimeout(timer);
            video.onloadeddata = video.onerror = null;
            error ? reject(error) : resolve();
          };
          video.onloadeddata = () => finish();
          video.onerror = () => finish(new Error("Video failed to load"));
          video.src = clip;
          video.load();
        });
        infos.push({
          durationSeconds: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        continue;
      }
      source = new RemappedFrameSource(
        clip,
        (frame) => {
          blitter.present(frame);
          complete?.(frame);
        },
        (error) => fail?.(new Error(error)),
        {
          cacheFrames: Number(cache.value),
          cacheBytes: Math.floor((64 * 1024 * 1024) / clips.length),
        },
      );
      sources.push(source);
      infos.push(await source.init());
    }
    const info = infos[0];
    const trace = Array.from({ length: 4 }, (_, slice) =>
      Array.from({ length: 2 }, () =>
        Array.from(
          { length: 10 },
          (_, frame) => (slice * info.durationSeconds) / 4 + frame / 24 + 0.005,
        ),
      ).flat(),
    )
      .flat()
      .flatMap((target) => clips.map((_, slot) => ({ target, slot })));
    const repeats: number[] = [];
    let wrongFrames = 0;
    for (const [index, { target, slot }] of trace.entries()) {
      progress.textContent = `Seek ${index + 1} / ${trace.length}`;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Seek timed out at ${target}`)),
          5000,
        );
        fail = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
        complete = (frame) => {
          clearTimeout(timeout);
          timings.push(performance.now() - start);
          if (Math.floor(index / clips.length) % 20 >= 10)
            repeats.push(timings[timings.length - 1]);
          const timestamp = frame.timestamp / 1e6;
          if (
            timestamp > target + 0.001 ||
            target >= timestamp + (frame.duration ?? 41667) / 1e6 + 0.001
          )
            wrongFrames++;
          resolve();
        };
        if (backend.value === "html") {
          const video = videos[slot];
          let callback = 0;
          const onFrame: VideoFrameRequestCallback = (_, metadata) => {
            const frame = new VideoFrame(video, {
              timestamp: Math.round(metadata.mediaTime * 1e6),
              duration: 41667,
            });
            try {
              blitter.present(frame);
              complete?.(frame);
            } finally {
              frame.close();
            }
          };
          callback = video.requestVideoFrameCallback(onFrame);
          cancelFrame = () => video.cancelVideoFrameCallback(callback);
          video.currentTime = target;
        } else sources[slot].presentAt(target, true);
      });
      cancelFrame?.();
      cancelFrame = undefined;
      complete = undefined;
    }
    const stats = sources.map((source) => source.getStats());
    sources.forEach((source) => source.stop());
    saveReport({
      backend: backend.value,
      cacheEnabled: backend.value !== "html" && Number(cache.value) > 0,
      fixtures: clips,
      dimensions: `${info.width}x${info.height}`,
      requests: trace.length,
      completed: timings.length,
      globalCacheBudgetBytes:
        backend.value === "html" || Number(cache.value) === 0
          ? 0
          : 64 * 1024 * 1024,
      canvas: { width: canvas.width, height: canvas.height },
      visibilityState: document.visibilityState,
      measurement:
        "request to shared WebGPU submit; HTML waits for requestVideoFrameCallback; excludes scanout, startup, audio and remap worker; serial interleaved seeks, not simultaneous layers or real-time playback",
      p50Ms: percentile(timings, 0.5),
      p95Ms: percentile(timings, 0.95),
      p99Ms: percentile(timings, 0.99),
      over16ms: timings.filter((ms) => ms > 16.667).length,
      wrongFrames,
      repeatOnly: {
        p50Ms: percentile(repeats, 0.5),
        p95Ms: percentile(repeats, 0.95),
        p99Ms: percentile(repeats, 0.99),
      },
      stats,
      afterStop: sources.map((source) => source.getStats()),
      userAgent: navigator.userAgent,
    });
    progress.textContent = "Complete";
  } catch (error) {
    progress.textContent = `Failed: ${error instanceof Error ? error.message : error}`;
    saveReport({
      backend: backend.value,
      fixtures: clips,
      completed: timings.length,
      failure: String(error),
      p50Ms: timings.length ? percentile(timings, 0.5) : null,
      p95Ms: timings.length ? percentile(timings, 0.95) : null,
    });
  } finally {
    cancelFrame?.();
    sources.forEach((source) => source.stop());
    videos.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    blitter.destroy();
    run.disabled = media.disabled = cache.disabled = backend.disabled = false;
    cache.disabled = backend.value === "html";
  }
};
