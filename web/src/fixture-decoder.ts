import { EncodedPacketSink, Input, MP4, UrlSource } from 'mediabunny';

export interface FixtureDecoderReadyInfo {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly durationSeconds: number;
  readonly fps: number;
}

export interface FixtureDecoderOptions {
  readonly clipUrl: string;
  readonly onFrame: (frame: VideoFrame) => void;
  readonly onBuffering?: (decodedFrames: number) => void;
  readonly onReady?: (info: FixtureDecoderReadyInfo) => void;
  readonly onError: (message: string) => void;
}

interface DecodedFrame {
  timestampUs: number;
  frame: VideoFrame;
}

/**
 * Decode the full fixture clip once, then loop it at real-time via indexed rAF lookup.
 */
export class FixtureDecoder {
  private readonly options: FixtureDecoderOptions;
  private disposed = false;
  private rafId = 0;
  private durationSeconds = 0;
  private playbackStartMs = 0;
  private frames: DecodedFrame[] = [];
  private timelineStartUs = 0;
  private timelineEndUs = 0;
  private lastPresentedTimestampUs = -1;
  private decodeComplete = false;
  private displayWidth = 0;
  private displayHeight = 0;
  private presenting = false;
  private previewShown = false;

  constructor(options: FixtureDecoderOptions) {
    this.options = options;
  }

  start(): void {
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

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error('Fixture clip has no video track');
      }

      this.durationSeconds = await videoTrack.computeDuration();
      const decoderConfig = await videoTrack.getDecoderConfig();
      if (!decoderConfig) {
        throw new Error('Fixture clip missing VideoDecoderConfig');
      }

      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      if (!support.supported) {
        throw new Error('VideoDecoderConfig not supported in this browser');
      }

      this.displayWidth = await videoTrack.getDisplayWidth();
      this.displayHeight = await videoTrack.getDisplayHeight();
      const sink = new EncodedPacketSink(videoTrack);

      const decoder = new VideoDecoder({
        output: (frame) => {
          this.onDecodedFrame(frame.timestamp, frame.clone());
          frame.close();
        },
        error: (error) => {
          this.options.onError(error.message);
        },
      });

      decoder.configure(decoderConfig);

      for await (const packet of sink.packets()) {
        if (this.disposed) break;
        decoder.decode(packet.toEncodedVideoChunk());
      }

      await decoder.flush();
      decoder.close();

      if (this.frames.length === 0) {
        throw new Error('Fixture clip produced no decoded frames');
      }

      this.frames.sort((a, b) => a.timestampUs - b.timestampUs);
      this.timelineStartUs = this.frames[0].timestampUs;
      this.timelineEndUs = this.frames[this.frames.length - 1].timestampUs;
      this.decodeComplete = true;
      this.emitReady();
      this.beginPlayback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onError(message);
    }
  }

  private onDecodedFrame(timestampUs: number, frame: VideoFrame): void {
    this.frames.push({ timestampUs, frame });

    if (!this.previewShown) {
      this.previewShown = true;
      this.options.onFrame(frame);
    }

    if (this.frames.length % 24 === 0) {
      this.options.onBuffering?.(this.frames.length);
    }
  }

  private beginPlayback(): void {
    if (this.presenting || this.disposed || !this.decodeComplete) return;

    this.presenting = true;
    this.playbackStartMs = performance.now();
    this.lastPresentedTimestampUs = -1;
    this.options.onBuffering?.(this.frames.length);
    this.startPresentLoop();
  }

  private emitReady(): void {
    const timelineSpanUs = Math.max(1, this.timelineEndUs - this.timelineStartUs);
    const fps =
      this.durationSeconds > 0
        ? this.frames.length / this.durationSeconds
        : this.frames.length / (timelineSpanUs / 1_000_000);

    this.options.onReady?.({
      width: this.displayWidth,
      height: this.displayHeight,
      frameCount: this.frames.length,
      durationSeconds: this.durationSeconds,
      fps,
    });
  }

  private frameAtTimestampUs(targetUs: number): VideoFrame {
    let selected = this.frames[0];
    for (const entry of this.frames) {
      if (entry.timestampUs <= targetUs) {
        selected = entry;
      } else {
        break;
      }
    }
    return selected.frame;
  }

  private startPresentLoop(): void {
    const loopUs =
      this.durationSeconds > 0
        ? this.durationSeconds * 1_000_000
        : Math.max(1, this.timelineEndUs - this.timelineStartUs);

    const presentLoop = (): void => {
      if (this.disposed || this.frames.length === 0) return;

      const elapsedUs = (performance.now() - this.playbackStartMs) * 1000;
      const phaseUs = elapsedUs % loopUs;
      const targetUs = this.timelineStartUs + phaseUs;

      if (targetUs !== this.lastPresentedTimestampUs) {
        this.lastPresentedTimestampUs = targetUs;
        this.options.onFrame(this.frameAtTimestampUs(targetUs));
      }

      this.rafId = requestAnimationFrame(presentLoop);
    };

    this.rafId = requestAnimationFrame(presentLoop);
  }

  stop(): void {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    for (const entry of this.frames) {
      entry.frame.close();
    }
    this.frames = [];
  }
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
