import { inspectLocalVideos, fingerprint, localAudioGrid } from "./local-media";
import {
  buildSchedule,
  beatAt,
  targetAt,
  strongOnsets,
  patterns,
  type Grid,
  type Pattern,
  type Cut,
} from "./schedule";
import {
  makeAdapter,
  type Backend,
  type Clip,
  type DeckAdapter,
  type Observation,
} from "./adapters";
import { DeckPresenter } from "./presenter";
import { FrameScore, percentile } from "./scoring";
import { estimatedResidentBytes, GpuBankDeck } from "./gpu-bank";
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = (id: string) => el<HTMLSelectElement>(id);
const status = el("status"),
  live = el("live"),
  reports = el("reports");
const play = el<HTMLButtonElement>("play"),
  pause = el<HTMLButtonElement>("pause");
patterns
  .filter((p) => !p.startsWith("speed-"))
  .forEach((p) =>
    select("pattern").add(
      new Option(
        p === "midi-stems"
          ? "Four repeats · stem divisions"
          : p === "cuts-only"
            ? "Deck cuts only · continuous motion"
            : p,
        p,
      ),
    ),
  );
interface Manifest {
  clips: { id: number; variants: Record<string, Clip> }[];
  audio: { url: string; duration: number; sha256: string };
  grid: { url: string; sha256: string; provenance: string };
}
let manifest: Manifest, baseGrid: Grid, buffer: AudioBuffer;
let localClips: Clip[] = [],
  localAudio: AudioBuffer | null = null,
  localAudioHash = "";
let originalGrid: Grid,
  audioEvents: Grid & {
    sourceSha256: string;
    analysis: Record<string, unknown>;
  },
  analysisHash = "";
let midiEvents: Grid & {
    sourceUrl: string;
    sourceSha256: string;
    analysis: Record<string, unknown>;
  },
  midiHash = "",
  bufferUrl = "";
type AudioFeatures = {
  onsets: { time: number; strength: number }[];
  activity: { time: number; strength: number }[];
  loudness: { time: number; strength: number }[];
};
let redlineAnalysis: Grid & {
    sourceSha256: string;
    analysis: Record<string, unknown>;
    features: Record<string, AudioFeatures>;
  },
  redlineHash = "";
let interpolated: { clips: { id: number; variant: Clip }[] } | null = null;
let lastPresentationSlot = -1,
  lastHudTime = -Infinity;
const isRemap = () => select("mode").value === "remap";
const usesRedline = () =>
  !localAudio &&
  (select("trigger").value !== "legacy" ||
    select("pattern").value === "midi-stems");
function modeControls() {
  const remap = isRemap();
  el("speed-readout").hidden = !remap;
  el("speed-control").hidden = !remap;
  el("interpolation-control").hidden = !remap;
  select("pattern").parentElement!.hidden = remap;
  select("groove").parentElement!.hidden = remap;
  el("mode-note").textContent = remap
    ? "Independent speed ramps. Audio continues at normal speed."
    : "Choose what triggers each cut and how the video repeats.";
}
select("mode").onchange = () => {
  modeControls();
  if (isRemap()) {
    select("backend").value = "gpu-bank";
    select("budget").value = "24576";
    select("resolution").value = "720";
    if (localClips.length) select("interpolation").value = "original";
    select("view").value = "switch";
  } else {
    select("budget").value = "12288";
    select("view").value = "switch";
  }
};
modeControls();
let programTimes: number[] = [];
let context: AudioContext,
  gain: GainNode,
  audio: AudioBufferSourceNode | null = null;
let adapters: DeckAdapter[] = [],
  presenter: DeckPresenter | null = null,
  scores: FrameScore[] = [],
  schedules: Cut[][] = [];
let clips: Clip[] = [],
  grid: Grid,
  playing = false,
  busy = false,
  epoch = 0,
  raf = 0,
  offset = 0,
  anchor = 0,
  end = 120;
let runId = 0,
  invalid: string[] = [],
  start = 0,
  readyMs = 0,
  firstMs: (number | null)[] = [],
  frameTimes: number[] = [],
  lastRaf = 0;
let fresh: (Observation | null)[] = [],
  held: ({ pts: number; generation: number } | null)[] = [];
let unique: number[] = [],
  updates: number[] = [],
  lastPts: number[] = [],
  freezeSeconds: number[] = [],
  firstFrameAt: number[] = [];
let badDriftSince: (number | null)[] = [],
  longestBadDrift: number[] = [],
  peakCacheBytes = 0;
let programCuts: {
    beat: number;
    scheduled: number;
    submitted: number;
    deck: number;
    ready: boolean;
    sourceError: number | null;
  }[] = [],
  lastProgramBeat = -1;
