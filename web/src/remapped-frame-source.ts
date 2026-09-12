import {
  Input,
  MP4,
  UrlSource,
  VideoSampleSink,
  type VideoSample,
} from "mediabunny";

export interface FrameSourceOptions {
  /** Zero disables reuse for the benchmark. Limits apply per frame source. */
  cacheFrames?: number;
  /** Conservative RGBA estimate, not a measurement of driver allocation. */
  cacheBytes?: number;
}

/** One serial decode stream and bounded owned-image reuse. Callback frames are
 * borrowed synchronously and closed immediately after presentation. */
export class RemappedFrameSource {
  private input: Input;
  private sink: VideoSampleSink | null = null;
  private stream: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private pending: number | null = null;
  private busy = false;
  private disposed = false;
  private duration = 0;
  private position = -Infinity;
  private presentedStart = -Infinity;
  private presentedEnd = -Infinity;
  private cache = new Map<
    number,
    { image: ImageBitmap; end: number; bytes: number }
  >();
  private copyCanvas: OffscreenCanvas | null = null;
  private cacheBytes = 0;
  private revision = 0;
  private cacheHits = 0;
  private decodeStarts = 0;
  private cacheCopyFailures = 0;
  private readonly maxFrames: number;
  private readonly maxBytes: number;

  constructor(
    clipUrl: string,
    private readonly onFrame: (frame: VideoFrame) => void,
    private readonly onError: (error: string) => void,
    options: FrameSourceOptions = {},
  ) {
    this.maxFrames = Math.floor(Math.max(0, options.cacheFrames ?? 48));
    this.maxBytes = Math.max(0, options.cacheBytes ?? 64 * 1024 * 1024);
    if (!Number.isFinite(this.maxFrames) || !Number.isFinite(this.maxBytes))
      throw new Error("Frame cache limits must be finite");
    this.input = new Input({ formats: [MP4], source: new UrlSource(clipUrl) });
  }

  async init() {
    const track = await this.input.getPrimaryVideoTrack();
    if (!track || this.disposed) throw new Error("Video track unavailable");
    this.duration = await track.computeDuration();
    if (!Number.isFinite(this.duration) || this.duration <= 0)
      throw new Error("Invalid clip duration");
    const width = await track.getDisplayWidth();
    const height = await track.getDisplayHeight();
    if (this.disposed) throw new Error("Frame source stopped");
    this.sink = new VideoSampleSink(track);
    return { width, height, durationSeconds: this.duration };
  }

  /** Force when another source has drawn into the shared presentation surface. */
  presentAt(seconds: number, forcePresentation = false): void {
    if (this.disposed || !this.sink || !Number.isFinite(seconds)) return;
    const target = Math.max(0, Math.min(this.duration - 0.001, seconds));
    if (forcePresentation) {
      if (target >= this.presentedStart && target < this.presentedEnd)
        this.position = Infinity; // A cache miss must reopen at the held frame.
      this.presentedStart = this.presentedEnd = -Infinity;
    }
    this.revision++;
    this.pending = null;
    if (target >= this.presentedStart && target < this.presentedEnd) return;
    for (const [start, cached] of this.cache) {
      if (target < start || target >= cached.end) continue;
      this.cache.delete(start);
      this.cache.set(start, cached);
      this.cacheHits++;
      const frame = new VideoFrame(cached.image, {
        timestamp: Math.round(start * 1e6),
        duration: Math.round((cached.end - start) * 1e6),
      });
      try {
        this.onFrame(frame);
        this.presentedStart = start;
        this.presentedEnd = cached.end;
      } catch (error) {
        this.stop();
        this.onError(error instanceof Error ? error.message : String(error));
      } finally {
        frame.close();
      }
      return;
    }
    this.pending = target;
    if (!this.busy) void this.pump();
  }

  getStats() {
    return {
      cacheHits: this.cacheHits,
      decodeStarts: this.decodeStarts,
      cachedFrames: this.cache.size,
      estimatedCacheBytes: this.cacheBytes,
      cacheCopyFailures: this.cacheCopyFailures,
    };
  }

