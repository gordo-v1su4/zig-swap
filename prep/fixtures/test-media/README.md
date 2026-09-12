# v0 fixture media

Bundled clip + audio for the first PGM vertical slice. Prep lane analyzes these; runtime reads locked JSON only (never live analysis during PGM).

## Layout

```
prep/fixtures/test-media/
├── audio/
│   ├── Love me tonight (fullsong).wav      # Essentia analyze input (mix)
│   └── Love me tonight - stem-only-Lead Vocal.wav
├── video/
│   └── fixture-clip.mp4                    # WebCodecs PGM clip (v0)
└── analysis/                               # written by prep/ scripts (gitignore optional)
    ├── track.beats.json                    # locked grid from fullsong
    └── vocal.beats.json                    # optional stem grid
```

## Analysis contract

Prep output matches the Essentia Studio API result shape (`schema_version: "studio-audio-v1"`), same fields the lab and beatsmaxxer use:

- `duration`, `bpm`, `beats[]`, `confidence`, `onsets[]`, `energy`, `structure`

Runtime and the remap spike consume **`track.beats.json`** as the locked beat grid.

**Upstream reference (parked lab):** `C:\Users\Gordo\Documents\Github\webgpu-research\lab\docs\ESSENTIA-API.md` — same Studio API contract the lab used. Port prep from `webgpu-research/lab/lib/essentia-studio.mjs` and `lab/scripts/analyze-track.ps1`.

## Consumers

| Layer | Uses |
|-------|------|
| `prep/` | Runs Essentia once → writes `analysis/*.json` |
| `web/` | Serves video + locked JSON for v0 demo |
| `core/` spike | Test vectors from `timesampler/` semantics, not from live media |
