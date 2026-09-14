# WebCodecs-only on the hot path

> Original-demo decision. The current public benchmark follows [ADR-0009](0009-playback-strategy-benchmark.md).

v0 uses WebCodecs for HW decode and GPU-resident `VideoFrame` on the PGM path. No `HTMLVideoElement` fallback in the hot path.

The parked lab (Stack A) proved behavior with `<video>` + TS, but that stack is interim — dual paths invite shipping the wrong architecture. A dev-only comparison harness is fine; PGM does not fall back to `<video>`.

**Considered:** Dual `<video>` during transition (faster "it works"), WebCodecs primary with debug-only `<video>`.

**Status:** accepted
