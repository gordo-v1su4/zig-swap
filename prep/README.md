# Prep lane

Offline analysis for v0 fixture media. Runtime reads locked JSON only — never live Essentia during PGM.

Ported from `webgpu-research/lab/lib/essentia-studio.mjs` and `lab/scripts/analyze-track.*`.

## Setup

Copy Essentia keys into `prep/.env` (see `.env.example`), or rely on sibling `webgpu-research/lab/.env` for local dev.

```bash
cp prep/.env.example prep/.env
# ESSENTIA_ANALYSIS_ENABLED=true
# ESSENTIA_API_BASE_URL=https://...
# ESSENTIA_API_KEY=...
```

Requires **ffmpeg** on PATH for the PowerShell wrapper (WAV → MP3 excerpt before upload).

## Analyze fixture track

Full flow (ffmpeg excerpt + Studio API, ~45 s):

```powershell
.\prep\scripts\analyze-track.ps1
```

Or if `fixtures/test-media/audio/track-excerpt.mp3` already exists:

```bash
bun run prep/scripts/analyze-track.mjs
```

**Output:** `prep/fixtures/test-media/analysis/track.beats.json` — locked grid matching Essentia `studio-audio-v1` (`bpm`, `beats`, `onsets`, `duration`, `energy`, `structure`).

**Input:** `prep/fixtures/test-media/audio/Love me tonight (fullsong).wav`

## Verify locked analysis (V1S-77)

When `track.beats.json` is committed or freshly generated:

```bash
bun run prep:verify
```

Re-run `prep:analyze` only when fixture audio changes or you need to regenerate the grid.

## Toolchain

- **bun** / **bunx** for JS scripts — never npm/npx
- **uv** for any future Python prep — never pip

See `docs/agents/continuity.md` and `docs/adr/0005-v0-fixture-media.md`.
