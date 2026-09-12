interface TimelineFrame { generation: number; playing: boolean; playbackRate: number; positionSeconds: number; contextTimeSeconds: number; }
const currentRackSlotForModule = (_id: string): string | null => null;

export const VIDEO_LOAD_TIMEOUT_MS = 15_000;
export const VIDEO_FRAME_TIMEOUT_MS = 3_000;
export const VIDEO_DRIFT_CHECK_INTERVAL_SECONDS = 0.5;
export const VIDEO_DRIFT_CORRECTION_THRESHOLD_SECONDS = 0.35;

export function timelineMediaTarget(positionSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return ((positionSeconds % durationSeconds) + durationSeconds) % durationSeconds;
}

export function timelineMediaDrift(
  currentSeconds: number,
  targetSeconds: number,
  durationSeconds: number
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return targetSeconds - currentSeconds;
  }
  const direct = targetSeconds - currentSeconds;
  const wrapped = direct > 0 ? direct - durationSeconds : direct + durationSeconds;
  return Math.abs(direct) <= Math.abs(wrapped) ? direct : wrapped;
}

interface VideoSyncState {
  generation: number;
  playing: boolean;
  playbackRate: number;
  lastCorrectionContextSeconds: number;
}

interface ControlledVideoSyncState {
  timelineGeneration: number;
  controlGeneration: number;
  playing: boolean;
  playbackRate: number;
  lastCorrectionContextSeconds: number;
}

export interface VideoCandidate {
  readonly moduleId: string;
  readonly url: string;
  readonly token: number;
  readonly video: HTMLVideoElement;
  readonly generation: number;
}

export interface VideoCommitResult {
  video: HTMLVideoElement;
  /** Resolves only after the replaced element no longer references its source URL. */
  previousReleased: Promise<void>;
}

interface ArmedVideoState {
  trimStart: number;
  ready: boolean;
  promise?: Promise<void>;
}

/** Shared HTMLVideoElement pool — timeline-slaved playback and transactional hot-swap. */
export class VideoPool {
  private videos = new Map<string, HTMLVideoElement>();
  private urls = new Map<string, string>();
  private pending = new Map<
    string,
    { moduleId: string; promise: Promise<VideoCandidate>; controller: AbortController }
  >();
  private candidates = new Map<number, VideoCandidate>();
  private candidateControllers = new Map<number, AbortController>();
  private generations = new Map<string, number>();
  private destroyed = new WeakSet<HTMLVideoElement>();
  private nextToken = 0;
  private moduleRates = new Map<string, number>();
  private freeRun = new Set<string>();
  private syncStates = new Map<string, VideoSyncState>();
  private controlledSyncStates = new Map<string, ControlledVideoSyncState>();
  private moduleTimelineTargets = new Map<string, number>();
  private armedStates = new Map<string, ArmedVideoState>();

  /** @deprecated Playback rate is supplied by TimelineFrame. */
  setGlobalRate(_rate: number) {}

  getGlobalRate() { return 1; }

  private sourceId(id: string) {
    if (this.videos.has(id) || this.generations.has(id)) return id;
    return currentRackSlotForModule(id) ?? id;
  }

