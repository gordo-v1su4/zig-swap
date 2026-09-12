# Remap engine (compiled core)

WASM **remap engine** for Stack C: beat grid lookup, chop reducer, seek settlement.

Parallel spike targets:

- `core/zig/` — Zig 0.16+ (candidate)
- `core/rust/` — Rust (comparison)

Behavior oracle: `webgpu-research` lab `timesampler/` package. Shared fixtures land in `core/fixtures/` (V1S-71).

Worker posts `{ sourceTime, chopState }` to main each frame (ADR-0003).
