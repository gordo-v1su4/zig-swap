# Playback strategy: evidence and comparison plan

Audit: 2026-09-12. This is a read-only audit of the existing research and primary specifications, not a new playback benchmark. Beatsmaxxer Pro and `webgpu-research` were not modified or launched.

## Recommendation

Keep Zig Swap as the small experiment. First measure and improve frame availability: bounded reuse of recently decoded chop regions, then scheduled preparation of upcoming regions and clips. Keep Beatsmaxxer as the working reference. Compare native decoding only after the browser experiment has a reproducible result. Switching the remap language now would change a different layer from the suspected seek bottleneck.

This preserves the original mission: Time Shaper is the first reference module for a reusable video platform, not another rack product. The existing [handoff](../../webgpu-research/docs/HANDOFF-ZIG-VIDEO-STACK.md) and [ADR-0006](adr/0006-beatsmaxxer-benchmark-not-target.md) already establish that boundary.

## Updated decision: establish the fastest browser path before a language port

The user's latest scope is web-only. Two eventual experiments remain distinct: compare implementations inside the same Zig Swap browser harness, and evaluate a replaceable playback module under Beatsmaxxer's slot/PGM ownership structure here in the sandbox. Native desktop implementation is deferred. The native survey below is background, not an implementation plan.

Do not implement Rust merely to add a language toggle. First measure whether remap computation or its worker bridge contributes materially to missed presentation deadlines. The current seek benchmark calls the frame source directly: its results do **not** compare Zig with Rust, and relabeling those results would be misleading.

### Other teams have addressed this exact class of problem

