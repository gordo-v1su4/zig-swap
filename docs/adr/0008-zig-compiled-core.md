# Zig wins compiled-core spike (Rust archived)

Both Zig and Rust spike harnesses passed all 7 shared timesampler JSON fixtures (`core/fixtures/`) with 1e-9 float tolerance. Correctness parity verified locally via `bun run test:zig` and `cargo test --manifest-path core/archive/rust-spike/Cargo.toml`.

**Decision:** keep **Zig 0.16+** under `core/zig/` as the compiled remap engine. Archive the Rust spike at `core/archive/rust-spike/` (reference only, not built in CI).

**Rationale (post-parity tie-breakers per ADR-0004):**

1. **WASM target** — Stack C plan is `wasm32-freestanding` in a dedicated worker (HANDOFF, `docs/agents/continuity.md`). Zig is the documented v0 toolchain for `core/`.
2. **Repo intent** — greenfield Stack C was scoped as a Zig WASM core + WebCodecs/WebGPU shell from the start; Rust was a controlled comparison, not the default.
3. **Ergonomics** — single `zig build` for native tests + future WASM artifact; no separate bindgen layer for the worker boundary at v0.

**Considered:** Rust for ecosystem/maturity; keeping both spikes until PGM vertical slice.

**Status:** accepted
