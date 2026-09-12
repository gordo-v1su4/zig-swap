# Handoff — Zig / performant video stack (new repo seed)

**Date:** 2026-09-11  
**Status:** `webgpu-research` lab is **parked** here. Next work starts in a **new repo** from this doc + linked research artifacts.

---

## Why park, why restart

The browser lab (`lab/browser/deck-pgm/`) proved **behavior** (Time Shaper as audio-parity example). It runs on an **interim stack** (TS clock + `HTMLVideoElement` + WebGPU). That is fine for demos, not the long-term **performant web video platform** you want.

Restart goal: a **cleaner, directed codebase** built around:

- **WebGPU** for pixels (compositor, FX, AI compute on same device)
- **WebCodecs** for HW decode (`VideoFrame` GPU-resident path)
- **Compiled core** (Zig-first candidate) for clock, remap, chop, seek settlement — not TS on the hot path
- **Prep lane** offline (Essentia → locked JSON, RIFE/slow-mo) — never analyze during PGM

---

## North star (reframed)

**Time Shaper is the capability bar, not the product scope.**

Audio VST world does effortlessly:

- envelope → modulate parameters  
- trigger on beat/onset/MIDI  
- chop/stutter on a musical grid  
- locked clock — everything quantizes  

**Video equivalent:** modulate **playback position and frame selection in time** (and later space/composite), with the same effortlessness.

Future consumption/creation (AI steering, real-time story, spatial/3D, create+remix blur) all need the **same column**:

```text
Locked clock (beats, onsets, MIDI, AI events)
        ↓
Remap engine — source time, rate, loops, chops, seeks
        ↓
Frame source — WebCodecs / live / gen / 3D render target
        ↓
WebGPU — composite, FX, AI passes
        ↓
Present — PGM, stream, world texture, export
```

---

## Stack map (what to build)

| Stack | Decode | Clock / remap | GPU | When |
|-------|--------|---------------|-----|------|
| **A — Beatsmaxxer / old lab** | `HTMLVideoElement` | TypeScript | WebGPU | **Parked** — reference behavior only |
| **B — Native ceiling** | libmpv / VA-API / FFmpeg→wgpu | Rust player | wgpu native | Compare latency; not v1 web deliverable |
| **C — Target (v1 new repo)** | **WebCodecs** (+ rVFC) | **Zig WASM worker** (or Rust) | **WebGPU** | **Build this** |
| **Avoid** | ffmpeg.wasm hot path | GC-heavy TS loop | WebGL fallback | Research says no |

### WASM / Zig role (narrow, correct)

- **Do:** beat grid lookup, chop reducer, seek settlement, envelope sample index, protocol/state machines  
- **Do not:** per-frame pixel work in WASM (`VideoFrame.copyTo()` ≈ 15–20 ms @ 1080p — keep frames on GPU)  
- **Do not:** expect WASM to replace WebCodecs HW decode  

Zig 0.16 (`wasm32-freestanding`) is a **first-class candidate** for the compiled core: no GC, small modules, C-level control. Rust remains valid if interop/ecosystem wins over purity.

---

## What this repo already proved (keep, don’t rewrite blindly)

| Asset | Location | Carry forward |
|-------|----------|---------------|
| Time Shaper behavior spec | `../video-timeshaper/` (sibling) | EditEngine semantics |
| Lab port | `lab/browser/deck-pgm/src/edit/`, `timesampler/` | Port to Zig, don’t redesign |
| Scope split | `lab/docs/SCOPE-SPLIT.md` | ShaperBox remap vs Resolume seq |
| Peer research | `webgpu-peers/`, `desktop-native/` | Patterns, not vendored code |
| Stack scorecard (narrow) | `webgpu-peers/STACK-SCORECARD.md` | Time Shaper test case only |
| Beatsmaxxer product | `../beatsmaxxer-pro/` | **READ ONLY** — Stack A reference |

Beatsmaxxer today: **SvelteKit + TS WebGPU + HTMLVideo**. Rust in Tauri = shell only (window, Essentia proxy). **Not** a Zig/C native video pipeline.

---

## Steal list (prioritized for new repo)

### P0 — Remap + seek (clock layer)

