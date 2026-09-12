# Zig Swap — Video Platform

A performant web video platform: locked clock, time remap, GPU-resident frames, WebGPU compositor. Time Shaper is the first reference module, not the whole product.

## Language

**Platform**:
The end-to-end stack from clock through present — clock, remap, frame source, WebGPU, output.
_Avoid_: Engine, stack (when meaning the whole system), player

**Remap engine**:
The compiled core subsystem that maps source time to playback position — grid chops, loops, rate, seek settlement.
_Avoid_: EditEngine (legacy lab name), time shaper (when meaning the core), sampler

**Time Shaper**:
The first reference module that proves audio-parity steering on a locked beat grid — envelope, chop, stutter, quantize.
_Avoid_: Product name for the whole platform, rack, ShaperBox

**Locked clock**:
The authoritative time base everything quantizes to — beats, onsets, or pre-baked grid from prep.
_Avoid_: Master clock, transport (unless MIDI context)

**Beat grid**:
The discrete division of time into musical steps derived from locked analysis (e.g. `track.beats.json`).
_Avoid_: Timeline, sequence (Resolume sense)

**Locked analysis**:
Offline Essentia prep output committed or cached beside fixture media — `studio-audio-v1` shape with `beats`, `onsets`, `bpm`, `structure`. PGM reads this; it never re-analyzes.
_Avoid_: Live analysis, runtime Essentia

**Prep lane**:
Offline analysis and asset generation — Essentia lock, RIFE slow-mo — never runs during live PGM.
_Avoid_: Live analysis, runtime prep

**PGM**:
Live program output — the real-time path from decode through WebGPU to present.
_Avoid_: Preview (when meaning non-PGM), demo mode

**Frame source**:
Where decoded or generated frames enter the pipeline — WebCodecs HW decode, live input, or render target.
_Avoid_: Decoder (when meaning the whole source layer), video element

**Present**:
Final output surface — canvas PGM, stream, world texture, or export.
_Avoid_: Render (when ambiguous with WebGPU passes), blit (implementation detail)

**Stack A**:
The interim browser stack in Beatsmaxxer — TypeScript clock, `HTMLVideoElement`, WebGPU. Best-performing finished app today; benchmark for feel, not architecture to copy.
_Avoid_: Target stack, port source (for zig-swap)

**Stack C**:
This platform's target — WebCodecs, WASM remap core, WebGPU. What zig-swap builds.
_Avoid_: Beatsmaxxer, lab harness (when meaning the product stack)
