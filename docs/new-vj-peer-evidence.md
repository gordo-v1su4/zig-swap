# New VJ playback leads outside the existing peer survey

Checked 2026-09-12. Discovery used Reddit and web search; source verification used GitHits through the existing BWS-backed CLI. No peer application was launched or benchmarked in this pass. This report does not rank playback speed.

## Exclusion and prior-test audit

The exclusion scope is `C:/Users/Gordo/Documents/Github/webgpu-research/webgpu-peers/`. Its Markdown files were searched for project names and repository URLs after Graft returned no context hits. None of the six project names below appeared in that documentation search. This is a documented-peer exclusion, not a claim about every ignored file or historical experiment in the lab.

`STACK-SCORECARD.md:6` explicitly says its method used GitHub/GitHits source and that demos were noted but not launched. Its native “ceiling” terminology is not a measured performance ranking. The earlier local Zig Swap seek trials measure our own frame-source path, not any of these peers.

## Newly identified projects

| Project | Verified evidence | Relevance and remaining proof |
| --- | --- | --- |
| **VirtualMixerProject** | The [author's 2019 Reddit post](https://www.reddit.com/r/vjing/comments/c3biej/) describes automatic music-synced browser mixing, MIDI and remote controls. GitHits pinned `ec02947c`; [`VideoSource.js:60–165`](https://github.com/Sense-Studios/VirtualMixerProject/blob/ec02947c/public/javascripts/src/sources/VideoSource.js#L60) creates an HTML video element with preloading and a canvas-backed Three.js texture. | Direct VJ precedent. The author's claim that local seeking feels like Resolume has no controlled timing data in the inspected evidence. Its canvas intermediate makes it a useful older baseline, not an assumed improvement. |
| **OpenVJ** | GitHits pinned `d9f7036c`; [`assetTextureManager.ts:64–83`](https://github.com/kniessner/openvj/blob/d9f7036c/src/lib/assetTextureManager.ts#L64) wraps video in `THREE.VideoTexture`, caches by asset ID and disposes the video/texture together. | Browser VJ/projection-mapping implementation using Three.js/WebGL. Source checked; no comparable seek benchmark verified. Cached asset textures are not evidence of a decoded-frame scrub cache. |
| **VDJ Video Sync** | GitHits pinned `fd1dd987`. Its [README](https://github.com/jota2rz/vdj-video-sync/blob/fd1dd987/README.md#L43) describes BPM matching, soft drift correction above 150ms and hard seeks above 2000ms. [`app.js:2938`](https://github.com/jota2rz/vdj-video-sync/blob/fd1dd987/server/static/js/app.js#L2938) loads a video and waits for `loadeddata` before seeking/playing. | Browser visuals driven by VirtualDJ through a C++ plugin and Go server. Useful synchronization precedent, but those documented drift tolerances do not demonstrate frame-accurate chopping. C++ is the bridge here, not proof of a faster browser decoder. |
| **Framecompose** | [June 2026 author demo on Reddit](https://www.reddit.com/r/webgpu/comments/1u064wq/webgpu_video_editor_scrubbing_test_on_a_longer/) shows/discusses a roughly 30-clip timeline using WebGPU, WebCodecs and Mediabunny, with device-specific tuning. | Relevant multi-clip scrubbing lead. Thirty timeline clips do not establish thirty simultaneous decoder streams. Author demonstration only; no pinned source or controlled latency results verified in this pass. |
| **webgpu-mx-50** | [Author's engineering article](https://dev.to/sebs/resurrecting-the-panasonic-wj-mx50-in-webgpu-3ali) describes a browser recreation of a two-bus Panasonic mixer. GitHits pinned `1dda0c7f`; [`docs/DEVELOPMENT.md:178`](https://github.com/sebs/webgpu-mx-50/blob/1dda0c7f/docs/DEVELOPMENT.md#L178) explicitly defers renderer golden-image tests while describing extensive domain tests. | Useful modular mixer behavior and timing design. Domain-test counts are not rendered-pixel correctness or live performance proof. Lower priority for finding the fastest media playback implementation. |
| **Oneiroi** | GitHits pinned `4589d512`; [`schedule.rs:18–64`](https://github.com/deastrobooking/Oneiroi/blob/4589d512/crates/oneiroi-media/src/schedule.rs#L18) defines bounded scheduling with dropped/late/repeated/invalidated/queue-full counters. The [README](https://github.com/deastrobooking/Oneiroi/blob/4589d512/README.md) describes four decks, Rust/wgpu, a HAP compressed-texture path and conventional FFmpeg decoding. | Strong native VJ candidate to investigate if native scope resumes. Source structure is promising, but physical show-machine certification remains stated release work. Its small first-frame launch preview must not be counted as full-resolution arrival at the requested timestamp. No local performance test performed. |

## A real VJ benchmark methodology exists

[Resolume's published benchmark](https://resolume.com/blog/11093) provides compositions and media, asks testers to add playing layers until output falls below 30fps, and separates resolutions and clean versus noisy footage. That is a concrete reproducible workload, not merely a project feature list. Its community results describe particular systems and application versions; they do not rank browser implementations or measure arbitrary seek latency.

For this project, use two scores: sustainable simultaneous layers at the chosen display deadline, and trigger-to-correct-frame latency during a fixed cut/scrub trace. Record late and stale frames separately from rendered FPS. Keep media encoding, source resolution, display resolution, warmed state and total cache budget explicit. A 60fps UI that repeats an old frame is not a successful seek.

## Browser versus native

See [native capabilities and boundaries](native-vj-boundaries.md). Native opens custom codec/texture paths, decoder-surface integration, presentation queue control and Spout/Syphon integration. A Chromium desktop wrapper alone does not supply those paths. HAP's independently stored compressed frames are a concrete alternative to long-GOP seeking, with storage/bandwidth tradeoffs; neither a language choice nor native packaging establishes the fastest implementation.

Next evidence should be an actual run of selected candidates with the same source material. Preserve browser work as the current implementation scope; research into native options does not authorize or imply a platform migration. None of the new peers is labeled tested or fastest here.
