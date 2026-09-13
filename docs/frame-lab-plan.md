# Standalone Frame Lab implementation plan

Goal: a public, local-first browser benchmark people can run on their own hardware.

1. Present generic strategies: pooled/prewarmed HTML video, bounded Mediabunny/WebCodecs cache, preloaded GPU texture bank, and libmedia capability gate. Retain provenance in methodology.
2. Build a clean light page with Results, Playback Lab and Methodology views. Use neutral gray-black module controls, with Beatmaxxer's condensed typography and compact button proportions as references; avoid colored header bars. Group media selection separately from transport, place volume beside Play/Pause/Reset, and separate test configuration from results actions. Preserve playback semantics and tall rectangular slider handles.
3. Load existing reference results on startup, distinguish legacy/previews/trials/failed probes, and provide sorting, filtering, two-run comparison, JSON import/export, CSV export and printing. Flag mismatched workloads and memory budgets; never invent a winner.
4. Accept local video and audio files using browser File/object URLs. Never upload or persist media. Hash and inspect metadata locally, report fingerprints in results, release resources on replacement. Support manual BPM and local energy triggers for custom audio; do not pretend those are separated vocal/stem signals.
5. Provide a standalone Bun startup command without requiring Zig, Rust, Python, sibling repos, or analysis services. Included media works immediately; custom media remains session-only.
6. Verify result aggregation and browser flows, including local files, mixed clip sizes, navigation during a run, exports, and empty/error states. Document limits and push the existing branch.

No production Beatmaxxer changes or new PR. No completed formal comparison claim: included runs are short previews and libmedia probes did not pass the capability gate.
