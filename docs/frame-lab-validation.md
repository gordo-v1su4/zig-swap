# Frame Lab standalone validation

Verified on the local Windows in-app browser at `http://localhost:65296/benchmark`.

- `bun run benchmark` starts without a Zig build or a Rust toolchain invocation.
- Light page and neutral dark modules rendered; media selection, settings and transport have distinct groups. Volume uses a rectangular thumb.
- Results loaded 13 historical reports. Filtering to libmedia returned its two unscored probes. Importing a saved JSON added a session-only row. Selecting two rows displayed comparison conditions and metrics. JSON export retrieved both filtered full reports successfully.
- A browser-selected MP4 and audio file completed a 30-second GPU-bank preview. Report `1789336311587-ca41ddf2-956c-483d-a409-c8f38b2b11d6.json` records completed=true with no invalidation reasons. Its clip URL is replaced by `local-video-1`; no blob URL appears in the report. No media-upload endpoint exists.
- Reloading cleared selected local media. Pause/resume worked on included media. Switching to Methodology stopped the run and returned transport to Reset/Ready.
- Browser error log was empty during the local-media preview.
- 38 Bun tests passed, including missing-metric aggregation, weighted cut percentages, mismatched comparison conditions and malformed import rejection. Web TypeScript checks passed.
- Print uses `window.print()` and landscape table styling; this review did not send a physical print job.

These are UI and standalone workflow checks, not a new controlled playback-engine study. Historical previews remain labeled as previews; no full comparison suite or new winning engine is claimed.
- Additional browser check: two local clips at 720p and 1080p loaded together and presented distinct timestamps at approximately native cadence. Saved report `1789336582904-99a53c26-cb9d-4890-92ae-a2b50ad4afbb.json` confirms the 30-second two-deck preview completed with no invalidation reasons. This is still a preview, not a formal comparative trial. Standalone hot reload is disabled to avoid editing interrupting a benchmark.
- Numeric p95 sorting and CSV export controls were exercised in the final standalone build.