| Primary evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| [Grass Valley / Quantel engineers, Browser Hosted Video Editing](https://www.w3.org/2011/webtv/wiki/images/f/fe/Browser_Hosted_Video_Editing_v0.3.pdf), presented at the [February 2021 W3C meeting](https://www.w3.org/2021/02/02-me-minutes.html), slides 4–7 | They describe frame-accurate editing, decoding ahead of a cut into a cache, and reusing frames. Their WASM software-codec implementation ran hot and required constrained proxies. Replacing decompression with WebCodecs reduced heat and enabled better quality; tight hardware-decoder buffer limits still required separate buffering. | This is an engineering experience report, with no comparable p95 seek measurements or current cross-browser ranking. Its 2021 API wish list is historical. |
| [Clipchamp engineering talk, W3C/SMPTE 2021](https://www.w3.org/2021/03/media-production-workshop/talks/soeren-balko-clipchamp-webcodecs.html) | A real editor combined its FFmpeg WASM pipeline with calls out to WebCodecs, specifically describing its encoder integration. C/C++ compiled to WASM and browser codecs can coexist. | It does not show that FFmpeg software decoding is fastest, or document the current Clipchamp preview implementation. |
| [Remotion's public browser conversion benchmark](https://github.com/remotion-dev/webcodecs-benchmark), December 29, 2024 | Three alternating runs on Chrome 131 / M2 MacBook Air: MP4 → VP8/Opus WebM averaged 7.4s through WebCodecs versus 113.3s through FFmpeg.wasm; AV1 WebM → H.264 MP4 averaged 4s versus 20.3s. The author explicitly calls it non-scientific and promotional, with disclosed conditions. | Conversion throughput, not interactive seeking. Codec implementations and output equivalence are not controlled sufficiently to infer a language speedup or a universal ratio. |
| [Mediabunny's published benchmark](https://mediabunny.dev/), June 22, 2025 | On Ryzen 7600X / RTX 4070, its disclosed MOV → resized WebM test reports 804 frames/s, versus 324 for Remotion WebCodecs and 12 for FFmpeg.wasm. The toolkit itself is TypeScript using browser codecs. | Vendor measurements of conversion, not an independent multi-clip playback comparison. The landing page is insufficient to reproduce all settings, and the numbers do not represent application display FPS. |
| [W3C real-time processing experiment, TPAC 2023](https://www.w3.org/2023/09/TPAC/demos/video-processing.html) | A runnable experiment compared combinations of WebCodecs, WebGPU, WASM and JS. Memory transfers made whole-pipeline timing differ substantially from the isolated processing step. | Neither GPU use nor compiled code alone guarantees the lowest end-to-end latency. The illustrative measurements are from that experiment's machine and workflow. |

Chrome's [WebCodecs engineering guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) explains the general reason: applications can use the browser's existing codecs, including hardware acceleration where available, instead of shipping duplicate software codecs in WASM. It recommends worker-based frame handling and explicit frame disposal. This is architecture guidance, not a performance guarantee on our clips.

### Consequence for this project

The strongest evidence supports retaining **browser codecs plus an explicitly managed frame pipeline** as the primary candidate. Zig remains useful for deterministic remapping; it currently does not decode the video pixels. A Rust or C++ port of only that remapper would leave the expensive media path unchanged. No source found in this pass establishes a universal Zig/Rust/C++ winner for rapid browser video cuts.

For our workload, the next useful comparison is the existing HTMLVideo pool approach versus bounded WebCodecs decoding with preparation before known cuts, using identical media and one shared WebGPU presenter. Test 1, 2, 4 and 8 resident clip slots, distinguishing sequential switching from simultaneous visible layers. Use a **global** cache budget and decoder admission limit, so eight slots do not silently multiply the per-clip budget. Compare cold cuts, prepared cuts, repeated loops and unpredictable reverse scrubs. Include original media and separately identified short-GOP proxies: [Mediabunny explains](https://mediabunny.dev/guide/packets-and-samples) why reaching a frame far from its preceding keyframe requires decoding intervening frames.

Keep request-to-correct-frame, deadline misses, stale-frame duration, startup and memory separate from export throughput. Our current callback-to-WebGPU-submit timing is not physical display latency and excludes the remap worker. Add end-to-end timing before attributing performance to a language. If remap/bridge timing proves significant, compare the same trace and ABI in Zig WASM, Rust WASM and a TypeScript control; otherwise prioritize the measured decode, scheduling or copy bottleneck.

The Windows [Remotion issue #7772](https://github.com/remotion-dev/remotion/issues/7772), filed May 29, 2026, is a useful counterexample: its reporter observed a slower WebCodecs path and decoder contention during headless rendering. It is a single-machine report, not our interactive browser configuration, but it reinforces why increasing decoder count and assuming hardware acceleration need direct verification.

## Earlier scope: Zig and Rust, browser WebGPU and native

The main research subjects are the following four combinations. Editor projects later in this report are supporting implementation references, not substitutes for this comparison.

| Combination | Concrete route and verified evidence | Assessment for this project |
| --- | --- | --- |
| **Zig in the browser** | Current Zig Swap: compiled remap core in WASM; TypeScript/Mediabunny calls browser WebCodecs; WebGPU presents the frames. Pixels do not pass through Zig WASM memory in this implementation. | Continue here. It already compiles and drives real footage, and the decoder-cache experiment below isolates a useful improvement without changing languages. Zig is not the video decoder. |
| **Rust in the browser** | Keep the same JS decoder/presenter and replace only the remap WASM for a fair comparison. Alternatively Rust can call WebCodecs via [`web-sys::VideoDecoder`](https://docs.rs/web-sys/latest/web_sys/struct.VideoDecoder.html) (the checked binding requires its unstable-API cfg), and [`wgpu::ExternalImageSource`](https://docs.rs/wgpu/latest/wasm32-unknown-unknown/wgpu/enum.ExternalImageSource.html) accepts browser `VideoFrame` and `ImageBitmap` sources. | Feasible, but uses the same browser media/GPU facilities. Porting browser calls into Rust would change bridge code and ergonomics, not establish a faster decoder. First compare the existing equivalent reducer fixtures and ABI. |
| **Native Zig + WebGPU** | GitHits pinned [`zig-gamedev/zgpu` at `e6d8103b`](https://github.com/zig-gamedev/zgpu/tree/e6d8103b): Dawn-based graphics with Windows D3D12, macOS Metal and Linux Vulkan. [`GraphicsContext.create`](https://github.com/zig-gamedev/zgpu/blob/e6d8103b/src/zgpu.zig#L117) initializes the native Dawn instance. | A viable rendering foundation, not a verified video playback platform. Still requires a decoder, audio clock, seek/reset rules, and matching decoded-surface import/synchronization. This audit did not find a tested drop-in Zig/Dawn hardware-video path equivalent to the native Rust candidate below. Do not infer that none exists. |
| **Native Rust + wgpu** | GitHits pinned [`software-mansion/smelter` at `2e30260b`](https://github.com/software-mansion/smelter/tree/2e30260b). Its [`gpu-video` decoder](https://github.com/software-mansion/smelter/blob/2e30260b/gpu-video/src/backends/vulkan/vulkan_decoder/decoders_h264.rs#L332) produces wgpu textures. Published [`gpu-video 0.4.0` docs](https://docs.rs/gpu-video/0.4.0/gpu_video/) describe Vulkan Video, GPU-resident output, H.264 decode, and Windows/Linux driver requirements. | The strongest concrete native decode-to-texture lead found in this pass. Test device/codec support first. Its simple player takes raw H.264; demux, frame-accurate random seeking, music sync and prewarming still need proof. This is a candidate, not a measured winner. |

`wgpu` is a Rust graphics interface with browser and native backends; native wgpu is not a browser. Neither it nor Zig's graphics bindings is by itself a codec implementation. See the [wgpu project](https://github.com/gfx-rs/wgpu). A video decoder running in WASM software is also a different experiment from calling hardware-backed browser WebCodecs.

Do not assume all old Zig graphics recommendations still describe WebGPU. [Mach's current GPU documentation](https://machengine.org/docs/gpu/) describes its own `sysgpu` abstraction; its [v0.3 explanation](https://devlog.hexops.org/2024/mach-v0.3-released/) explicitly distinguishes that native direction from implementing WebGPU. `zgpu`/Dawn is the clearer WebGPU-specific Zig candidate for this comparison.

The [gpu-video author's Reddit announcement](https://www.reddit.com/r/rust/comments/1tc21kd/gpuvideo_formerly_vkvideo_040_a_new_encoder/) led to the verified Rust library above. Older [Zig/WASM/WebGPU discussion](https://www.reddit.com/r/Zig/comments/1e5q77c/) helps explain binding/toolchain friction, but it is historical experience, not current compatibility or performance evidence.

**Decision:** keep improving Zig browser playback now. If a native trial becomes justified, test native Rust with a real texture-producing decoder alongside native Zig with the same decoder/output contract where practical. Compare languages only while holding decoding/rendering constant; compare complete playback stacks separately. The existing raw-BGRA-pipe native lab is not an adequate substitute for that native experiment.

## Three playback approaches, two language choices

| Candidate | What actually changes | Appropriate question |
| --- | --- | --- |
| A: HTMLVideo + WebGPU | Browser media element owns decode, buffering, seeking and its media timeline; the application steers it | How responsive and stable is the existing behavior? |
| C: WebCodecs + WASM remap + WebGPU | Application selects decoded frames and owns preparation, frame lifetime and presentation scheduling | Can bounded preparation make repeated jumps more predictable? |
| B: Native decoder + native wgpu | Codec integration, clocks, platform GPU sharing, packaging and renderer all change | Does a measured browser limitation justify a separate desktop engine? |
| Zig versus Rust inside C | Only the remap implementation/compiler changes if ABI, input trace, decoder and renderer remain identical | Do correctness, compute time, module size or maintenance favor a language? |

The [stack handoff](../../webgpu-research/docs/HANDOFF-ZIG-VIDEO-STACK.md) explicitly separates A/B/C. A Tauri shell around HTMLVideo is still A. Rust WASM controlling WebCodecs is still C. Neither is automatically native video decoding.

**Zig has not beaten Rust in a latency test.** [ADR-0008](adr/0008-zig-compiled-core.md) records that both passed seven shared remap fixtures at `1e-9` tolerance. Zig won on toolchain/boundary ergonomics and repository intent. The [Rust archive](../core/archive/rust-spike/README.md) is a reducer comparison harness, not a competing playback application. It does not establish a Rust WASM browser latency result.

## What the existing research proves—and does not

The [research map](../../webgpu-research/lab/docs/RESEARCH-MAP.md) and [stack scorecard](../../webgpu-research/webgpu-peers/STACK-SCORECARD.md) already identify useful patterns: scrub caches, preparation before a cut, confirmation that a new frame arrived, and seek settlement that avoids chasing a moving target. They are a good implementation shortlist. The scorecard explicitly says demos were not launched in that pass; its “winner” and “native ceiling” labels are architectural judgments, not measured rankings.

There are local runtime artifacts, but they are insufficient for a fair winner:

- [Browser summary](../../webgpu-research/lab/proof/latest/summary.json): records `60 vid FPS`, `16.7 ms`, locked beats and enabled stutter/sequence controls. It does not measure request-to-correct-frame latency or timestamp accuracy. In [`rVfcLoop.ts:99–137`](../../webgpu-research/lab/browser/deck-pgm/src/rVfcLoop.ts), the rAF fallback contributes to the FPS counter even without a distinct video frame. A smooth redraw counter can therefore conceal stale video.
- That summary is timestamped `23:48:25Z`; the [report](../../webgpu-research/lab/proof/latest/report.json) starts later at `23:57:16Z` and records one unexpected failure, a `page.waitForFunction` timeout. The `latest` directory mixes artifacts from different runs. It cannot be treated as a current passing result.
- [Native log](../../webgpu-research/lab/proof/native-perf.log): includes approximately 47–60 FPS and 31–52 ms p95 frame intervals. [`decode.rs:19–86`](../../webgpu-research/lab/native/deck-pgm-rs/src/decode.rs) launches FFmpeg without hardware acceleration, streams BGRA through a CPU pipe into an eight-item channel, and drains that channel to the newest frame. [`main.rs:449–490`](../../webgpu-research/lab/native/deck-pgm-rs/src/main.rs) uploads those bytes with `queue.write_texture`. This is not a hardware-decoder-to-shared-GPU-texture implementation.
- The native “decode ms” measures a pipe read, and its FPS/p95 measures draw-loop intervals (`main.rs:529–562`), not seek-to-correct-presentation. Dropping intermediate decoded frames is already built into the spike. These counters cannot establish lag-free, frame-correct playback or compare directly with the browser summary.

The [native executive summary](../../webgpu-research/desktop-native/SUMMARY.md) contains broader “best decode” assertions and the [handoff](../../webgpu-research/docs/HANDOFF-ZIG-VIDEO-STACK.md) quotes pixel-copy timings. Those are research leads, not results for this machine and workload. Do not inherit them as acceptance evidence.

## Primary-source checks that affect the design

Seeking cost depends on media structure: independent keyframes can be decoded directly, while dependent frames require earlier data. Reopening a decoder at every repeated jump can therefore redo work. Bounded frame reuse and shorter keyframe intervals are testable responses; neither removes every cold-seek cost. [Mediabunny packet documentation](https://mediabunny.dev/guide/packets-and-samples).

WebCodecs exposes platform codecs; a hardware preference is a hint and can be ignored. The specification explicitly notes that acceleration can increase startup latency even while improving throughput. Retained frames also consume codec resources, so caching requires explicit limits and closing evicted frames. [WebCodecs specification, hardware acceleration and resource model](https://www.w3.org/TR/webcodecs/).

Consequently, “WebCodecs + Zig” does not guarantee hardware decoding, zero copies, or lowest latency. A bounded cache is a hypothesis to measure, not a language-performance claim.

## Fair benchmark contract

Keep a small harness in Zig Swap; do not add experimental infrastructure to Beatsmaxxer. Use identical media hashes, target timestamp traces, canvas sizes, effects disabled, and the same machine/display. Record browser/runtime/compiler versions and media codec/profile, resolution, frame rate and keyframe spacing. Run one GPU application at a time, with sequential repeated runs and alternating candidate order.

| Workload | What it isolates |
| --- | --- |
| Continuous 1× playback | Baseline pacing and unnecessary dropped/repeated frames |
| Repeated short backward loops, eighth/sixteenth-note chops | Reuse of warm frames versus repeated decode work |
| Seeded random seeks and rapid scrub reversal | Cold misses, cancellation, stale output and recovery |
| Two, four, then eight prepared clips | Switch readiness and bounded aggregate memory |
| Original compressed assets versus shorter-GOP/prepared variants | Benefit and cost of media preparation |
| Music-backed timed sequence | Audible clock alignment and drift over several minutes |

Record cold startup separately from warm performance. Report p50/p95/p99 and maximum request-to-correct-frame time, timestamp error, missed presentation deadlines, stale-frame duration, cache hit rate, decoder restarts, and estimated retained frame bytes. Also report CPU/process/GPU memory where available; frame byte estimates are not total GPU residency.

Define correctness using the target frame's actual timestamp interval, not rounded frame numbers. Mark superseded scrub requests as cancelled and count them separately; do not hide slow requests by only reporting successful presentations. Distinguish intentional repeated/omitted source frames in a time-remap pattern from unintended drops. A 30 FPS source on a 60 Hz display cannot yield 60 distinct source frames without interpolation.

Measure stages honestly: request-to-decoded-frame, request-to-GPU-submission, and any available presentation observation are different. A WebGPU submission callback is not proof that pixels have reached the display. Use visible frame IDs/timecode and external high-speed capture for a final input-to-visible-output comparison; keep this separate from lightweight development instrumentation.

For a language comparison, replay the same reducer trace through Zig WASM and Rust WASM with equivalent optimized builds and ABI, validating outputs against the shared fixtures first. Measure the reducer and bridge separately from the end-to-end video path; a TypeScript reducer control is useful too. For a native-stack comparison, use timestamped decoded frames and an actual seek-capable decoder integration. Do not label the existing raw-pipe compositor a native latency ceiling.

## Next decision gates

1. Benchmark current C against bounded frame reuse with caching disabled/enabled under the same trace. Retain the change only if warm-jump results improve without incorrect frames, unbounded memory or unacceptable cold-miss regressions.
2. Add audible clock synchronization and prepared multi-clip switching; these are prerequisites for judging instrument feel. Validate that the beat grid belongs to the audible asset.
3. Compare A and C in the same harness, then run Beatsmaxxer separately as the user-experience reference. An HTMLVideo adapter is a mechanism baseline, not an exact replica of Beatsmaxxer's preparation policies.
4. Revisit Rust only with a measured reason: WASM maintainability/compute needs or a demonstrated need for native codec/GPU integration. Choose packaging around the proven frame-source boundary after that result.

No backend winner, native ceiling, or Zig-over-Rust performance advantage is established by this audit.

## GitHits source follow-up and Reddit practitioner leads

GitHits was used for scoped source discovery and pinned reads. Its MCP connection initially returned `AUTH_REQUIRED` because its local token was unavailable; the installed CLI succeeded using the existing BWS-backed process-local injection. No credentials were printed or installed. A transient `live BWS unavailable` error on MasterSelects was resolved by a later successful retry. That lookup returned interim repository documentation while HEAD indexing continued; its evidence is narrower than the pinned source reads for the other projects.

| Implementation / lead | Verified evidence and practical use |
| --- | --- |
| **FreeCut: separate persistent textures from decoder frames** | GitHits served commit `4d62e8082c5eb387a96275bcbd323d28f6e41a62`. [`GpuTextureCache`, lines 36–168](https://github.com/walterlow/freecut/blob/4d62e8082c5eb387a96275bcbd323d28f6e41a62/src/features/preview/utils/scrubbing-cache.ts#L36) copies into owned textures, evicts with `destroy()`, and prefers eviction opposite the scrub direction. The separate [`VideoFrameCache`, lines 170–267](https://github.com/walterlow/freecut/blob/4d62e8082c5eb387a96275bcbd323d28f6e41a62/src/features/preview/utils/scrubbing-cache.ts#L170) defaults to four entries per item and closes replacements/evictions. Reuse its lifetime separation and direction-aware policy; do not copy its device-memory-derived budget as an actual VRAM measurement. This source confirms a mechanism, not a measured latency benefit for us. |
| **XinChao-Cut: stop repeatedly restarting a seek** | GitHits confirmed [`video-sync.ts`, commit `713de47b`, lines 26–69](https://github.com/yudgunH/XinChao-Cut/blob/713de47bb6626e77fd0b471cd84c97971b70e0a2/src/components/preview/video-sync.ts#L26): divide source drift by playback rate before applying thresholds; lead a playing seek using a measured seek ETA capped at the clip boundary. Useful for the HTMLVideo comparison adapter. Continuous drift correction should not erase intentionally discontinuous chop targets. |
| **FastPlay: native seek correctness and validation** | A [June 2026 author report](https://www.reddit.com/r/vibecoding/comments/1uhhepm/im_building_a_rust_video_player_with_ai_agents/) describes stale audio batches causing A/V desynchronization after backward seeks. GitHits independently found [`src/ffi/ffmpeg.rs`, commit `41752bfb`, lines 2136–2210](https://github.com/CalvinSturm/FastPlay/blob/41752bfb/src/ffi/ffmpeg.rs#L2136): the regression fixture explicitly compares a 14.3s pre-seek batch with a 7s post-seek target, with and without reset. Its [first-party README](https://github.com/CalvinSturm/FastPlay) describes Rust/FFmpeg/D3D11 and playback metrics. Study generation/reset invariants and its benchmark approach if native becomes necessary; these sources do not establish a speed victory over the browser. |
| **MasterSelects: hybrid provider and cache architecture** | A [February 2026 author post](https://www.reddit.com/r/VideoEditors/comments/1qtq5tn/opensource_browserbased_video_editor_with_webgpu/) reports segmented decoding and a frame cache. The successful GitHits retry found first-party [architecture notes, lines 285–295](https://github.com/Sportinger/MasterSelects/blob/main/docs/completed/architecture/Timeline-System-Refactor-Handoff.md#L285) describing WebCodecs, HTMLVideo and native providers resolved through a shared media resolver. Its [refactor notes, lines 46–56](https://github.com/Sportinger/MasterSelects/blob/main/docs/completed/refactor/complete-refactor/p6-render-audio-codecs-proxy-cache.md#L46) call out explicit frame ownership and coalesced decoding. This supports studying interchangeable providers and shared lifecycle rules; it does not verify the Reddit segmented-cache implementation or an all-WebCodecs live path. GitHits served interim docs while HEAD indexed, without a completed pinned source trace. No demo was launched. |

Two further Reddit reports sharpen what to test. An [August 2025 editor developer](https://www.reddit.com/r/webdev/comments/1mjs16r/video_export_taking_forever_due_to_seek/) reports 5–163 ms per `currentTime` seek during frame-by-frame export; a [December 2024 developer](https://www.reddit.com/r/learnjavascript/comments/1hhk27z/) reports excessive repeated seeks during dragging. These are anecdotes from different workloads, with no independently reproduced traces. They support investigating repeated decode work and request coalescing, not adopting their timings as our baseline. The underlying keyframe-dependency mechanism is independently documented by [Mediabunny](https://mediabunny.dev/guide/packets-and-samples).

A [WebGPU discussion](https://www.reddit.com/r/webgpu/comments/1rivz9e/has_anyone_built_a_webbased_video_editor_that/) also flags decoder stalls when too many frames remain held. Its numerical limit is device-specific anecdote. The [WebCodecs resource model](https://www.w3.org/TR/webcodecs/#codec-system-resources) supports the general concern: retained frames can hold scarce codec resources. A byte-limited cache alone does not prove decoder progress. Test a frame-count cap, eviction under pressure, and recovery from a decoder that stops producing frames; consider owned GPU textures if retaining decoded surfaces becomes the bottleneck.
