# Frame Lab web application

Run `bun install` and `bun run benchmark` from the repository root. Open `/benchmark` on the printed URL. The hosted static build uses `scripts/build-site.ts` and `vercel.json`.

The active application is TypeScript, HTML and CSS in `src/benchmark/`: adapters, GPU texture bank, presenter, musical scheduler and results UI. It is not React or Svelte and requires no compiled core. See the [current README](../README.md) for media selection and reporting.

## Preserved original demo

The following describes the Zig demo under `bun run dev`, not the active benchmark. Worker types in `src/protocol.ts` are authoritative; historical snippets below are abbreviated.

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
