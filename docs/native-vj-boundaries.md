# Native VJ playback: capabilities and boundaries

Research checked 2026-09-12. This is an options note, not a change to the browser platform direction in `CONTEXT.md` and not a measured native benchmark.

Leaving the browser gives the platform more control over its frame source, GPU resources, presentation queue, and connections to other video applications. Those capabilities can help rapid cuts, reverse playback, and arbitrary seeks. A desktop executable alone supplies no latency guarantee; the codec and the path from requested source time to displayed frame still matter.

## What native access opens

| Capability | Concrete opportunity | Boundary |
| --- | --- | --- |
| Custom video codecs and GPU texture formats | HAP can deliver compressed textures directly to OpenGL, Metal, or Direct3D after demuxing and its lightweight decode stage. This permits a frame source designed around independently stored frames and compressed GPU storage. | The application must integrate the demuxer, decoder, texture upload and any required color shader. HAP is not automatically accelerated because an arbitrary decoder can open the file. |
| Direct decoder/surface integration | Windows Media Foundation can share a Direct3D 11 device between a decoder and renderer using the DXGI device manager. | Hardware configuration must be supported; software fallback is explicitly part of Microsoft's design. Native access does not make unsupported codec profiles hardware decodable. |
| Presentation queue control | DXGI waitable swap chains let the application wait until the system can accept a frame, then render from current input; maximum frame latency is adjustable. | Less queueing reduces CPU/GPU parallelism. The setting is a throughput/latency tradeoff, not an assurance that every seek reaches the next display refresh. |
| Native video application interoperability | Spout shares textures on Windows; Syphon shares GPU surfaces on macOS, including OpenGL/Metal interoperability. | The sender/receiver integration, texture compatibility, synchronization and display stages still need implementation and measurement. |

Sources: [HAP developer integration](https://hap.video/developers.html), [HAP frame specification](https://github.com/Vidvox/hap/blob/master/documentation/HapVideoDRAFT.md), [Microsoft decoder/renderer integration](https://learn.microsoft.com/en-us/windows/win32/medfound/supporting-direct3d-11-video-decoding-in-media-foundation), [Microsoft low-latency presentation](https://learn.microsoft.com/en-us/windows/uwp/gaming/reduce-latency-with-dxgi-1-3-swap-chains), [Spout SDK](https://github.com/leadedge/Spout2), [Syphon](https://syphon.info/).

The HAP specification describes each frame as texture data with optional secondary compression. Engineering inference: an indexed frame source can retrieve a target without decoding a preceding temporal prediction chain. This removes one source of unpredictable seek work, but file access, decompression, upload and scheduling remain. HAP's own guidance describes the tradeoff between disk access, decode work and image quality, with medium-to-large files. It does not establish performance for this app or machine. [HAP specification](https://github.com/Vidvox/hap/blob/master/documentation/HapVideoDRAFT.md), [HAP tradeoffs](https://hap.video/benchmarks.html).

## DXV is evidence for a design, not a generic native entitlement

Resolume documents GPU decompression for DXV and says its accelerated playback is specific to Resolume. Therefore “native supports DXV” is insufficient evidence that our platform would inherit Resolume's fast path. File compatibility, accelerated decoding, and an application designed to use the resulting textures are distinct claims. HAP has a documented integration route for custom applications and a free BSD license, making it a concrete option to investigate without assuming access to Resolume's implementation. [Resolume DXV performance](https://resolume.com/support/en/rendering-to-dxv), [HAP developer route](https://hap.video/developers.html), [HAP licensing](https://hap.video/).

## What a desktop wrapper does not prove

Electron inherits Chromium's process architecture and uses renderer processes for its web UI. It adds native facilities through the main process and communication bridges. Engineering inference: packaging the current WebCodecs/WebGPU path in Electron does not itself replace its decoder, expose a native swap chain, or establish native texture sharing. A web UI can coexist with a separate native PGM path, but that path is additional integration work. [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).

Native code also does not automatically remove long-GOP dependencies, decoding surface limits, GPU copies, cache misses, disk stalls, queueing, or synchronization errors. Switching the implementation language while retaining the same codec and resource pipeline is not evidence of faster cuts. These are engineering boundaries, not measured conclusions about Zig, Rust, C++, or TypeScript.

Syphon advertises zero-copy/zero-latency surface sharing; that describes its sharing mechanism, not end-to-end time from a musical trigger to pixels on a projector. Measure that full path separately. [Syphon features](https://syphon.info/).

For a future comparison, keep source content, resolutions, target source-time sequence and cache state explicit. Report cold and warm cuts/seeks, time to the correct displayed frame, missed display deadlines, memory and storage traffic. Compare the platform paths before selecting a language; no native winner has been established by this research.
