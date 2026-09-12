# Timesampler (Zig spike)

Faithful port of `webgpu-research/lab/browser/deck-pgm/src/timesampler/` for V1S-74.

Shared behavioral oracle fixtures live in `../fixtures/`.

## Run tests

From repo root:

```bash
bun run test:zig
```

Or from this directory:

```bash
zig build test
```

All fixture cases in `groove.json` and the chop-reducer / seek-settlement JSON files must pass.