  markFreeRun(moduleId: string) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.add(moduleId);
    this.controlledSyncStates.delete(moduleId);
  }

  unmarkFreeRun(moduleId: string) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.delete(moduleId);
  }

  async prepare(moduleId: string, url: string): Promise<VideoCandidate> {
    const token = ++this.nextToken;
    const generation = this.generations.get(moduleId) ?? 0;
    const key = `${moduleId}\u0000${url}\u0000${token}`;
    const controller = new AbortController();
    const promise = this.loadVideo(url, controller.signal).then(async (video) => {
      if ((this.generations.get(moduleId) ?? 0) !== generation) {
        await this.destroyElement(video);
        throw new Error('video-candidate-invalidated');
      }
      const candidate = { moduleId, url, token, video, generation };
      this.candidates.set(token, candidate);
      this.candidateControllers.set(token, controller);
      return candidate;
    });
    this.pending.set(key, { moduleId, promise, controller });
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }

  async prewarmCandidate(candidate: VideoCandidate): Promise<void> {
    this.assertCandidate(candidate);
    const controller = this.candidateControllers.get(candidate.token);
    if (!controller) throw new Error('video-candidate-invalidated');
    await this.prewarmVideo(candidate.video, controller.signal);
    this.assertCandidate(candidate);
  }

  commitCandidate(candidate: VideoCandidate): VideoCommitResult {
    this.assertCandidate(candidate);
    this.candidates.delete(candidate.token);
    this.candidateControllers.delete(candidate.token);
    const old = this.videos.get(candidate.moduleId);
    this.videos.set(candidate.moduleId, candidate.video);
    this.urls.set(candidate.moduleId, candidate.url);
    this.syncStates.delete(candidate.moduleId);
    this.controlledSyncStates.delete(candidate.moduleId);
    this.moduleTimelineTargets.delete(candidate.moduleId);
    this.armedStates.delete(candidate.moduleId);
    return {
      video: candidate.video,
      previousReleased:
        old && old !== candidate.video ? this.destroyElement(old) : Promise.resolve()
    };
  }

  async discardCandidate(candidate: VideoCandidate): Promise<void> {
    if (this.candidates.get(candidate.token) !== candidate) return;
    this.candidates.delete(candidate.token);
    this.candidateControllers.get(candidate.token)?.abort();
    this.candidateControllers.delete(candidate.token);
    await this.destroyElement(candidate.video);
  }

  private assertCandidate(candidate: VideoCandidate) {
    if (
      this.candidates.get(candidate.token) !== candidate ||
      (this.generations.get(candidate.moduleId) ?? 0) !== candidate.generation
    ) {
      throw new Error('video-candidate-invalidated');
    }
  }

  /** Compatibility path; transactional callers should use the candidate protocol. */
  async attach(moduleId: string, url: string): Promise<HTMLVideoElement> {
    const existing = this.videos.get(moduleId);
    if (existing && this.urls.get(moduleId) === url) return existing;
    const candidate = await this.prepare(moduleId, url);
    try {
      await this.prewarmCandidate(candidate);
      const committed = this.commitCandidate(candidate);
      await committed.previousReleased;
      return committed.video;
    } catch (error) {
      await this.discardCandidate(candidate);
      throw error;
    }
  }

  private async loadVideo(url: string, signal: AbortSignal): Promise<HTMLVideoElement> {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.preload = 'auto';
    if (!url.startsWith('blob:')) video.crossOrigin = 'anonymous';
    video.style.cssText =
      'position:fixed;right:0;bottom:0;width:4px;height:4px;opacity:0.001;pointer-events:none;z-index:0';

    try {
      await this.waitForLoad(video, url, signal);
      return video;
    } catch (error) {
      await this.destroyElement(video);
      throw error;
    }
  }

  private waitForLoad(video: HTMLVideoElement, url: string, signal: AbortSignal): Promise<void> {
    return this.eventWait(
      video,
      ['loadeddata', 'canplay'],
      signal,
      VIDEO_LOAD_TIMEOUT_MS,
      () => new Error(`Video load failed: ${url}`),
      true
    );
  }

  private async destroyElement(video: HTMLVideoElement): Promise<void> {
    if (this.destroyed.has(video)) return;
    this.destroyed.add(video);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  get(moduleId: string): HTMLVideoElement | undefined {
    return this.videos.get(this.sourceId(moduleId));
  }

  getDuration(moduleId: string): number {
    const video = this.videos.get(this.sourceId(moduleId));
    return video && Number.isFinite(video.duration) ? video.duration : 0;
  }

  getTimelineTarget(moduleId: string): number | null {
    return this.moduleTimelineTargets.get(this.sourceId(moduleId)) ?? null;
  }

  hasReadyFrame(moduleId: string): boolean {
    const video = this.videos.get(this.sourceId(moduleId));
    return !!video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
  }

  /** True when arm-at-trim has parked a decoded frame at the trim point (paused). */
  isArmedAtTrim(moduleId: string, trimStart = 0): boolean {
    moduleId = this.sourceId(moduleId);
    const video = this.videos.get(moduleId);
    const state = this.armedStates.get(moduleId);
    if (!video || !state?.ready || state.trimStart !== trimStart) return false;
    if (!video.paused || video.videoWidth <= 0) return false;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const target = this.trimTargetSeconds(trimStart, duration);
    return Math.abs(video.currentTime - target) <= Math.max(1 / 120, duration * 0.00001);
  }

  /**
   * Seek to trim start, wait for presentation (rVFC), and park paused so PGM cuts
   * reveal a decoded frame instead of flashing stale/empty texture.
   */
  async armAtTrim(moduleId: string, trimStart = 0, signal?: AbortSignal): Promise<void> {
    moduleId = this.sourceId(moduleId);
    const video = this.videos.get(moduleId);
    if (!video) return;

    const state = this.armedStates.get(moduleId);
    if (state?.trimStart === trimStart && state.ready && this.isArmedAtTrim(moduleId, trimStart)) {
      return;
    }
    if (state?.trimStart === trimStart && state.promise) {
      await state.promise;
      return;
    }

    const armed: ArmedVideoState = { trimStart, ready: false };
    const operation = this.armVideoAtTrim(video, trimStart, signal)
      .then(() => {
        armed.ready = true;
        armed.promise = undefined;
      })
      .catch((error) => {
        if (this.armedStates.get(moduleId) === armed) this.armedStates.delete(moduleId);
        throw error;
      });
    armed.promise = operation;
    this.armedStates.set(moduleId, armed);
    await operation;
  }

  async prewarm(moduleId: string): Promise<void> {
    moduleId = this.sourceId(moduleId);
    if (this.isArmedAtTrim(moduleId, 0)) return;
    const video = this.videos.get(moduleId);
    if (video && this.hasReadyFrame(moduleId) && this.isAtTrimTarget(video, 0)) {
      this.armedStates.set(moduleId, { trimStart: 0, ready: true });
      return;
    }
    await this.armAtTrim(moduleId, 0);
  }

  private isAtTrimTarget(video: HTMLVideoElement, trimStart: number) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const target = this.trimTargetSeconds(trimStart, duration);
    return Math.abs(video.currentTime - target) <= Math.max(1 / 120, duration * 0.00001);
  }

  private trimTargetSeconds(trimStart: number, duration: number) {
    const fraction = Math.max(0, Math.min(1, trimStart));
    return fraction * duration;
  }

  private async armVideoAtTrim(
    video: HTMLVideoElement,
    trimStart: number,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      try {
        video.pause();
      } catch {
        // Autoplay policies may reject pause on a never-played element; arm still proceeds.
      }

      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        await this.eventWait(video, ['loadedmetadata'], signal, VIDEO_LOAD_TIMEOUT_MS);
      }

      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('video-arm-duration-unavailable');
      }

      const target = this.trimTargetSeconds(trimStart, duration);
      const atTarget =
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        Math.abs(video.currentTime - target) <= Math.max(1 / 120, duration * 0.00001);

      if (!atTarget) {
        const seeked = this.eventWait(video, ['seeked'], signal, VIDEO_FRAME_TIMEOUT_MS);
        video.currentTime = target;
        await seeked;
        await waitForPresentedVideoFrame(video, VIDEO_FRAME_TIMEOUT_MS, signal);
      }

      await this.waitForDecodedFrame(video, signal);
    } finally {
      video.pause();
    }
  }

  private async prewarmVideo(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
    await this.armVideoAtTrim(video, 0, signal);
  }

  private waitForDecodedFrame(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      return Promise.resolve();
    }
    const decoded = new Promise<void>((resolve) => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => resolve());
      } else {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
      }
    });
    return this.bounded(decoded, signal, VIDEO_FRAME_TIMEOUT_MS, 'video-frame-timeout');
  }

  private eventWait(
    video: HTMLVideoElement,
    readyEvents: string[],
    signal: AbortSignal | undefined,
    timeoutMs: number,
    errorFactory: () => Error = () => new Error('video-frame-load-failed'),
    startLoad = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        complete();
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(() => reject(errorFactory()));
      const onAbort = () => finish(() => reject(new Error('video-candidate-invalidated')));
      const timer = setTimeout(
        () => finish(() => reject(new Error('video-wait-timeout'))),
        timeoutMs
      );
      const cleanup = () => {
        clearTimeout(timer);
        for (const event of readyEvents) video.removeEventListener(event, onReady);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      for (const event of readyEvents) video.addEventListener(event, onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (startLoad) {
        document.body.appendChild(video);
        video.load();
      }
      if (signal?.aborted) onAbort();
    });
  }

  private bounded<T>(
    operation: Promise<T>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        complete();
      };
      const onAbort = () => finish(() => reject(new Error('video-candidate-invalidated')));
      const timer = setTimeout(() => finish(() => reject(new Error(timeoutMessage))), timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      operation.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error))
      );
      if (signal?.aborted) onAbort();
    });
  }

  tick(frameOrPlaying: TimelineFrame | boolean) {
    const frame = typeof frameOrPlaying === 'boolean' ? null : frameOrPlaying;
    for (const [moduleId, video] of this.videos) {
      if (this.freeRun.has(moduleId)) {
        if (frame) this.syncFreeRunVideo(moduleId, video, frame);
        else if (frameOrPlaying === false && !video.paused) video.pause();
        else if (frameOrPlaying === true && video.paused) void video.play().catch(() => {});
        continue;
      }
      if (this.controlledSyncStates.has(moduleId)) {
        if (frameOrPlaying === false && !video.paused) video.pause();
        continue;
      }
      if (!video.paused) video.pause();
    }
  }

  /**
   * Timeline-authoritative actuator for effects that remap source time.
   * The timeline supplies the target and rate every frame, but the media element
   * is allowed to decode continuously between bounded corrections. Seeking on
   * every rAF leaves long-GOP video perpetually in HAVE_METADATA and can trigger
   * hundreds of redundant decodes per presentation frame.
   */
  syncControlledModule(
    moduleId: string,
    targetSeconds: number,
    playbackRate: number,
    frame: TimelineFrame,
    controlGeneration = 0
  ) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.delete(moduleId);
    const video = this.videos.get(moduleId);
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    const previous = this.controlledSyncStates.get(moduleId);
    const target = timelineMediaTarget(targetSeconds, video.duration)!;
    this.moduleTimelineTargets.set(moduleId, target);
    const rate = Math.max(0.25, Math.min(4, playbackRate));
    const timelineChanged = previous?.timelineGeneration !== frame.generation;
    const controlChanged = previous?.controlGeneration !== controlGeneration;
    const starting = previous?.playing !== true;

    if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;

    let lastCorrection = previous?.lastCorrectionContextSeconds ?? Number.NEGATIVE_INFINITY;
    if (!frame.playing) {
      if (!video.paused) video.pause();
      const targetApplied = timelineChanged || controlChanged || previous?.playing
        ? this.seekForSync(video, target, 1 / 30)
        : true;
      this.controlledSyncStates.set(moduleId, {
        timelineGeneration: targetApplied ? frame.generation : previous?.timelineGeneration ?? -1,
        controlGeneration: targetApplied ? controlGeneration : previous?.controlGeneration ?? -1,
        playing: false,
        playbackRate: rate,
        lastCorrectionContextSeconds: frame.contextTimeSeconds
      });
      return;
    }

    let targetApplied = true;
    if (timelineChanged || controlChanged || starting) {
      targetApplied = this.seekForSync(video, target, 1 / 30);
      if (targetApplied) lastCorrection = frame.contextTimeSeconds;
    } else if (frame.contextTimeSeconds - lastCorrection >= VIDEO_DRIFT_CHECK_INTERVAL_SECONDS) {
      lastCorrection = frame.contextTimeSeconds;
      const drift = timelineMediaDrift(video.currentTime, target, video.duration);
      if (Math.abs(drift) >= VIDEO_DRIFT_CORRECTION_THRESHOLD_SECONDS) {
        this.seekForSync(video, target, VIDEO_DRIFT_CORRECTION_THRESHOLD_SECONDS);
      }
    }

    if (video.paused) void video.play().catch(() => {});
    this.controlledSyncStates.set(moduleId, {
      timelineGeneration: targetApplied ? frame.generation : previous?.timelineGeneration ?? -1,
      controlGeneration: targetApplied ? controlGeneration : previous?.controlGeneration ?? -1,
      playing: true,
      playbackRate: rate,
      lastCorrectionContextSeconds: lastCorrection
    });
  }

  private syncFreeRunVideo(moduleId: string, video: HTMLVideoElement, frame: TimelineFrame) {
    const previous = this.syncStates.get(moduleId);
    const rate = Math.max(0.25, Math.min(4, frame.playbackRate));
    const target = timelineMediaTarget(frame.positionSeconds, video.duration);
    if (target !== null) this.moduleTimelineTargets.set(moduleId, target);
    const generationChanged = previous?.generation !== frame.generation;
    const rateChanged = !previous || Math.abs(previous.playbackRate - rate) > 0.001;
    const starting = previous?.playing !== true;

    if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;

    if (!frame.playing) {
      if (!video.paused) video.pause();
      if ((generationChanged || previous?.playing) && target !== null) {
        this.seekForSync(video, target, 1 / 120);
      }
      this.syncStates.set(moduleId, {
        generation: frame.generation,
        playing: false,
        playbackRate: rate,
        lastCorrectionContextSeconds: frame.contextTimeSeconds
      });
      return;
    }

    let lastCorrection = previous?.lastCorrectionContextSeconds ?? Number.NEGATIVE_INFINITY;
    let cadenceCheck = false;
    if ((generationChanged || rateChanged || starting) && target !== null) {
      this.seekForSync(video, target, 0.05);
      lastCorrection = frame.contextTimeSeconds;
    } else if (
      target !== null &&
      frame.contextTimeSeconds - lastCorrection >= VIDEO_DRIFT_CHECK_INTERVAL_SECONDS
    ) {
      cadenceCheck = true;
      lastCorrection = frame.contextTimeSeconds;
      const drift = timelineMediaDrift(video.currentTime, target, video.duration);
      if (Math.abs(drift) >= VIDEO_DRIFT_CORRECTION_THRESHOLD_SECONDS) {
        this.seekForSync(video, target, VIDEO_DRIFT_CORRECTION_THRESHOLD_SECONDS);
      }
    }

    if (video.paused && (generationChanged || rateChanged || starting || cadenceCheck)) {
      void video.play().catch(() => {});
    }
    this.syncStates.set(moduleId, {
      generation: frame.generation,
      playing: true,
      playbackRate: rate,
      lastCorrectionContextSeconds: lastCorrection
    });
  }

  private seekForSync(video: HTMLVideoElement, targetSeconds: number, thresholdSeconds: number) {
    if (video.seeking) return false;
    const drift = timelineMediaDrift(video.currentTime, targetSeconds, video.duration);
    if (Math.abs(drift) > thresholdSeconds) video.currentTime = targetSeconds;
    return true;
  }

  setModuleRate(moduleId: string, rate: number) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.delete(moduleId);
    const clamped = Math.max(0.25, Math.min(4, rate));
    this.moduleRates.set(moduleId, clamped);
    const video = this.videos.get(moduleId);
    if (video) {
      if (!video.paused) video.pause();
      video.playbackRate = clamped;
    }
  }

  actuateModuleTime(moduleId: string, seconds: number) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.delete(moduleId);
    const video = this.videos.get(moduleId);
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (!video.paused) video.pause();
    video.playbackRate = 1;
    if (video.seeking) return;
    const target = timelineMediaTarget(seconds, video.duration)!;
    if (Math.abs(video.currentTime - target) > 1 / 120) video.currentTime = target;
  }

  seekModule(moduleId: string, seconds: number) {
    moduleId = this.sourceId(moduleId);
    this.freeRun.delete(moduleId);
    const video = this.videos.get(moduleId);
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (!video.paused) video.pause();
    if (video.seeking) return;
    const target = timelineMediaTarget(seconds, video.duration)!;
    if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
  }

  async detach(moduleId: string): Promise<void> {
    moduleId = this.sourceId(moduleId);
    this.generations.set(moduleId, (this.generations.get(moduleId) ?? 0) + 1);
    this.moduleRates.delete(moduleId);
    this.freeRun.delete(moduleId);
    this.syncStates.delete(moduleId);
    this.controlledSyncStates.delete(moduleId);
    this.moduleTimelineTargets.delete(moduleId);
    this.armedStates.delete(moduleId);
    for (const pending of this.pending.values()) {
      if (pending.moduleId === moduleId) pending.controller.abort();
    }
    const active = this.videos.get(moduleId);
    this.videos.delete(moduleId);
    this.urls.delete(moduleId);
    const staged = [...this.candidates.values()].filter((candidate) => candidate.moduleId === moduleId);
    for (const candidate of staged) {
      this.candidates.delete(candidate.token);
      this.candidateControllers.get(candidate.token)?.abort();
      this.candidateControllers.delete(candidate.token);
    }
    await Promise.all([
      ...(active ? [this.destroyElement(active)] : []),
      ...staged.map((candidate) => this.destroyElement(candidate.video))
    ]);
  }

  async dispose(): Promise<void> {
    const ids = new Set([
      ...this.videos.keys(),
      ...Array.from(this.candidates.values()).map((candidate) => candidate.moduleId),
      ...Array.from(this.pending.values()).map(({ moduleId }) => moduleId)
    ]);
    const pending = [...this.pending.values()].map(({ promise }) => promise.catch(() => null));
    await Promise.all([...ids].map((id) => this.detach(id)));
    await Promise.all(pending);
  }
}

export const videoPool = new VideoPool();

/** Wait until a seeked frame is presented — `seeked` alone can race the compositor. */
export function waitForPresentedVideoFrame(
  video: HTMLVideoElement,
  timeoutMs = VIDEO_FRAME_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let frameHandle: number | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      if (frameHandle !== undefined && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameHandle);
      }
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (frameHandle !== undefined && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameHandle);
      }
      reject(new Error('video-candidate-invalidated'));
    };
    const timeout = setTimeout(finish, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    if (typeof video.requestVideoFrameCallback === 'function') {
      frameHandle = video.requestVideoFrameCallback(finish);
    } else {
      queueMicrotask(() => queueMicrotask(finish));
    }
  });
}
