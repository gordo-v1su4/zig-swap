# Timesampler (Zig spike)

Faithful port of `webgpu-research/lab/browser/deck-pgm/src/timesampler/` for V1S-74.

Shared behavioral oracle fixtures live in `../fixtures/`.

## Run tests

```bash
cd core/zig
zig build test
```

All fixture cases in `groove.json` and the chop-reducer / seek-settlement JSON files must pass.