  private remember(frame: VideoFrame, start: number, end: number) {
    const bytes = frame.displayWidth * frame.displayHeight * 4;
    if (
      this.cacheCopyFailures ||
      !this.maxFrames ||
      !Number.isFinite(bytes) ||
      bytes <= 0 ||
      bytes > this.maxBytes
    )
      return;
    const previous = this.cache.get(start);
    if (previous) {
      previous.image.close();
      this.cacheBytes -= previous.bytes;
      this.cache.delete(start);
    }
    while (
      this.cache.size >= this.maxFrames ||
      this.cacheBytes + bytes > this.maxBytes
    ) {
      const [key, oldest] = this.cache.entries().next().value!;
      oldest.image.close();
      this.cacheBytes -= oldest.bytes;
      this.cache.delete(key);
    }
    // Clones can pin hardware decoder surfaces and starve the next decode.
    // Rasterize into an owned image before closing the decoder's VideoFrame.
    this.copyCanvas ??= new OffscreenCanvas(
      frame.displayWidth,
      frame.displayHeight,
    );
    if (
      this.copyCanvas.width !== frame.displayWidth ||
      this.copyCanvas.height !== frame.displayHeight
    ) {
      this.copyCanvas.width = frame.displayWidth;
      this.copyCanvas.height = frame.displayHeight;
    }
    const context = this.copyCanvas.getContext("2d");
    if (!context) throw new Error("Frame cache image copy unavailable");
    context.drawImage(frame, 0, 0);
    this.cache.set(start, {
      image: this.copyCanvas.transferToImageBitmap(),
      end,
      bytes,
    });
    this.cacheBytes += bytes;
  }

  private async pump(): Promise<void> {
    this.busy = true;
    try {
      while (!this.disposed && this.pending !== null) {
        const target = this.pending;
        const revision = this.revision;
        this.pending = null;
        // The canvas already holds this frame. No retained VideoFrame is needed.
        if (target >= this.presentedStart && target < this.presentedEnd)
          continue;
        if (
          !this.stream ||
          target < this.position ||
          target > this.position + 1
        ) {
          await this.stream?.return();
          if (this.disposed) return;
          this.stream = this.sink!.samples(target);
          this.decodeStarts++;
          this.position = target;
        }
        const result = await this.stream.next();
        if (result.done) {
          await this.stream.return();
          this.stream = null;
          continue;
        }
        const sample = result.value;
        try {
          if (this.disposed) return;
          // An immediate cache hit or frame hold already fulfilled a newer request.
          if (revision !== this.revision && this.pending === null) continue;
          this.position = sample.timestamp;
          // A seek arriving during decode supersedes the old source region.
          if (this.pending !== null && Math.abs(this.pending - target) > 0.25)
            continue;
          const end = sample.timestamp + Math.max(sample.duration, 1 / 120);
          if (end <= target) {
            this.pending ??= target;
            continue;
          }
          const frame = sample.toVideoFrame();
          try {
            try {
              this.remember(frame, sample.timestamp, end);
            } catch {
              // Reuse is optional. A copy failure must not stop ordinary decode.
              this.cacheCopyFailures++;
              this.clearCache();
            }
            this.onFrame(frame);
          } finally {
            frame.close();
          }
          this.presentedStart = sample.timestamp;
          this.presentedEnd = end;
        } finally {
          sample.close();
        }
      }
    } catch (error) {
      if (!this.disposed) {
        this.stop();
        this.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.busy = false;
    }
  }

  private clearCache(): void {
    for (const cached of this.cache.values()) cached.image.close();
    this.cache.clear();
    this.cacheBytes = 0;
    if (this.copyCanvas) this.copyCanvas.width = this.copyCanvas.height = 1;
    this.copyCanvas = null;
  }

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    this.clearCache();
    void this.stream?.return();
    this.input.dispose();
  }
}
