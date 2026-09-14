# Bounded image reuse: first local measurement

> Historical experiment / original demo. Use the [current README](../README.md) for Frame Lab. These instructions are not required for the hosted benchmark.

Measured 2026-09-12 in the in-app browser on this Windows machine, Chromium 152.
Run `bun run dev`, then open `/seek-benchmark`. The comparison changes only the frame
cache setting, using the same `RemappedFrameSource`, media and WebGPU presenter.
It bypasses the remap language deliberately to isolate frame availability.

## Media and trace

The imported `prep/fixtures/test-media/video/benchmark-redline.mp4` is an unchanged
copy of Beatsmaxxer's local `test_media/redline-media/cleaned/hf_20260718_061437_6ac38dee-9f5a-4e0d-a8d7-fa094f5eacf6.mp4`.
SHA-256: `97d4372845d4f52b669068002f80e95713580c4ad3843a74a1f9d32ab36e7295`.
FFprobe reports H.264, 1280x720, 24 fps, 15.041667 seconds. Beatsmaxxer was not changed.

80 requests: visit ten consecutive 24fps frame positions, repeat those ten,
then advance to the next of four regions of the clip. Each request waits for the
preceding result; one animation-frame opportunity separates requests. This is
a sequential seek test, not a deadline-driven music or rapid-scrub stress test.
The provided media choices are 24fps fixtures; the trace/HTML tolerance is not a
general variable-frame-rate benchmark. No HTMLVideo or native comparison ran.

## Results

Times are milliseconds from `presentAt` to return from WebGPU command submission.
They exclude initial metadata loading, display scanout, audio and remap computation.
With 80 observations p99 is effectively the maximum, so it is noisy.

| Trial | Cache | All requests p50 / p95 / p99 | Repeated portion p50 / p95 / p99 | >16.67ms | Wrong frame intervals |
| --- | --- | --- | --- | --- | --- |
| 1 | off | 0.2 / 13.8 / 33.7 | 0.2 / 8.4 / 32.5 | 4 | 0 |
| 1 | owned images | 0.3 / 1.1 / 33.1 | 0.2 / 0.3 / 0.3 | 2 | 0 |
| 2 | off | 0.2 / 16.0 / 36.6 | 0.2 / 9.2 / 35.1 | 4 | 0 |
| 2 | owned images | 0.3 / 1.0 / 50.9 | 0.2 / 0.3 / 0.3 | 2 | 0 |

Both cache trials report 40 hits and four decode-stream starts versus eight
without caching. They finish with 18 retained images, estimated at 66,355,200 bytes
(63.28 MiB), and zero retained images/bytes after `stop`. Final trial copy failures: zero.

**Supported conclusion:** reusing this repeated segment avoids decoder restarts
and improves its warm tail latency. Cold misses remain: overall median increased
slightly and the final cached run had a slower maximum. These few same-order runs
are not statistical proof, physical input-to-display measurements, or a victory
over Beatsmaxxer, Rust or native playback. Browser/file/GPU warming can affect results.

## Why images, not VideoFrame clones

The first cache retained decoder-frame clones. It stalled in the actual browser
at source time 0.38s and hit the five-second benchmark timeout. A byte limit did
not protect scarce decoder surfaces. That implementation was replaced before commit.

The final cache draws into an OffscreenCanvas and transfers an owned ImageBitmap;
original decoder samples and VideoFrames still close immediately after use. On a
cache hit, a temporary VideoFrame wraps the image for the existing WebGPU presenter
and closes after submission. No explicit CPU pixel readback is requested, but this
does add a raster/image copy and does not guarantee zero-copy or GPU-only allocation.

The limit is both 48 images and a 64 MiB RGBA estimate **per source**, with LRU
eviction. Scratch canvas, decoder look-ahead and driver allocations are additional.
The snapshot path is tested on these SDR fixtures, not HDR/wide-gamut preservation.
An image-copy failure disables reuse and allows ordinary decoding to continue.

Tests cover reuse, byte/count limits, disposal, superseded in-flight decode and
late frames. The real browser benchmark caught the decoder-surface stall that
mocked unit tests could not. The larger comparison should follow
[the research plan](playback-strategy-research.md): timed music, random seeks,
prepared clips, then matched HTMLVideo/native and language comparisons.
