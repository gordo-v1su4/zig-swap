import {
  Input,
  MP4,
  UrlSource,
  VideoSampleSink,
  type VideoSample,
} from "mediabunny";

/** One serial decode stream, bounded library look-ahead, and one coalesced request. */
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

  constructor(
    clipUrl: string,
    private readonly onFrame: (frame: VideoFrame) => void,
    private readonly onError: (error: string) => void,
  ) {
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

  presentAt(seconds: number): void {
    if (this.disposed || !this.sink || !Number.isFinite(seconds)) return;
    this.pending = Math.max(0, Math.min(this.duration - 0.001, seconds));
    if (!this.busy) void this.pump();
  }

  private async pump(): Promise<void> {
    this.busy = true;
    try {
      while (!this.disposed && this.pending !== null) {
        const target = this.pending;
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

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    void this.stream?.return();
    this.input.dispose();
  }
}
