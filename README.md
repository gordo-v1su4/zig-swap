# Frame Lab

A browser playback benchmark for musical cuts, seeks, stutters, and independent speed ramps. Compare strategies using visible video output and recorded frame observations, rather than decoding a single clip as fast as possible.

## Run locally

Install [Bun](https://bun.sh), then run:

```sh
bun install
bun run benchmark
```

Open **http://localhost:5173/benchmark** in a browser with WebGPU and WebCodecs support. The benchmark command does not build or require Zig or Rust. `bun run dev` still starts the older Zig demo separately. The server binds to localhost.

Start in **Results** to inspect the saved reference runs. In **Playback lab**, choose a strategy, deck count and workload, then press Play. Audio starts with playback. Start with one deck before increasing capacity. GPU texture residency can require several GiB even for short clips.

## Four strategies

| Strategy         | What happens during playback                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML video pool  | Prewarmed HTML video elements, controlled seeking and browser-managed decoding. The pool implementation is included here; no Beatmaxxer installation is required. |
| WebCodecs cache  | Mediabunny demuxing with bounded decoded-frame reuse and WebGPU presentation.                                                                                     |
| GPU texture bank | Decode and upload before playback, then select resident GPU textures. This trades startup and memory for inexpensive frame selection.                             |
| libmedia         | Experimental capability probe. Existing probes timed out; there is no scored libmedia result or validated performance claim.                                      |

The benchmark is TypeScript with browser media APIs and WebGPU. A dependency may use WebAssembly internally. It does not compare programming languages.

## Your own media

Choose one to eight MP4 videos and optionally your own audio file in the media controls. Files are read in the browser; they are not uploaded to the server or persisted by the application. Reloading clears the selection. Browser-supported codecs determine which files can decode.

Custom audio uses a manually entered BPM and local energy-rise detection. This is not vocal isolation or MIDI transcription. Included demo audio has separate prepared trigger data. Local libmedia playback is not yet enabled.

Reports can contain media hashes, dimensions, durations, frame rates and timing measurements, but no media bytes. Saved reports are written to `benchmark-results/` by the local server. Check report metadata before sharing it.

## Results and comparison

The Results view loads the existing reference reports and new saved runs. Sort columns, filter engines and workloads, or select two rows to compare their conditions. Export JSON preserves recorded events; CSV exports the visible summary. Import JSON to compare someone else's reports in the current page session. Print report produces a table-oriented document.

Existing runs are exploratory previews, not a completed controlled study. Their workloads, revisions, observation methods and memory budgets differ. In particular, a fully resident GPU bank using several GiB is not an equal-memory comparison with a 256 MiB frame cache. The UI flags mismatched conditions and does not announce a winner.

Cut p95 in the table is the worst per-deck p95, not a pooled percentile. Missing measurements remain blank. Intentional time remapping should be assessed through source-time accuracy and cadence, not interpreted as an ordinary cut-latency score. Browser callbacks and GPU submission estimate presentation; they do not measure screen scanout. Driver and decoder allocations are not fully observable.

For repeatable comparisons, keep media hashes, workload, seed, duration, deck count, memory policy, browser and display conditions the same. Keep the benchmark visible. Separate cold startup from warmed playback and repeat trials before drawing conclusions.

## Scope

This is an experimental playback lab, not a production migration or a universal engine ranking. The methodology view describes the timing model and limitations. Original research reports remain in `benchmark-results/`; implementation planning is in `docs/frame-lab-plan.md`. Verify the licenses and redistribution permissions for dependencies and media before republishing assets.


### Reloading a run

Use **Reload** beside a recorded run to restore its controls in Playback lab, then press Play. This reruns the setup with the current implementation; historical measurements remain unchanged. Included media is available immediately. Local files are never persisted: select the original videos in their original order and the original audio if needed. Playback checks their recorded fingerprints before proceeding. Reset clears the restored-media requirement for a new experiment. Custom audio is analyzed locally when selected.

Subtle **BEST** marks identify the highest on-time rate and lowest cut p95, missed-cut count and preload time among completed, valid, versioned cut runs in the filtered view. They are descriptive extrema, not an overall engine winner: media, deck counts, workloads and memory budgets can differ. Legacy runs, failed probes and ramp runs are excluded from these cut highlights.


## Hosted version and deployment

The Vercel version is a static site built with `bun run scripts/build-site.ts`. No application server or media-upload endpoint is deployed. Reference results and included fixtures are static assets. New measurements are stored in IndexedDB on the visitor's browser and can be exported as JSON; selected video and audio files remain session-only. Browser storage can be cleared by the user or browser, so export important results. The local Bun server continues to save reports to the repository instead.

`vercel.json` declares the build output and benchmark routes. The UI uses TypeScript, HTML and CSS with locally bundled Inter; it is not a React or Svelte app. Playback modules can be integrated behind a Svelte component lifecycle without porting their decoder or GPU logic.
