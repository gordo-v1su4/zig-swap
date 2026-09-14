# Remap engine (compiled core)

> Historical experiment / original demo. Use the [current README](../README.md) for Frame Lab. These instructions are not required for the hosted benchmark.

WASM **remap engine** for Stack C: beat grid lookup, chop reducer, seek settlement.

**Implementation:** `core/zig/` (Zig 0.16+, `wasm32-freestanding` target for browser worker).

```bash
bun run test:zig          # native fixture oracle
bun run build:wasm        # web/.dev/remap.wasm
bun run test:wasm-remap   # round-trip vs chop-reducer-initial
```

**Comparison spike (archived):** `core/archive/rust-spike/` — passed same fixtures; not shipped (ADR-0008).

Behavior oracle: `webgpu-research` lab `timesampler/` package. Shared fixtures: `core/fixtures/`.

Worker posts `{ sourceTimeSeconds, chopState }` to main each frame (ADR-0003). See `web/README.md` for the TS message contract.
