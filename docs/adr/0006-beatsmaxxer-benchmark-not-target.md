# Beatsmaxxer benchmarks feel, not architecture

> Original-demo decision. The current public benchmark follows [ADR-0009](0009-playback-strategy-benchmark.md).

Beatsmaxxer-pro is the best-performing finished app in the family (Stack A: TS + HTMLVideo + WebGPU). Use it to validate that zig-swap v0 *feels* right — chop timing, scrub, PGM smoothness.

zig-swap is Stack C (WebCodecs + WASM remap + WebGPU). It does not port Beatsmaxxer's rack, UI, or hot path. No repo merge, no "second Beatsmaxxer."

**Considered:** Porting Beatsmaxxer incrementally; sharing a monorepo with beatsmaxxer-pro.

**Status:** accepted
