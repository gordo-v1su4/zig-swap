# Web shell (Stack C)

Minimal PGM host: bun dev server, remap worker stub, canvas placeholder. WebCodecs decode and WebGPU blit land in later tickets.

## Dev

From repo root:

```bash
bun run dev
```

Opens `http://localhost:5173` with HMR.

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

Main thread uses `sourceTimeSeconds` to seek/decode the WebCodecs pipeline (V1S-78). `chopState` drives PGM accents and debug HUD.

### Main → worker (future)

```typescript
interface TransportSampleMessage {
  type: 'transport-sample';
  clockTimeSeconds: number;
  playbackRate: number;
}
```

Locked beat grid arrives from `prep/fixtures/test-media/analysis/track.beats.json` on the main thread first; worker owns remap reduction once WASM core is wired (V1S-79).

## WASM core

Winning compiled core: `core/zig/` (ADR-0008). Worker stub in `src/remap.worker.ts` — replace placeholder interval with WASM imports when `zig build` wasm32 artifact exists.

## Toolchain

**bun** only — no npm/npx. See `docs/agents/continuity.md`.