let settings: Record<string, unknown> = {},
  records: Record<string, unknown>[] = [];
let finishRun: (() => void) | null = null,
  suiteCancelled = false;
const audioOutputTime = () => {
  const stamp = context.getOutputTimestamp?.();
  return stamp?.contextTime !== undefined && stamp.contextTime > 0
    ? stamp.contextTime
    : Math.max(0, context.currentTime - (context.outputLatency || 0));
};
const clock = () =>
  playing ? offset + Math.max(0, audioOutputTime() - anchor) : offset;
function controls(disabled: boolean) {
  for (const id of [
    "backend",
    "count",
    "resolution",
    "pattern",
    "seed",
    "duration",
    "view",
    "budget",
    "groove",
    "mode",
    "trigger",
    "speed",
    "interpolation",
    "local-videos",
    "local-audio",
    "local-bpm",
    "use-fixtures",
  ])
    el<HTMLInputElement>(id).disabled = disabled;
  select("trigger").disabled = disabled || !!localAudio;
}
async function init() {
  manifest = await (
    await fetch("/fixtures/test-media/benchmark/manifest.json")
  ).json();
  baseGrid = await (await fetch(manifest.grid.url)).json();
  originalGrid = baseGrid;
  const response = await fetch(
    "/fixtures/test-media/benchmark/audio-events.json",
  );
  if (!response.ok)
    throw new Error(
      "Run uv run scripts/analyze-benchmark-audio.py before the musical test",
    );
  const bytes = await response.arrayBuffer();
  audioEvents = JSON.parse(new TextDecoder().decode(bytes));
  analysisHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (audioEvents.sourceSha256 !== manifest.audio.sha256)
    throw new Error("Onset analysis does not match this audio file");
  if (
    !Number.isFinite(baseGrid.duration) ||
    baseGrid.duration <= 0 ||
    Math.abs(baseGrid.duration - manifest.audio.duration) > 0.1
  )
    throw new Error("Audio and grid durations disagree");
  const midiBytes = await (
    await fetch("/fixtures/test-media/benchmark/redline-midi.json")
  ).arrayBuffer();
  midiEvents = JSON.parse(new TextDecoder().decode(midiBytes));
  midiHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", midiBytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const triggerBytes = await (
    await fetch("/fixtures/test-media/benchmark/redline-analysis.json")
  ).arrayBuffer();
  redlineAnalysis = JSON.parse(new TextDecoder().decode(triggerBytes));
  redlineHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", triggerBytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (redlineAnalysis.sourceSha256 !== midiEvents.sourceSha256)
    throw new Error("Redline analysis/audio mismatch");
  const interpolation = await fetch(
    "/fixtures/test-media/benchmark/interpolation-manifest.json",
  );
  if (interpolation.ok) interpolated = await interpolation.json();
  status.textContent =
    "Ready. Play starts audible music and independent musical patterns.";
}
function extendedGrid(seconds: number): Grid {
  const beats: number[] = [];
  const onsets: { time: number; strength: number }[] = [];
  for (
    let cycle = 0;
    cycle * buffer.duration < seconds + buffer.duration;
    cycle++
  ) {
    for (const beat of baseGrid.beats)
      if (beat < buffer.duration) beats.push(beat + cycle * buffer.duration);
    for (const onset of baseGrid.onsets ?? [])
      if (onset.time < buffer.duration)
        onsets.push({ ...onset, time: onset.time + cycle * buffer.duration });
  }
  const stems = baseGrid.stems?.map((stem) => ({
    ...stem,
    notes: Array.from(
      { length: Math.ceil(seconds / buffer.duration) + 1 },
      (_, cycle) =>
        stem.notes
          .filter((n) => n.time < buffer.duration)
          .map((n) => ({ ...n, time: n.time + cycle * buffer.duration })),
    ).flat(),
  }));
  const triggerChannels = baseGrid.triggerChannels?.map((channel) => ({
    ...channel,
    events: Array.from(
      { length: Math.ceil(seconds / buffer.duration) + 1 },
      (_, cycle) =>
        channel.events
          .filter((e) => e.time < buffer.duration)
          .map((e) => ({ ...e, time: e.time + cycle * buffer.duration })),
    ).flat(),
  }));
  return {
    ...baseGrid,
    beats,
    onsets,
    stems,
    triggerChannels,
    duration: seconds,
  };
}
async function audioReady() {
  context ??= new AudioContext();
  await context.resume();
  if (!gain) {
    gain = context.createGain();
    gain.connect(context.destination);
  }
  gain.gain.value = Number(el<HTMLInputElement>("volume").value);
  if (localAudio) {
    buffer = localAudio;
    bufferUrl = "local";
    return;
  }
  const url = usesRedline() ? midiEvents.sourceUrl : manifest.audio.url;
  if (!buffer || bufferUrl !== url) {
    const bytes = await (await fetch(url)).arrayBuffer();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (
      hash !== (usesRedline() ? midiEvents.sourceSha256 : manifest.audio.sha256)
    )
      throw new Error("Audio hash does not match event source");
    buffer = await context.decodeAudioData(bytes);
    bufferUrl = url;
  }
}
function startAudio() {
  audio = context.createBufferSource();
  audio.buffer = buffer;
  audio.loop = true;
  audio.connect(gain);
  anchor = context.currentTime + 0.05;
  audio.start(anchor, offset % buffer.duration);
  playing = true;
}
function stopAudio() {
  if (audio) {
    audio.stop();
    audio.disconnect();
    audio = null;
  }
}
async function cleanup() {
  playing = false;
  stopAudio();
  cancelAnimationFrame(raf);
  epoch++;
  const old = adapters;
  adapters = [];
  await Promise.allSettled(old.map((a) => a.dispose()));
  presenter?.dispose();
  presenter = null;
  fresh.forEach((o) => {
    if (o?.source instanceof VideoFrame) o.source.close();
  });
  fresh = [];
}
async function begin() {
  if (busy) return;
  if (adapters.length && offset > 0) {
    await context.resume();
    epoch++;
    startAudio();
    pause.disabled = false;
    play.disabled = true;
    raf = requestAnimationFrame(tick);
    return;
  }
  busy = true;
  controls(true);
  play.disabled = true;
  pause.disabled = true;
  status.textContent = "Loading and prewarming all decks…";
  const id = ++runId;
  try {
    await cleanup();
    await audioReady();
    if (id !== runId) return;
    const backend = select("backend").value as Backend;
    if (backend === "libmedia" && localClips.length)
      throw new Error(
        "libmedia local-file ingestion is not yet verified; choose a scored adapter or use included media for its capability probe.",
      );
    if (backend === "libmedia") {
      const { probeLibmedia } = await import("./libmedia-probe");
      const result = await probeLibmedia(
        manifest.clips[0].variants[select("resolution").value],
        el<HTMLDivElement>("libmedia-probe"),
      );
      await persist({ kind: "capability-gate", backend, ...result });
      throw new Error(`libmedia: ${result.reason}`);
    }
    if (isRemap() && backend !== "gpu-bank")
      throw new Error("Time remapping currently uses the resident GPU bank");
    lastPresentationSlot = -1;
    lastHudTime = -Infinity;
    end = Number(select("duration").value);
    offset = 0;
    invalid = [];
    frameTimes = [];
    lastRaf = 0;
    if (localClips.length && Number(select("count").value) > localClips.length)
      throw new Error(
        "Choose no more decks than the number of selected videos",
      );
    clips = localClips.length
      ? localClips.slice(0, Number(select("count").value))
      : manifest.clips
          .slice(0, Number(select("count").value))
          .map((c) => c.variants[select("resolution").value]);
    if (isRemap() && select("interpolation").value === "rife4") {
      if (localClips.length)
        throw new Error(
          "Included RIFE variants are unavailable for your local clips. Select Original frames.",
        );
      if (
        select("resolution").value !== "720" ||
        interpolated?.clips.length !== 4
      )
        throw new Error("Prepare all four 720p interpolation clips first");
      clips = clips.map(
        (clip, i) =>
          interpolated!.clips.find((c) => c.id === i + 1)?.variant ?? clip,
      );
    }
    const audioDriven = select("pattern").value.startsWith("audio-"),
      dense = select("pattern").value === "audio-dense";
    const midiDriven = select("pattern").value === "midi-stems";
    baseGrid = midiDriven
      ? midiEvents
      : audioDriven
        ? audioEvents
        : originalGrid;
    if (usesRedline()) {
      const signal = select("trigger").value;
      if (signal === "midi" || signal === "legacy")
        baseGrid = {
          ...midiEvents,
          triggerChannels: midiEvents.stems!.map((stem) => ({
            name: stem.name,
            events: stem.notes.map((n) => ({
              time: n.time,
              strength: n.velocity / 127,
              note: n.note,
            })),
          })),
        };
      else {
        const names =
          signal === "stem-onsets"
            ? ["vocals", "synth", "bass"]
            : [signal.startsWith("vocals") ? "vocals" : "mix"];
        const feature = signal.endsWith("activity")
          ? "activity"
          : signal.endsWith("loudness")
            ? "loudness"
            : "onsets";
        baseGrid = {
          ...redlineAnalysis,
          triggerChannels: names.map((name) => ({
            name,
            events: redlineAnalysis.features[name][feature].filter(
              (e) =>
                feature === "activity" ||
                e.strength >= (feature === "loudness" ? 0.5 : 0.45),
            ),
          })),
        };
      }
    }
    if (localAudio)
      baseGrid = localAudioGrid(
        localAudio,
        Number(el<HTMLInputElement>("local-bpm").value),
      );
    grid = extendedGrid(end);
    const seed = Number(el<HTMLInputElement>("seed").value) >>> 0;
    grid.variedGroove = select("groove").value === "varied";
    programTimes = audioDriven
      ? strongOnsets(grid, dense).map((o) => o.time)
      : grid.beats;
    const action = (
      isRemap() ? select("speed").value : select("pattern").value
    ) as Pattern;
    schedules = buildSchedule(
      grid,
      clips.map((c) => c.duration),
      seed,
      end,
      action,
    );
    if (grid.triggerChannels) {
      const times = grid.triggerChannels
        .flatMap((channel) => channel.events.map((e) => e.time))
        .sort((a, b) => a - b);
      programTimes = [];
      for (const time of times)
        if (
          time >= 0 &&
          (!programTimes.length || time - programTimes.at(-1)! >= 0.08)
        )
          programTimes.push(time);
    }
    if (midiDriven && !grid.triggerChannels) {
      const times = [
        ...new Set(
          schedules.flatMap((events) =>
            events.filter((e) => e.triggerTime === e.at).map((e) => e.at),
          ),
        ),
      ].sort((a, b) => a - b);
      programTimes = times.filter(
        (t, i) => i === 0 || t - times[i - 1] >= 0.08,
      );
    }
    scores = clips.map(
      (c, i) => new FrameScore(schedules[i], c.duration, c.fps),
    );
    fresh = clips.map(() => null);
    held = clips.map(() => null) as never;
    unique = clips.map(() => 0);
    updates = clips.map(() => 0);
    lastPts = clips.map(() => -Infinity);
    freezeSeconds = clips.map(() => 0);
    firstFrameAt = clips.map(() => 0);
    firstMs = clips.map(() => null);
    badDriftSince = clips.map(() => null);
    longestBadDrift = clips.map(() => 0);
    peakCacheBytes = 0;
    programCuts = [];
    lastProgramBeat = -1;
    el("decks").replaceChildren(
      ...clips.map((_, i) => {
        const d = document.createElement("div");
        d.id = `deck-${i}`;
        d.textContent = `Deck ${i + 1} loading`;
        return d;
      }),
    );
    const currentPresenter = new DeckPresenter(el<HTMLCanvasElement>("screen"));
    presenter = currentPresenter;
    await currentPresenter.init(
      clips.length,
      clips[0].width,
      clips[0].height,
      clips,
    );
    if (id !== runId) {
      currentPresenter.dispose();
      return;
    }
    start = performance.now();
    const totalBudget = Number(select("budget").value) * 2 ** 20;
    const residentSizes = clips.map(estimatedResidentBytes),
      residentTotal = residentSizes.reduce((a, b) => a + b, 0);
    if (backend === "gpu-bank" && residentTotal > totalBudget)
      throw new Error("Resident frames exceed selected total memory cap");
    adapters = clips.map((c, i) => {
      const receive = (o: Observation) => {
        if (id !== runId || !playing) return;
        const now = clock(),
          target = targetAt(schedules[i], now, c.duration);
        // Validate at the audio clock before allowing any texture replacement.
        const direct = o.pts - target.source,
          error =
            Math.abs(direct) > c.duration / 2
              ? direct - Math.sign(direct) * c.duration
              : direct;
        if (
          o.generation !== target.event.id ||
          error > 1 / 60 ||
          error < -o.duration - 1 / 60
        ) {
          scores[i].observe(now, o.generation, o.pts, o.duration);
          return;
        }
        const previous = fresh[i];
        if (previous?.source instanceof VideoFrame) previous.source.close();
        // Hold at most one frame per deck until the common presentation boundary.
        // Snapshot HTML video here too, so its pixels and rVFC mediaTime stay paired.
        const owned =
          "createView" in o.source
            ? o.source
            : o.source instanceof VideoFrame
              ? o.source.clone()
              : new VideoFrame(o.source, {
                  timestamp: Math.round(o.pts * 1e6),
                  duration: Math.round(o.duration * 1e6),
                });
        fresh[i] = { ...o, source: owned };
      };
      const budget = Math.floor(
        totalBudget *
          (backend === "gpu-bank"
            ? residentSizes[i] / residentTotal
            : 1 / clips.length),
      );
      return backend === "gpu-bank"
        ? new GpuBankDeck(c, presenter!.device, receive, budget, (n, total) => {
            el(`deck-${i}`).textContent =
              `Deck ${i + 1} · uploading ${n}/${total} GPU frames`;
            status.textContent =
              "Preloading GPU textures. Playback will perform no decoding or frame upload.";
          })
        : makeAdapter(
            backend,
            c,
            receive,
            (e) => {
              invalid.push(e);
              status.textContent = e;
            },
            budget,
          );
    });
    await Promise.all(adapters.map((a) => a.load()));
    if (id !== runId) return;
    readyMs = performance.now() - start;
    settings = {
      schemaVersion: 3,
      backend,
      count: clips.length,
      resolution: localClips.length ? "custom" : select("resolution").value,
      seed,
      pattern: select("pattern").value,
      programView: select("view").value,
      duration: end,
      cacheBudgetBytes: 256 * 1024 * 1024,
      lookaheadMs: 250,
      clips,
      audioHash: manifest.audio.sha256,
      gridHash: manifest.grid.sha256,
      gridProvenance: manifest.grid.provenance,
      cacheCondition: records.some((r) => r.kind === "musical-run")
        ? "warm page; fresh adapters; browser/OS cache uncontrolled"
        : "fresh page; browser/OS cache uncontrolled",
      userAgent: navigator.userAgent,
      crossOriginIsolated,
      canvas: [1920, 1260],
      audioClock:
        "AudioContext.getOutputTimestamp contextTime; fallback currentTime minus outputLatency",
    };
    settings.cacheBudgetBytes = totalBudget;
    settings.residency =
      backend === "gpu-bank"
        ? "entire clips decoded/uploaded before music"
        : "on-demand";
    settings.schemaVersion = 6;
    settings.groove = select("groove").value;
    settings.triggerSource = audioDriven
      ? `audio onsets + ${dense ? "1/4, 1/8, 1/16" : "1/8, 1/16"} stutters · ${grid.variedGroove ? "varied groove" : "straight"}`
      : "seeded musical patterns";
    if (audioDriven) {
      settings.gridHash = analysisHash;
      settings.gridProvenance = audioEvents.analysis;
      settings.onsetThreshold = dense ? 0.45 : 0.65;
      settings.onsetRefractorySeconds = dense ? 0.08 : 0.12;
      settings.minimumOnsetHoldSeconds = 1 / 30;
    }
    if (midiDriven) {
      settings.schemaVersion = 7;
      settings.audioHash = midiEvents.sourceSha256;
      settings.gridHash = midiHash;
      settings.gridProvenance = midiEvents.analysis;
      settings.triggerSource =
        "Redline MIDI · vocals 1/8 · synth 1/16 · bass 1/4 · four-repeat stutters";
      settings.midiPolicy =
        "Note-on starts four plays; chord notes and note-ons inside active burst coalesce; full mix unchanged";
    }
    settings.schemaVersion = 10;
    settings.rampSelection =
      "Per-deck seeded 40% selection of eligible analyzed/MIDI triggers; no overlap; normal playback between ramps";
    settings.rampProfile =
      "speed-ramp: cosine 0.5x to 2x to 0.5x over two beats; speed-smash: quarter speed 12 beats, 4x one beat, normal three beats";
    settings.mode = select("mode").value;
    settings.action = action;
    settings.outputCadenceFps = isRemap() ? 24 : null;
    settings.interpolation = isRemap()
      ? select("interpolation").value
      : "original";
    if (usesRedline()) {
      settings.audioHash = midiEvents.sourceSha256;
      settings.gridHash =
        select("trigger").value === "midi" ? midiHash : redlineHash;
      settings.gridProvenance =
        select("trigger").value === "midi"
          ? midiEvents.analysis
          : redlineAnalysis.analysis;
      settings.triggerSource = select("trigger").selectedOptions[0].textContent;
      settings.signal = select("trigger").value;
      settings.programRefractorySeconds = 0.08;
    }
    if (localAudio) {
      settings.audioHash = localAudioHash;
      settings.gridHash =
        "local-energy-v1-bpm-" + el<HTMLInputElement>("local-bpm").value;
      settings.gridProvenance =
        "Browser-local 20ms RMS energy-rise detection; manual BPM, zero beat offset. Not FFT or stem detection.";
      settings.triggerSource =
        baseGrid.triggerChannels?.[0]?.name === "manual-beat"
          ? "Manual beat grid (no energy onsets found)"
          : "Local audio energy onsets";
      settings.signal = "local-energy";
    }
    settings.mediaSource = localClips.length
      ? "browser-local files"
      : "included fixtures";
    settings.clips = clips.map((c, i) => ({
      ...c,
      url: c.url.startsWith("blob:") ? "local-video-" + (i + 1) : c.url,
    }));
    startAudio();
    status.textContent = `Playing ${clips.length} decks · ${backend}`;
    pause.disabled = false;
    raf = requestAnimationFrame(tick);
  } catch (e) {
    if (id !== runId) return;
    status.textContent = String(e);
    await cleanup();
    controls(false);
    play.disabled = false;
    finishRun?.();
    finishRun = null;
  } finally {
    if (id === runId) busy = false;
  }
}
function tick(now: number) {
  if (!playing) return;
  const time = clock();
  if (lastRaf) {
    const delta = (now - lastRaf) / 1000;
    frameTimes.push(delta);
  }
  lastRaf = now;
  if (time >= end) {
    void finish();
    return;
  }
  if (isRemap()) {
    const slot = Math.floor(time * 24);
    if (slot === lastPresentationSlot) {
      raf = requestAnimationFrame(tick);
      return;
    }
    lastPresentationSlot = slot;
  }
  const updateHud = now - lastHudTime >= 250;
  const beat = beatAt(grid, time);
  let lo = 0,
    hi = programTimes.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (programTimes[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  const beatIndex = lo,
    view = select("view").value,
    pgm =
      view === "fixed"
        ? 0
        : view.startsWith("deck-")
          ? Math.min(clips.length - 1, Number(view.slice(5)) - 1)
          : beatIndex % clips.length;
  if (isRemap()) {
    const visible = targetAt(schedules[pgm], time, clips[pgm].duration);
    el("speed-text").textContent =
      `PGM deck ${pgm + 1} · ${visible.rate.toFixed(2)}× speed · ${visible.event.pattern === "speed-normal" ? "NORMAL" : "RAMP"} · 24 fps output`;
    el("motion-marker").style.left =
      `calc(${((visible.source % 2) / 2) * 100}% - 4px)`;
  }
  for (let i = 0; i < adapters.length; i++) {
    const target = targetAt(schedules[i], time, clips[i].duration);
    const future = schedules[i].filter(
      (e) => e.at > time && e.at <= time + 0.25 && !e.surprise,
    );
    adapters[i].target({ ...target, time, playing: true, epoch }, future);
    adapters[i].poll?.();
    const frame = fresh[i];
    if (frame) {
      if (
        scores[i].observe(time, frame.generation, frame.pts, frame.duration)
      ) {
        presenter!.upload(i, frame.source);
        held[i] = { pts: frame.pts, generation: frame.generation };
        updates[i]++;
        if (frame.pts !== lastPts[i]) {
          unique[i]++;
          lastPts[i] = frame.pts;
        }
        firstFrameAt[i] = time;
        if (firstMs[i] === null) firstMs[i] = performance.now() - start;
      }
      if (frame.source instanceof VideoFrame) frame.source.close();
      fresh[i] = null;
    }
    if (
      time - firstFrameAt[i] > 0.25 &&
      !target.event.pattern.includes("stutter")
    )
      freezeSeconds[i] += frameTimes.at(-1) ?? 0;
    const h = held[i];
    if (h) {
      const direct = h.pts - target.source,
        drift = Math.min(
          Math.abs(direct),
          clips[i].duration - Math.abs(direct),
        );
      const tolerance =
        1 / clips[i].fps + (percentile(frameTimes.slice(-60), 0.5) ?? 1 / 60);
      if (drift > tolerance) {
        badDriftSince[i] ??= time;
        longestBadDrift[i] = Math.max(
          longestBadDrift[i],
          time - badDriftSince[i]!,
        );
      } else badDriftSince[i] = null;
    }
    if (updateHud)
      el(`deck-${i}`).textContent =
        `${i === pgm ? "PGM · " : ""}Deck ${i + 1} · ${target.event.pattern} · ${target.rate.toFixed(2)}×\nTarget ${target.source.toFixed(3)} · shown ${held[i]?.pts.toFixed(3) ?? "—"}\nUnique ${(unique[i] / Math.max(0.1, time)).toFixed(1)} / ${isRemap() ? 24 : clips[i].fps} output fps · ${clips[i].fps} stored fps`;
  }
  presenter!.draw(pgm);
  if (beatIndex > lastProgramBeat) {
    const target = targetAt(schedules[pgm], time, clips[pgm].duration),
      h = held[pgm];
    const direct = h ? h.pts - target.source : null;
    const error =
      direct === null
        ? null
        : Math.min(Math.abs(direct), clips[pgm].duration - Math.abs(direct));
    if (time >= programTimes[beatIndex])
      programCuts.push({
        beat: beatIndex,
        scheduled: programTimes[beatIndex] ?? time,
        submitted: time,
        deck: pgm,
        ready:
          !!h &&
          h.generation === target.event.id &&
          error !== null &&
          error <= 1 / clips[pgm].fps + 1 / 60,
        sourceError: error,
      });
    lastProgramBeat = beatIndex;
  }
  if (updateHud) {
    lastHudTime = now;
    peakCacheBytes = Math.max(
      peakCacheBytes,
      adapters.reduce(
        (sum, a) => sum + Number(a.stats().estimatedCacheBytes ?? 0),
        0,
      ),
    );
    const display =
      percentile(
        frameTimes.filter((t) => t < 0.1),
        0.5,
      ) ?? 1 / 60;
    el("beat").textContent =
      `${time.toFixed(1)} s · ${grid.bpm.toFixed(1)} BPM · beat ${((Math.max(0, beat) % 4) + 1).toFixed(1)} · ${settings.triggerSource}`;
    const bank = settings.backend === "gpu-bank";
    live.textContent =
      `Display loop ${(1 / display).toFixed(1)} Hz · ${bank ? "0 active decoders · resident GPU frames" : `${clips.length} active decoders`} · PGM reuses deck ${pgm + 1}\n` +
      scores
        .map((s, i) => {
          const r = s.summary(time, display);
          if (isRemap())
            return `D${i + 1}: ${(unique[i] / Math.max(0.1, time)).toFixed(1)} unique fps · source error p95 ${r.sourceErrorP95Ms?.toFixed(1) ?? "—"}ms`;
          return `D${i + 1}: on time ${r.onTimePercent.toFixed(1)}% · p95 ${r.p95Ms?.toFixed(1) ?? "—"}ms · missed ${r.missedCuts}`;
        })
        .join("   ");
  }
  raf = requestAnimationFrame(tick);
}
async function persist(report: Record<string, unknown>) {
  records.push(report);
  reports.textContent = JSON.stringify(
    records.map(({ raw, schedule, ...r }) => r),
    null,
    2,
  );
  try {
    const r = await fetch("/benchmark-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!r.ok) throw new Error(await r.text());
    window.dispatchEvent(new Event("benchmark-result-saved"));
  } catch (e) {
    status.textContent = `Result remains downloadable; disk save failed: ${e}`;
  }
}
async function finish() {
  if (!playing) return;
  offset = Math.min(clock(), end);
  playing = false;
  stopAudio();
  cancelAnimationFrame(raf);
  const interval =
    percentile(
      frameTimes.filter((t) => t < 0.1),
      0.5,
    ) ?? 1 / 60;
  const stats = adapters.map((a) => a.stats());
  const result = {
    kind: "musical-run",
    ...settings,
    elapsed: offset,
    completed: offset >= end,
    invalid: [...new Set(invalid)],
    mainLoopStallsOver100ms: frameTimes.filter((t) => t > 0.1).length,
    displayIntervalMs: interval * 1000,
    allDecksReadyMs: readyMs,
    firstCorrectFrameFromLoadMs: firstMs,
    peakApplicationCacheBytes: Math.max(
      peakCacheBytes,
      stats.reduce((sum, s) => sum + Number(s.estimatedCacheBytes ?? 0), 0),
    ),
    programCuts,
    observation:
      "source timestamp validation, then common requestAnimationFrame WebGPU submission; not physical scanout",
    decks: scores.map((s, i) => ({
      ...s.summary(offset, interval),
      uniqueFrameFps: unique[i] / offset,
      presentationUpdates: updates[i],
      unexpectedFreezeSeconds: freezeSeconds[i],
      longestExcessSourceErrorSeconds: longestBadDrift[i],
      stats: stats[i],
    })),
    schedule: schedules,
    raw: scores.map((s) => s.observations),
  };
  await persist(result);
  await cleanup();
  offset = 0;
  controls(false);
  play.disabled = false;
  pause.disabled = true;
  status.textContent =
    "Run saved. Results include missed cuts; no automatic winner declared.";
  finishRun?.();
  finishRun = null;
}
play.onclick = () => void begin();
pause.onclick = () => {
  offset = clock();
  playing = false;
  stopAudio();
  adapters.forEach((a) => a.pause());
  cancelAnimationFrame(raf);
  epoch++;
  lastRaf = 0;
  invalid.push("interactive pause");
  play.disabled = false;
  pause.disabled = true;
  status.textContent = "Paused; Play resumes at the same musical position.";
};
el("reset").onclick = async () => {
  suiteCancelled = true;
  runId++;
  finishRun?.();
  finishRun = null;
  await cleanup();
  offset = 0;
  busy = false;
  controls(false);
  play.disabled = false;
  pause.disabled = true;
  status.textContent = "Reset. Ready.";
};
el<HTMLInputElement>("volume").oninput = () => {
  if (gain) gain.gain.value = Number(el<HTMLInputElement>("volume").value);
};
el("download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "musical-playback-results.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
el("suite").onclick = async () => {
  if (playing || busy) return;
  suiteCancelled = false;
  el<HTMLButtonElement>("suite").disabled = true;
  for (let trial = 0; trial < 3 && !suiteCancelled; trial++)
    for (const count of [1, 4, 6, 8].filter(
      (n) => !localClips.length || n <= localClips.length,
    )) {
      const candidates = ["beatsmaxxer", "mediabunny", "gpu-bank"];
      const order = [...candidates.slice(trial), ...candidates.slice(0, trial)];
      for (const backend of order) {
        if (suiteCancelled) break;
        select("mode").value = "cuts";
        select("trigger").value = "midi";
        modeControls();
        select("backend").value = backend;
        select("count").value = String(count);
        select("duration").value = "120";
        select("pattern").value = "midi-stems";
        el<HTMLInputElement>("seed").value = String(42 + trial);
        await new Promise<void>((resolve) => {
          finishRun = resolve;
          void begin();
        });
      }
    }
  el<HTMLButtonElement>("suite").disabled = false;
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (playing || busy)) {
    suiteCancelled = true;
    invalid.push("hidden tab");
    if (playing) void finish();
  }
});
window.addEventListener("pagehide", () => {
  void cleanup();
});
init().catch((e) => {
  status.textContent = String(e);
  play.disabled = true;
});

function mediaStatus() {
  el("local-media-status").textContent =
    `${localClips.length ? localClips.length + " local videos" : "Included videos"} · ${localAudio ? "local audio" : "Redline audio"}. Media stays in this page session; never uploaded.`;
  el("local-bpm-label").hidden = !localAudio;
  select("trigger").disabled = !!localAudio;
}
el<HTMLInputElement>("local-videos").onchange = async () => {
  if (busy || playing) return;
  const ticket = ++runId;
  busy = true;
  controls(true);
  try {
    status.textContent = "Inspecting local files…";
    play.disabled = true;
    const clips = await inspectLocalVideos(
      Array.from(el<HTMLInputElement>("local-videos").files ?? []),
    );
    if (ticket !== runId) {
      clips.forEach((c) => URL.revokeObjectURL(c.url));
      return;
    }
    localClips.forEach((c) => URL.revokeObjectURL(c.url));
    localClips = clips;
    const value = String(clips.length);
    if (!Array.from(select("count").options).some((o) => o.value === value))
      select("count").add(new Option(value, value));
    select("count").value = value;
    select("interpolation").value = "original";
    mediaStatus();
    status.textContent = "Local videos ready.";
  } catch (e) {
    status.textContent = String(e);
  } finally {
    if (ticket === runId) {
      busy = false;
      controls(false);
      play.disabled = !navigator.gpu;
    }
  }
};
el<HTMLInputElement>("local-audio").onchange = async () => {
  if (busy || playing) return;
  const file = el<HTMLInputElement>("local-audio").files?.[0];
  if (!file) return;
  const ticket = ++runId;
  busy = true;
  controls(true);
  try {
    play.disabled = true;
    status.textContent = "Decoding local audio in browser memory…";
    context ??= new AudioContext();
    const bytes = await file.arrayBuffer(),
      hash = await fingerprint(bytes);
    const decoded = await context.decodeAudioData(bytes);
    if (ticket !== runId) return;
    if (decoded.duration <= 0) throw Error("Audio has no duration");
    localAudio = decoded;
    localAudioHash = hash;
    mediaStatus();
    status.textContent =
      "Local audio ready. Set its BPM for musical subdivisions.";
  } catch (e) {
    status.textContent = String(e);
  } finally {
    if (ticket === runId) {
      busy = false;
      controls(false);
      play.disabled = !navigator.gpu;
    }
  }
};
el("use-fixtures").onclick = () => {
  if (busy || playing) return;
  localClips.forEach((c) => URL.revokeObjectURL(c.url));
  localClips = [];
  localAudio = null;
  localAudioHash = "";
  bufferUrl = "";
  el<HTMLInputElement>("local-videos").value = "";
  el<HTMLInputElement>("local-audio").value = "";
  mediaStatus();
  status.textContent = "Included media restored.";
};
window.addEventListener("benchmark-leave-lab", () => {
  if (playing || busy) el<HTMLButtonElement>("reset").click();
});
window.addEventListener("pagehide", () => {
  localClips.forEach((c) => URL.revokeObjectURL(c.url));
});
if (!navigator.gpu) {
  el("capabilities").textContent =
    "WebGPU unavailable · results remain browsable";
  play.disabled = true;
} else {
  el("capabilities").textContent =
    "WebGPU available · MP4 codec support depends on your browser";
}
