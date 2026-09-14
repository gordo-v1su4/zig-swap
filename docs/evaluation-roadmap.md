# Playback and WebAssembly research roadmap

The current route measures browser playback strategies. Compiled-code experiments remain a separate exploratory track that was not pursued as the basis of this comparison. Existing Zig/Rust fixture work establishes correctness for that small core, not a video playback performance winner.

## Future investigations

- Compiling Zig, Rust or C++ for suitable demuxing, processing, analysis or scheduling work, accounting for language boundaries and memory copies.
- WebAssembly 2.0 and subsequent standards/proposals, with exact feature and browser-support checks. Version 2.0 includes SIMD and bulk-memory operations; the version number does not imply a hardware video decoder or direct GPU texture access. Sources: [official Wasm 2.0 announcement](https://webassembly.org/news/2025-03-20-wasm-2.0/) and [current W3C specification](https://www.w3.org/TR/wasm-core/).
- Threads, memory addressing and evolving capabilities, tracked individually rather than grouping every proposal under WASM 2. Check current status and deployment requirements when each experiment begins.
- WebCodecs/WebGPU improvements, maintained playback libraries, and similar browser editors or live-video projects with inspectable implementations and measurements.
- Keyframe spacing, proxies, codecs and offline interpolation as separately labeled preparation experiments.

## Evidence gates

Record primary sources, versions, hardware and browser support at investigation time. A candidate must demonstrate controllable seeking, observable timestamps, its actual decoder path, stale-result rejection and resource disposal before scoring.

Match media hashes, seeds, deck counts and musical workloads. Measure correct synchronized output first, then latency, startup, cadence, capacity, copies and memory. Include unannounced jumps and lookahead. Repeat improvements before recommending integration; a fast isolated compiled function does not prove faster playback.

Repeated two-minute trials and finalist soaks remain evaluation targets, not completed evidence. libmedia remains gated. Preserve raw evidence and distinguish experiments from shipping behavior. This roadmap records project intent, not an automatic monitoring service.
