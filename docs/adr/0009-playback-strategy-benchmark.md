# ADR-0009: Playback strategies are the current benchmark scope

Status: accepted for Frame Lab.

The initial Zig/Rust work explored a compiled remapping core. The current public application measures musical multi-clip playback using TypeScript, browser media APIs and WebGPU. Language choice alone does not answer its latency, synchronization and memory questions.

The Zig demo and Rust spike remain preserved. ADR-0001 through ADR-0006 and ADR-0008 describe the original demo and do not impose that architecture on the benchmark. ADR-0007's maintainer issue-tracker convention is unchanged.

The included HTML pool is an adapted baseline; Beatmaxxer remains a separate Svelte app. Future compiled-code and WebAssembly experiments follow the [evaluation roadmap](../evaluation-roadmap.md), with evidence gates before claims or production integration.
