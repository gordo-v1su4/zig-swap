# Reddit browser video discovery (2026-09-12)

Light, read-only pass over Reddit search for `webdev video editor in browser`. Existing peers in `webgpu-research/webgpu-peers` were skipped where they were already catalogued.

## Findings

- [AetherCut launch discussion](https://www.reddit.com/r/SideProject/comments/1t7o708/i_built_a_video_editor_that_runs_entirely_in_your/) — OP states the editor uses WebCodecs + Canvas, client-side processing, 18 tools, beat sync, and 1080p/4K export. The useful performance evidence is a reported “perf mode” that lowers preview resolution/frame rate while preserving export quality. A commenter specifically asked about long videos and multiple tracks; OP replied “try it out,” so there is no measured long-clip, seek-latency, dropped-frame, or multi-track benchmark in the thread. Later OP claims fixes for clip reorder/trim, a second-track/PiP row, and Brave support; these are self-reported feature claims rather than independently verified tests.

- [MasterSelects WebGPU editor](https://www.reddit.com/r/webdev/comments/1qy8kwi/i_built_an_opensource_browserbased_video_editor/) — OP claims real-time WebGPU compositing, 30+ WGSL effects, multi-track keyframes, and multicam editing, with a React/Zustand/custom shader stack and public MIT repo/live site. The thread contains no frame-time, seeking, decode, clip-count, or export measurements. A direct question about offline rendering received the answer “all offline. no server roundtrips.” Treat architecture and offline behavior as stated claims; treat performance as unproven. The author also says the project is rough and refreshes may be needed.

- [Offline editor requirements discussion](https://www.reddit.com/r/SideProject/comments/1waxo3c/building_a_fully_offline_no_subscription_video/) — Very recent design discussion, not a working browser benchmark. Concrete user feedback asks for a complete workflow (import, trim, captions, clean vertical export) and testing with a handful of users who finish three real videos. Other requests call out silence removal/jump-cut detection and HDR editing without unnecessary decode/re-encode. Useful acceptance criteria for cuts/export, but no playback or seeking measurements.

- [Free/open-source browser image and video editors](https://www.reddit.com/r/foss/comments/1wa2075/free_opensource_image_and_video_editors_in_the/) — Search result (154 votes, 13 comments) surfaced as a promising community roundup. The result page did not expose technical details during this pass; no claims are recorded as verified.

- [Browser video editor with local processing](https://www.reddit.com/r/chromeos/comments/1qlu0uy/best_browser_video_editor_with_local_processing/) — Search result (8 votes, 12 comments) focused on local processing on ChromeOS. No accessible measurements or implementation details were visible in the bounded pass.

- [Video editor 100% in browser, no uploads](https://www.reddit.com/r/SideProject/comments/1o170d0/video_editor_that_runs_100_in_your_browser_no/) — Search result (53 votes, 10 comments) with privacy/local-processing positioning. No playback, cut, seek, multi-clip, or export test evidence was visible without extending the pass.

## Benchmark implications

The strongest recurring user signal is preview-quality adaptation for weaker hardware, plus a predictable workflow around trim/split/reorder and multiple tracks. Reddit evidence here supports testing those behaviors directly; it does not support competitor FPS, seek-latency, or long-video performance numbers. A useful acceptance fixture should include long media, multiple clips/tracks, repeated cuts and seeks, and an explicit preview-quality mode, while recording dropped frames and actual export results.
