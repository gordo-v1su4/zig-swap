import { RemappedFrameSource } from "./remapped-frame-source";
import {
  isRemapFrameMessage,
  isRemapStatusMessage,
  type WorkerInbound,
  type RemapFrameMessage,
} from "./protocol";
import { PgmBlitter } from "./pgm-blitter";
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const canvas = element<HTMLCanvasElement>("pgm");
const status = element("status");
const play = element<HTMLButtonElement>("play");
const reset = element<HTMLButtonElement>("reset");
const auto = element<HTMLButtonElement>("auto");
const scrub = element<HTMLInputElement>("scrub");
const placeholder = element("placeholder");
const mode = element("mode");
const clock = element("clock");
const sourceTime = element("source-time");
const beat = element("beat");
const repeat = element("repeat");
const diagnostics = element("frame");
const slices = [...document.querySelectorAll(".slice")];
let worker: Worker | null = null;
let source: RemappedFrameSource | null = null;
let blitter: PgmBlitter | null = null;
let lastFrame: RemapFrameMessage | null = null;
let wasmLabel = "Loading remap…";
let videoLabel = "Loading fixture…";
let ready = false;
let manual = false;
let playing = false;
let stopped = false;
function formatTime(seconds: number) {
  const ms = Math.floor(Math.max(0, seconds) * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
function send(message: WorkerInbound) {
  worker?.postMessage(message);
}
function updateControls() {
  scrub.style.setProperty(
    "--slider-pct",
    `${(Number(scrub.value) / Number(scrub.max)) * 100}%`,
  );
  play.textContent = playing ? "Pause" : "Play";
  mode.textContent = `${playing ? "Playing" : "Paused"} · ${manual ? "Manual" : "Auto"}`;
  auto.disabled = !ready || !manual;
}
function dispose() {
  stopped = true;
  source?.stop();
  worker?.terminate();
  blitter?.destroy();
}
function showStatus() {
  status.textContent = `${videoLabel} · ${wasmLabel}`;
}
play.onclick = () => {
  playing = !playing;
  send({ type: "set-playing", playing });
  updateControls();
};
reset.onclick = () => {
  playing = manual = false;
  send({ type: "reset" });
  updateControls();
};
scrub.oninput = () => {
  manual = true;
  const seconds = Number(scrub.value);
  sourceTime.textContent = formatTime(seconds);
  source?.presentAt(seconds);
  send({ type: "scrub", sourceTimeSeconds: seconds });
  updateControls();
};
auto.onclick = () => {
  manual = false;
  send({ type: "resume-auto" });
  updateControls();
};

async function boot() {
  blitter = new PgmBlitter();
  await blitter.init(canvas);
  if (stopped) return;
  source = new RemappedFrameSource(
    "/fixtures/test-media/video/fixture-clip.mp4",
    (frame) => {
      blitter!.present(frame);
      placeholder.hidden = true;
      sourceTime.textContent = formatTime(frame.timestamp / 1e6);
    },
    (message) => {
      status.textContent = `Video error: ${message}`;
    },
  );
  const [info, response] = await Promise.all([
    source.init(),
    fetch("/fixtures/test-media/analysis/track.beats.json"),
  ]);
  if (stopped) return;
  if (!response.ok) throw new Error("Locked beat grid unavailable");
  const grid = await response.json();
  if (
    grid.locked !== true ||
    !Number.isFinite(grid.bpm) ||
    grid.bpm <= 0 ||
    !Number.isFinite(grid.duration) ||
    grid.duration <= 0 ||
    !Array.isArray(grid.beats) ||
    grid.beats.length < 2 ||
    !grid.beats.every(
      (value: unknown, index: number) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value < grid.duration &&
        (index === 0 || value > grid.beats[index - 1]),
    )
  ) {
    throw new Error("Invalid locked beat grid");
  }
  if (stopped) return;
  videoLabel = `${info.width} × ${info.height}`;
  scrub.max = String(Math.max(0, info.durationSeconds - 0.001));
  element("bpm").textContent = `${grid.bpm.toFixed(1)} BPM`;
  worker = new Worker("/remap.worker.js", { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    if (isRemapStatusMessage(event.data)) {
      wasmLabel =
        event.data.mode === "wasm"
          ? "Zig WASM · locked grid ready"
          : "Stub fallback · WASM unavailable";
      ready = true;
      play.disabled = reset.disabled = scrub.disabled = false;
      showStatus();
      updateControls();
    } else if (isRemapFrameMessage(event.data)) {
      lastFrame = event.data;
      playing = lastFrame.playing;
      // Ignore automatic frames already in flight when the user takes control.
      if (manual === lastFrame.manual)
        source?.presentAt(lastFrame.sourceTimeSeconds);
      clock.textContent = formatTime(lastFrame.clockTimeSeconds);
      beat.textContent = String(Math.floor(lastFrame.beatPosition) + 1);
      repeat.textContent = `${lastFrame.chopState.loopCount} / 2`;
      slices.forEach((slice, index) =>
        slice.classList.toggle(
          "active",
          index === lastFrame!.chopState.gridIndex,
        ),
      );
      if (!manual) scrub.value = String(lastFrame.sourceTimeSeconds);
      diagnostics.textContent = JSON.stringify(lastFrame, null, 2);
      updateControls();
    }
  };
  worker.onerror = (error) => {
    status.textContent = `Worker error: ${error.message}`;
  };
  send({
    type: "configure-remap",
    sourceDurationSeconds: info.durationSeconds,
    beatIntervalSeconds: 60 / grid.bpm,
    beats: grid.beats,
    gridDurationSeconds: grid.duration,
  });
}
void boot().catch((error) => {
  status.textContent = `Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
  placeholder.textContent = "Unable to load fixture";
  dispose();
});
window.addEventListener("pagehide", dispose, { once: true });
if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept();
}
