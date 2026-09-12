# V1S-80: Time Shaper vertical slice

Run `bun run dev` and open the URL printed by the server. The fixture starts paused.

1. Click **Play**. The worker advances the locked clock and interpolates the actual
   markers in `track.beats.json`. The Zig core repeats each beat twice and advances
   through four source slices. Watch the video, active slice, and repeat readouts.
2. Drag **Source position**. **Manual** holds the chosen video position while the
   locked clock and automatic remap continue advancing.
3. Click **Return to Auto**. The displayed source returns to the current remap
   position without resetting the clock or the core.
4. Click **Pause**. The clock and output stop. **Play** resumes from the same clock
   position, excluding the time spent paused.
5. Click **Reset**. Return to paused Auto at clock zero. Scrubbing also works while paused.

The rectangular scrub handle follows the dark Beatsmaxxer Pro styling, enlarged
to 8 by 20 pixels for this layout. It supports arrow keys, Home, and End.

The frame source keeps one serial decode stream with bounded Mediabunny look-ahead
and one pending timestamp request. A bounded owned-image cache reuses recent frames
for repeated chops; misses reopen decoding when needed. Superseded seek results
are discarded, and decoder samples and presentation VideoFrames close promptly.
The cache holds at most 48 images and 64 MiB of estimated RGBA data per source;
decoder/driver memory is additional. Diagnostics links to `/benchmark` to compare
the cache on identical footage. See [measured results and limits](seek-benchmark.md).

Video duration and locked-analysis duration are separate: the fixture clip loops
through its own source slices while the clock follows the full locked beat grid.
This slice does not play audio or perform runtime analysis.

## Verification

- `bunx tsc -p web/tsconfig.json`
- `bun test web/src/fixture-decoder.test.ts web/src/remap.worker.test.ts`
- `bun run test:wasm-remap`
- `bun run prep:verify`
- In-app Browser: paused startup, visible Auto chops, manual frame hold with
  advancing clock, Return to Auto, Pause, and rectangular scrub handle.

The worker reports its actual WASM/fallback state. A failed current WASM build
returns HTTP 404 for `/remap.wasm`, even when an earlier artifact remains on disk.
Fallback supports transport and scrubbing but does not provide Zig grid chops.

V1S-80 code reached main at `e7ef02f`. Linear's demo-comment requirement and the
V1S-81 operator acceptance remain separate; these measurements do not close v0.