1. **XinChao-Cut `video-sync.ts`** — wall-clock-normalized drift at ≠1×; lead-compensated seek target ([source](https://github.com/yudgunH/XinChao-Cut/blob/main/src/components/preview/video-sync.ts))
2. **Lab `timesampler/` + `EditEngine`** — grid chop, envelope, locked-grid triggers
3. **Beat-sync backends** (GitHits): modoki, clipkit, estella, alpha-video-kit — audio-authoritative clock patterns

### P1 — Frame pipeline (browser)

4. **WebCodecs `VideoFrame` → WebGPU** — apssouza22 external→owned copy; lumina-video web path  
5. **rVFC frame clock** — AetherVSR, Ghost Arcade `waitForPresentedVideoFrame` after seek  
6. **W3C media-tests** — boundary doc: GPU vs WASM vs WebCodecs ([tidoust/media-tests](https://github.com/tidoust/media-tests))

### P2 — Architecture reference (native, patterns not language)

7. **Ladybird LibMedia** — pull pipeline, off-thread decode, `PlaybackManager`, compositor-side presented frame ([MediaPipelineDesign.md](https://github.com/LadybirdBrowser/ladybird/blob/master/Documentation/MediaPipelineDesign.md)) — **C++**, not Zig  
8. **fastiplayer** — native scrub/speed ceiling ([trailer](https://www.youtube.com/watch?v=eMfzBhpSF8M))

### Prep lane (not live PGM)

9. **flux-fidelity / hf-rife** — RIFE for slow-mo assets  
10. **Essentia** — locked `track.beats.json` before live  

---

## Zig lane (detour findings)

| Topic | Verdict |
|-------|---------|
| Zig performance | Real for native + tiny WASM; same ballpark as Rust for compute |
| Zig 0.16 WASM | `wasm32-freestanding`, [zig-javascript-bridge](https://github.com/scottredig/zig-javascript-bridge/), [0xkiire guide](https://0xkiire.com/wasm-with-zig/) |
| Zig + FFmpeg | [allyourcodebase/ffmpeg](https://github.com/allyourcodebase/ffmpeg) — native/prep, not browser HW decode |
| Zig + GPU offline | [video-pipeline](https://github.com/justinGrosvenor/video-pipeline) + droids — batch, Mac v1 |
| Bun → Rust | **Memory safety at JSC boundary**, not “Zig is slow” — [Bun post](https://bun.com/blog/bun-in-rust), [Kelley response](https://andrewkelley.me/post/my-thoughts-bun-rust-rewrite.html) |
| TigerBeetle | Counterexample: large safe Zig with discipline (TigerStyle) |

**Ladybird ≠ Zig.** LibMedia is C++. Study the **pipeline shape**, not the language.

---

## New repo — suggested v0 shape

```
/new-repo/
  core/           # Zig — remap engine, grid, seek settlement (wasm32 + native tests)
  web/            # Minimal shell — WebCodecs decode, worker loads WASM, WebGPU blit
  shaders/        # WGSL — compositor, one FX module
  prep/           # Scripts — Essentia lock, optional RIFE (uv/bun, not hot path)
  docs/           # This handoff + ADR per layer boundary
```

**v0 done looks like:** one clip, locked beat grid from JSON, Zig WASM chop/stutter on grid, WebCodecs→WebGPU PGM, no rack polish, no second GPU spike.

**Explicit non-goals v0:** Resolume sequencer UI, 8-slot rack, Beatsmaxxer port, ffmpeg.wasm, native Tauri shell.

---

## Toolchain

| Tool | Use |
|------|-----|
| **Zig** 0.16+ | `core/` — `zig build`, wasm32-freestanding for browser worker |
| **bun** / **bunx** | Web shell dev server, TS glue, all JS package/script commands — **not npm/npx** |
| **uv** | Python prep — **not pip** |

---

## Research artifacts to copy or link

From `webgpu-research` (read-only reference):

- `webgpu-peers/STACK-SCORECARD.md`
- `webgpu-peers/applied-patterns.md` §4 (beat-sync video)
- `webgpu-peers/broad-video-sweep-2026.md`
- `desktop-native/SUMMARY.md`
- `desktop-native/wasm-desktop-bridge-2026.md`
- `desktop-native/experimental/low-star-finds-2026.md`
- `lab/docs/SCOPE-SPLIT.md`
- `docs/adr/0001-web-harness-not-second-beatsmaxxer.md`

Sibling (behavior, not stack):

- `../video-timeshaper/` — EditEngine reference

Product (READ ONLY):

- `../beatsmaxxer-pro/` — Stack A; do not edit from research repo

---

## Parked state — `webgpu-research`

- **Do not** grow `lab/browser/deck-pgm/` as a shipping product from here  
- **Do not** merge harness polish back into “finish line”  
- **OK** to run lab at `:5199` as a **behavior reference** when validating Zig port  
- GPU rule unchanged: **one spike at a time**

Continuity for this repo: see [`docs/agents/continuity.md`](./agents/continuity.md) — lab **parked**, active work moves to new repo.

---

## Open decisions for new repo

1. **Zig vs Rust** for WASM core — spike both on chop reducer + seek settlement; pick one  
2. **WebCodecs first** vs dual `<video>` during transition  
3. **Repo name / home** — greenfield; no monorepo with beatsmaxxer-pro  
4. **Target platform v0** — see Mac vs PC note in handoff conversation (browser-first: either; native Zig decode spike: Linux or Mac often smoother)

---

## One-line mission (copy for `/goal`)

Build a **performant web video platform**: WebCodecs HW frames + **Zig WASM remap core** + WebGPU compositor — Time Shaper as the first reference module proving audio-parity steering on a locked grid. Not a rack product clone; not ffmpeg.wasm on the hot path.
