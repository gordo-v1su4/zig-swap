# v0 fixture media under prep/fixtures

> Original-demo decision. The current public benchmark follows [ADR-0009](0009-playback-strategy-benchmark.md).

Bundled demo media lives at `prep/fixtures/test-media/` (audio + video). Essentia prep writes locked analysis to `prep/fixtures/test-media/analysis/` — `track.beats.json` matching Studio API `studio-audio-v1` rhythm fields (`bpm`, `beats`, `onsets`, `duration`, `energy`, `structure`).

Not at repo root: prep owns inputs and analysis output; `web/` serves from this tree in dev. Avoid duplicating assets under `web/public/`. Prep scripts port from `webgpu-research/lab/` (not fftron-sync or other repos).

**Status:** accepted
