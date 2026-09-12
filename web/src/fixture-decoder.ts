import { Input, MP4, UrlSource, VideoSampleSink, type VideoSample } from 'mediabunny';

export interface FixtureDecoderReadyInfo {
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly fps: number;
}

export interface FixtureDecoderOptions {
  readonly clipUrl: string;
  /** Consumed synchronously; the decoder closes the frame after this callback. */
  readonly onFrame: (frame: VideoFrame) => void;
  readonly onBuffering?: (decodedFrames: number) => void;
  readonly onReady?: (info: FixtureDecoderReadyInfo) => void;
  readonly onError: (message: string) => void;
}

/** Play a bounded, presentation-ordered WebCodecs stream, decoding anew on each loop. */
export class FixtureDecoder {
  private disposed = false;
  private started = false;
  private input: Input | null = null;
  private samples: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private rafId = 0;
  private wakePresentation: (() => void) | null = null;

  constructor(private readonly options: FixtureDecoderOptions) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    if (typeof VideoDecoder === 'undefined') {
      this.options.onError('WebCodecs VideoDecoder unavailable');
      return;
    }
    this.options.onBuffering?.(0);
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const input = new Input({
        formats: [MP4],
        source: new UrlSource(this.options.clipUrl),
      });
      this.input = input;
      const videoTrack = await input.getPrimaryVideoTrack();
      if (this.disposed) return;
      if (!videoTrack) throw new Error('Fixture clip has no video track');

      const durationSeconds = await videoTrack.computeDuration();
      if (this.disposed) return;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error('Fixture clip has no positive duration');
      }
      const width = await videoTrack.getDisplayWidth();
      const height = await videoTrack.getDisplayHeight();
      if (this.disposed) return;

      // The sink bounds decoded samples + queued decode requests and handles
      // B-frame ordering. Await presentation before pulling the next sample so
      // its look-ahead stays bounded even while rAF is paused in a hidden tab.
      const sink = new VideoSampleSink(videoTrack);
      let ready = false;
      while (!this.disposed) {
        const samples = sink.samples();
        this.samples = samples;
        let firstTimestamp: number | null = null;
        let playbackStartMs = 0;
        try {
          for await (const sample of samples) {
            try {
              // A pending next() can resolve after stop(). Own and close that
              // late sample without converting or presenting it.
              if (this.disposed) break;
              if (firstTimestamp === null) {
                firstTimestamp = sample.timestamp;
                playbackStartMs = performance.now();
                if (!ready) {
                  ready = true;
                  this.options.onReady?.({
                    width, height, durationSeconds,
                    fps: sample.duration > 0 ? 1 / sample.duration : 0,
                  });
                }
              }
              const dueMs = playbackStartMs + (sample.timestamp - firstTimestamp) * 1000;
              await this.waitUntil(dueMs);
              if (this.disposed) break;
              // Drop expired frames after a stall instead of playing a backlog.
              if (sample.duration > 0 && performance.now() >= dueMs + sample.duration * 1000) {
                continue;
              }
              const frame = sample.toVideoFrame();
              try {
                this.options.onFrame(frame);
              } finally {
                frame.close();
              }
            } finally {
              sample.close();
            }
          }
        } finally {
          await samples.return();
          this.samples = null;
        }
        if (this.disposed) return;
        if (firstTimestamp === null) throw new Error('Fixture clip produced no decoded frames');
        // Hold the final image for the rest of its duration before restarting.
        await this.waitUntil(playbackStartMs + durationSeconds * 1000);
      }
    } catch (error) {
      if (!this.disposed) {
        this.options.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.stop();
    }
  }

  private async waitUntil(dueMs: number): Promise<void> {
    while (!this.disposed && performance.now() < dueMs) {
      await new Promise<void>((resolve) => {
        this.wakePresentation = resolve;
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.wakePresentation = null;
          resolve();
        });
      });
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.wakePresentation?.();
    this.wakePresentation = null;
    // return() releases prefetched samples and wakes a pending next(); dispose
    // cancels outstanding reads and closes the sink's underlying decoder.
    void this.samples?.return();
    this.input?.dispose();
    this.input = null;
  }
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
