# Web shell (Stack C)

PGM host: bun dev server, WebCodecs frame source, WebGPU present, Zig WASM remap worker.

## Dev

From repo root:

```bash
bun run dev
```

Opens `http://localhost:5173` with HMR. Serves fixture media from `prep/fixtures/` at `/fixtures/...`.

### Demo (V1S-78 + V1S-79)

1. Use Chrome/Edge with WebCodecs + WebGPU enabled.
2. `bun run dev` — builds `remap.wasm` on startup.
3. Canvas shows fixture clip (`fixture-clip.mp4`) via WebCodecs decode → WebGPU blit.
4. HUD `<pre>` shows live `{ sourceTimeSeconds, chopState }` from the WASM worker.

No `HTMLVideoElement` on the decode/present hot path.

## Worker message contract (ADR-0003)

Types live in `web/src/protocol.ts`.

### Worker → main (each tick / frame)

```typescript
interface RemapFrameMessage {
  type: 'remap-frame';
  sourceTimeSeconds: number;
  chopState: {
    gridIndex: number;
    loopCount: number;
    stutterActive: boolean;
  };
}
```

### Main → worker

```typescript
interface ConfigureRemapMessage {
  type: 'configure-remap';
  sourceDurationSeconds: number;
  beatIntervalSeconds: number;
}

interface TransportSampleMessage {
  type: 'transport-sample';
  clockTimeSeconds: number;
  playbackRate: number;
}
```

Locked beat grid: `prep/fixtures/test-media/analysis/track.beats.json` (verify with `bun run prep:verify`).

## WASM core

Build artifact: `bun run build:wasm` → `web/.dev/remap.wasm` from `core/zig/src/wasm_entry.zig`.

Round-trip test: `bun run test:wasm-remap`.

## Toolchain

**bun** only — no npm/npx. See `docs/agents/continuity.md`.
