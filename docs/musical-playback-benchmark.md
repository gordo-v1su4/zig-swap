# Musical multi-deck comparison

Run `bun scripts/prepare-playback-benchmark.mjs` and `bun run dev`, then open `/benchmark`.
The preparation script reads Beatmaxxer media without modifying it. Eight 12-second H264 clips have visible deck/frame identifiers; 720p and 1080p versions use GOP48 at the source cadence. Upscaled variants are explicitly labeled in the manifest. This is a controlled media experiment, not original-file throughput.

The audio is the existing 180-second `track-excerpt.mp3`, preferred by `prep/scripts/analyze-track.mjs`. The PowerShell prep wrapper derives it from the full-song WAV. The locked grid and excerpt both report 180 seconds; hashes are recorded for reproducibility. The historical analysis does not contain an input hash, so the association is supported by prep provenance and duration, not cryptographic historical proof. Soaks loop the excerpt and its timestamps together.

## Candidates and provenance

- **Beatmaxxer pool:** copied `VideoPool.ts` from the local Beatmaxxer checkout. The pool retains prepare/prewarm/commit, skip-overlapping-seeks, free-running media, and controlled-generation synchronization. Only store lookup is replaced with direct deck IDs, the timeline type is narrowed to consumed fields, and iterator helpers become `Array.from`. This preserves the 0.5-second drift check and 0.35-second correction threshold; it is deliberately not tuned to pass a stricter benchmark.
- **Mediabunny:** existing RemappedFrameSource with a total 256 MiB estimated owned-image cache budget divided among decks. Decoder samples close promptly; one additional pending VideoFrame per deck is held only until the next common presentation opportunity. No unbounded frame collection.
- **libmedia 1.3.1:** pinned package, real load/play/forward/backward-seek capability probe. Its UMD chunks are served locally; codec resources use the version-pinned upstream distribution. It is excluded from scored comparisons until the presented pixels, PTS, and actual decoder path can be associated reliably. Loading a software module alone does not prove software decoding was selected. LGPL-3.0-or-later requires integration review before production redistribution.
- **Resident GPU bank (added after user clarification):** decode entire clips with Mediabunny during preload, upload each frame once to an owned GPUTexture, dispose all decoder inputs before starting music. Runtime only selects texture bindings. No runtime seek, upload, or silent cache-miss fallback. The memory selector defaults to a 12 GiB cap for this explicit resident experiment; the original 256 MiB option remains available and preflight rejects clips that cannot fit. Eight 720p clips consumed 7.67 GiB in the first run on the local 32 GiB RTX 5090. This is a deliberate memory tradeoff, not a claim that 256 MiB cached decode equals full residency. GPU allocations exclude driver bookkeeping and presentation surfaces.

The common musical controller uses copied Beatmaxxer TimeSampler reducer/random/types and groove functions. One local correction is documented: boundary advancement must call `nextGrooveBeat`, not add a straight interval after the first swung/dotted boundary. Unit tests establish 2:1 swing and dotted eighths. The upstream repository remains unchanged. 32nd/64th patterns are explicit benchmark extensions beyond its 0.25-beat minimum.

## Measurement contract

One AudioContext output clock drives every deck. The event trace is seeded and saved verbatim. Adapters receive the same 250 ms future events, excluding surprise events; current adapters do not speculatively seek their active source. They retain their ordinary stream/pool preparation. PGM samples a selected deck texture again, not another decoder.

Both scored adapters pass through a common rAF WebGPU submission boundary. HTML callbacks supply mediaTime and snapshot the corresponding video; WebCodecs supplies decoded frame PTS. One pending frame per deck is replaced/closed, checked again at presentation, and copied into its owned GPU texture. This adds a common frame upload and does not promise zero-copy. Video surfaces, ImageBitmap allocations, and driver memory are not fully observable.

First correct frame latency includes startup/prewarm. Cut deadlines include misses in the denominator. FPS counts unique source timestamps, separately from presentation updates. Intentional stutters are not unexpected freezes. Rejected candidate frames are not automatically a stale frame displayed. Physical scanout and speaker delay require external instrumentation; these measurements use browser output-clock estimates.

Default gate: 99% on time within one measured display interval, no superseded candidate committed, and no source error exceeding one source frame plus a display interval for more than 100 ms. The 100 ms duration makes “sustained” explicit. Stress patterns are reported separately.

## Running and saving

Preview runs are 30 or 60 seconds. Scored runs are 120 seconds. The suite rotates the three scored candidates over 1/4/6/8 decks for three seeds; it takes about 72 minutes plus preload. Keep the tab visible. Hiding it cancels the suite and invalidates the current run. Pause also invalidates a scored run; Reset cancels it. Results are written to local `benchmark-results/` and can be downloaded from the UI. The standard suite and long soaks have not yet been completed; the saved one-minute previews must not be described as those results.

To isolate the user's switching concern: select `straight` with `Switch decks on beats` for deck-switch-only playback. Select `Hold deck 1` with `mixed` to watch source-time changes without program deck switching. `programCuts` records whether the selected deck was ready at each program switch.

After the standard suite, run 1080p comparisons and 10-minute eight-deck soaks for finalists. If neither passes, use a separately labeled shorter-GOP preparation experiment. Do not pool different media encodings or revisions. `bun scripts/summarize-playback-benchmark.mjs` creates the readable results report.

Switch only for repeated material improvement: at least 25% lower p95 plus one display interval absolute gain, or eight passing decks versus six. Startup/stability regressions disqualify the change. Otherwise retain the established Beatmaxxer path.

## Accepted MIDI / GPU checkpoint (2026-09-12)

The user accepted the eight-deck resident GPU method after watching Redline vocal, synth and bass MIDI drive stutters. Prepare that dataset with `bun scripts/prepare-redline-midi.mjs`. It copies the unchanged Redline mix and parses each MIDI file's tempo map. `midi-stems` maps decks cyclically to vocals (four eighth-note plays), synth (four sixteenth-note plays), and bass (four quarter-note plays). Note-ons start bursts exactly; notes inside an active burst coalesce. Audio continues normally. MIDI export-relative alignment is not a measured acoustic calibration.

The one-minute preview completed with zero missed cuts and worst-deck p95 around 19.2 ms, but only 83.7–89.1% within one measured display interval. This is a useful accepted interaction checkpoint, not proof of the full comparison acceptance criteria or a production migration decision. Code type-checks and 29 web tests pass. Raw runs are in `benchmark-results/`.

Next experiment: separate cuts/timing from continuous speed remapping; pre-render four selected clips with 4x interpolation and compare normal speed, quarter speed, and smooth speed ramps. Keep original media and this checkpoint available. Interpolation render speed, artifacts, memory, and playback timing must be measured separately.
