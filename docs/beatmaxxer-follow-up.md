# Beatmaxxer follow-up — September 13, 2026

- [ ] Review the accepted zig-swap checkpoint on `gordo/v1s-77-78-79-parallel`: `50856e9` preserves MIDI cuts; `55cdd8a` adds analyzed triggers and switching ramps; `2e828a7` adds visible speed; `e39d9b8` saves the final preview results.
- [ ] Create/select clips with sustained subject or camera movement so speed changes are visible. Existing fixture shots are poor perceptual evidence.
- [ ] Keep preloaded WebGPU textures as the preferred direction; retain clip switching and independent per-clip ramps.
- [ ] Keep 24 fps output and test denser pre-interpolated frame banks on selected clips for slow motion and 0.5x–2x ramps.
- [ ] Tune saved audio-analysis triggers: full-mix/stem onsets, vocal activity and RMS peaks. MIDI remains an available comparison.
- [ ] Assess Beatmaxxer integration, preload time and bounded memory on target hardware. Preserve the existing production path until integration is deliberately approved.
- [ ] Complete repeatable capacity/stability tests before claiming a production winner. Existing previews validate mechanics, not the entire planned benchmark.

See [benchmark details](musical-playback-benchmark.md). Beatmaxxer itself remains unchanged. This item was saved locally because Linear required reauthentication.
