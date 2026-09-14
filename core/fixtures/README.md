# Timesampler oracle fixtures

> Historical experiment / original demo. Use the [current README](../../README.md) for Frame Lab. These instructions are not required for the hosted benchmark.

Behavioral oracle ported from the parked lab — **do not redesign semantics here**.

## Source

| Lab file | Role |
|----------|------|
| `webgpu-research/lab/browser/deck-pgm/src/timesampler/reducer.ts` | Chop reducer + seek settlement |
| `webgpu-research/lab/browser/deck-pgm/src/timesampler/groove.ts` | Straight / swing / dotted boundaries |
| `webgpu-research/lab/browser/deck-pgm/src/timesampler/schedule.ts` | Preset wiring (reference only) |
| `webgpu-research/lab/browser/deck-pgm/src/timesampler/types.ts` | Shared types |

Zig/Rust spike harnesses (V1S-73, V1S-74) load these JSON files and must match `expected` exactly.

## Files

| Fixture | Covers |
|---------|--------|
| `groove.json` | `grooveSegment`, `nextGrooveBeat` |
| `chop-reducer-initial.json` | `createTimeSamplerState` |
| `chop-reducer-scheduled.json` | Loop iteration + scheduled slice advance |
| `chop-reducer-forced-trigger.json` | Manual trigger forced jump |
| `chop-reducer-pong.json` | PONG bounce sequence |
| `chop-reducer-rnd.json` | RND with fixed `randomSeed` |
| `seek-settlement-discontinuity.json` | Transport rewind → discontinuity reset |

Each case has `input` (transport, params, triggers) and `expected` (`output` + key `nextState` fields).

Reducer cases also include `input.fullPreviousState` (complete reducer state for replay). When null, the harness calls `createTimeSamplerState`; otherwise `reduceTimeSampler`.

## Regenerate

Requires sibling checkout of `webgpu-research`:

```bash
bun run core/fixtures/generate-timesampler-fixtures.mjs
```

Commit the regenerated JSON when lab timesampler semantics change.
