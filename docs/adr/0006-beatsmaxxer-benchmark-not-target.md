# Beatsmaxxer benchmarks feel, not architecture

Beatsmaxxer-pro is the best-performing finished app in the family (Stack A: TS + HTMLVideo + WebGPU). Use it to validate that zig-swap v0 *feels* right — chop timing, scrub, PGM smoothness.

zig-swap is Stack C (WebCodecs + WASM remap + WebGPU). It does not port Beatsmaxxer's rack, UI, or hot path. No repo merge, no "second Beatsmaxxer."

**Considered:** Porting Beatsmaxxer incrementally; sharing a monorepo with beatsmaxxer-pro.

**Status:** accepted
