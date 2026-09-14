# Spike harness before web shell

> Original-demo decision. The current public benchmark follows [ADR-0009](0009-playback-strategy-benchmark.md).

Repo scaffold and a shared Zig/Rust spike harness (same test vectors for chop reducer + seek settlement) land before any `web/` UI. Language choice is gated on correctness parity, then WASM boundary ergonomics, then binary size/latency.

Seek settlement ports `webgpu-research/lab/browser/deck-pgm/src/timesampler/` semantics first; XinChao-Cut drift compensation is added only if WebCodecs scrub exposes drift the parked lab never hit.

**Status:** accepted
