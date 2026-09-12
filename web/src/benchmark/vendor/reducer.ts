import { nextGrooveBeat } from "./groove";
import { randomSlice } from "./random";
import type {
  TimeSamplerAccentEvent,
  TimeSamplerOutput,
  TimeSamplerParams,
  TimeSamplerQueuedParams,
  TimeSamplerReduction,
  TimeSamplerState,
  TimeSamplerTransportSample,
  TimeSamplerTriggerEvent,
  TimeSamplerTriggerKind,
} from "./types";

const BOUNDARY_EPSILON = 1e-9;
const SOURCE_EPSILON = 1e-9;
const ONSET_COOLDOWN_SECONDS = 0.25;

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function integerAtLeastOne(value: number): number {
  return Math.max(1, Math.round(positiveFinite(value, 1)));
}

function normalizeParams(params: TimeSamplerParams): TimeSamplerParams {
  return {
    ...params,
    sourceDurationSeconds: positiveFinite(params.sourceDurationSeconds, 0),
    sliceCount: integerAtLeastOne(params.sliceCount),
    jumpSizeBeats: positiveFinite(params.jumpSizeBeats, 1),
    loopCount: integerAtLeastOne(params.loopCount),
    playbackRate: positiveFinite(params.playbackRate, 1),
    randomSeed: params.randomSeed >>> 0,
    forcedJumpSeed: (params.forcedJumpSeed ?? params.randomSeed) >>> 0,
  };
}

function effectiveSliceCount(
  sourceDurationSeconds: number,
  requestedSliceCount: number,
  jumpSizeBeats: number,
  beatIntervalSeconds: number,
): number {
  const requestedSliceDuration =
    jumpSizeBeats *
    positiveFinite(beatIntervalSeconds, 0);

  if (
    sourceDurationSeconds <= 0 ||
    (requestedSliceDuration > 0 &&
      sourceDurationSeconds + SOURCE_EPSILON < requestedSliceDuration)
  ) {
    return 1;
  }

  return integerAtLeastOne(requestedSliceCount);
}

function initialSlice(mode: TimeSamplerParams["mode"], sliceCount: number): number {
  return mode === "REV" ? sliceCount - 1 : 0;
}

/**
 * The next slice boundary, on the rack's groove.
 *
 * This was a plain even grid, so TIMESAMPLER jumped straight through a swung
 * song no matter what the PGM rail was set to -- the one module whose whole job
 * is landing on the beat was the one ignoring the groove.
 */
function boundaryAfter(
  beatPosition: number,
  jumpSizeBeats: number,
  feel: 0 | 1 | 2 = 0,
): number {
  return nextGrooveBeat(beatPosition + BOUNDARY_EPSILON, jumpSizeBeats, feel);
}

function clampSlice(slice: number, sliceCount: number): number {
  return Math.min(Math.max(Math.round(slice), 0), sliceCount - 1);
}

function sourceTimestamp(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
): number {
  const count = effectiveSliceCount(
    state.sourceDurationSeconds,
    state.sliceCount,
    state.jumpSizeBeats,
    state.beatIntervalSeconds,
  );
  const slice = clampSlice(state.activeSlice, count);
  const sliceDuration = state.sourceDurationSeconds / count;
  const sliceStart = slice * sliceDuration;
  const elapsedSeconds =
    Math.max(0, sample.transportSeconds - state.sourceAnchorTransportSeconds) *
    state.playbackRate;
  const timestamp = Math.min(
    state.sourceDurationSeconds,
    sliceStart +
      Math.min(
        sliceDuration,
        state.sourceAnchorOffsetSeconds + elapsedSeconds,
      ),
  );

  return Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0;
}

function outputFor(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
  jumpReason: TimeSamplerOutput["jumpReason"],
  accent: TimeSamplerAccentEvent | null,
): TimeSamplerOutput {
  return {
    activeSlice: state.activeSlice,
    effectiveSliceCount: effectiveSliceCount(
      state.sourceDurationSeconds,
      state.sliceCount,
      state.jumpSizeBeats,
      state.beatIntervalSeconds,
    ),
    sourceTimestampSeconds: sourceTimestamp(state, sample),
    targetPlaybackRate: state.playbackRate,
    jumpGeneration: state.jumpGeneration,
    jumpReason,
    accent,
    mode: state.mode,
    loopIteration: state.loopIteration,
    loopCount: state.loopCount,
  };
}

export function createTimeSamplerState(
  sample: TimeSamplerTransportSample,
  inputParams: TimeSamplerParams,
): TimeSamplerReduction {
  const params = normalizeParams(inputParams);
  const count = effectiveSliceCount(
    params.sourceDurationSeconds,
    params.sliceCount,
    params.jumpSizeBeats,
    sample.beatIntervalSeconds,
  );
  const state: TimeSamplerState = {
    activeSlice: initialSlice(params.mode, count),
    pongDirection: 1,
    loopIteration: 1,
    jumpGeneration: 0,
    discontinuityGeneration: sample.discontinuityGeneration,
    nextBoundaryBeat: boundaryAfter(
      sample.beatPosition,
      params.jumpSizeBeats,
      params.feel,
    ),
    sliceStartedBeat: sample.beatPosition,
    sourceAnchorTransportSeconds: sample.transportSeconds,
    sourceAnchorOffsetSeconds: 0,
    beatIntervalSeconds: positiveFinite(sample.beatIntervalSeconds, 0),
    rndSeed: params.randomSeed,
    rndState: params.randomSeed,
    forcedJumpSeed: params.forcedJumpSeed ?? params.randomSeed,
    forcedJumpState: params.forcedJumpSeed ?? params.randomSeed,
    pendingTrigger: null,
    lastAcceptedOnsetTransportSeconds: null,
    sourceDurationSeconds: params.sourceDurationSeconds,
    sliceCount: params.sliceCount,
    mode: params.mode,
    jumpSizeBeats: params.jumpSizeBeats,
    loopCount: params.loopCount,
    playbackRate: params.playbackRate,
    accentMode: params.accentMode,
    feel: params.feel ?? 0,
    queuedParams: null,
    lastTransportSeconds: sample.transportSeconds,
    lastBeatPosition: sample.beatPosition,
  };

  return {
    nextState: state,
    output: outputFor(state, sample, "initial", null),
  };
}

function queuedParamsFrom(
  state: TimeSamplerState,
  params: TimeSamplerParams,
): TimeSamplerQueuedParams | null {
  if (
    params.mode === state.mode &&
    params.jumpSizeBeats === state.jumpSizeBeats &&
    params.loopCount === state.loopCount
  ) {
    return null;
  }

  return {
    mode: params.mode,
    jumpSizeBeats: params.jumpSizeBeats,
    loopCount: params.loopCount,
  };
}

function triggerPriority(trigger: TimeSamplerTriggerKind): number {
  if (trigger === "manual-trigger") return 3;
  if (trigger === "midi-trigger") return 2;
  return 1;
}

function acceptTriggers(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
  events: readonly TimeSamplerTriggerEvent[],
): void {
  for (const event of events) {
    const eventTime = event.transportSeconds ?? sample.transportSeconds;
    if (
      event.type === "onset-trigger" &&
      state.lastAcceptedOnsetTransportSeconds !== null &&
      eventTime - state.lastAcceptedOnsetTransportSeconds <
        ONSET_COOLDOWN_SECONDS - SOURCE_EPSILON
    ) {
      continue;
    }

    if (
      state.pendingTrigger !== null &&
      triggerPriority(event.type) < triggerPriority(state.pendingTrigger)
    ) {
      continue;
    }

    if (
      state.pendingTrigger !== null &&
      triggerPriority(event.type) === triggerPriority(state.pendingTrigger)
    ) {
      if (event.type === "onset-trigger") {
        state.lastAcceptedOnsetTransportSeconds = eventTime;
      }
      continue;
    }

    state.pendingTrigger = event.type;
    if (event.type === "onset-trigger") {
      state.lastAcceptedOnsetTransportSeconds = eventTime;
    }
  }
}

function applyQueuedParams(state: TimeSamplerState, boundaryBeat: number): void {
  const queued = state.queuedParams;
  if (queued === null) return;

  const modeChanged = queued.mode !== state.mode;
  state.mode = queued.mode;
  state.jumpSizeBeats = queued.jumpSizeBeats;
  state.loopCount = queued.loopCount;
  state.queuedParams = null;

  if (modeChanged) {
    state.pongDirection = 1;
  }
  state.nextBoundaryBeat = boundaryAfter(boundaryBeat, state.jumpSizeBeats, state.feel);
}

function sequenceAdvance(state: TimeSamplerState, sliceCount: number): number {
  if (state.mode === "FWD") {
    return (state.activeSlice + 1) % sliceCount;
  }
  if (state.mode === "REV") {
    return (state.activeSlice - 1 + sliceCount) % sliceCount;
  }
  if (state.mode === "PONG") {
    let candidate = state.activeSlice + state.pongDirection;
    if (candidate < 0 || candidate >= sliceCount) {
      state.pongDirection = state.pongDirection === 1 ? -1 : 1;
      candidate = state.activeSlice + state.pongDirection;
    }
    return clampSlice(candidate, sliceCount);
  }

  const random = randomSlice(state.rndState, sliceCount, state.activeSlice);
  state.rndState = random.state;
  return random.slice;
}

function processBoundary(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
  boundaryBeat: number,
  boundaryTransportSeconds: number,
): { reason: "scheduled" | "forced"; accent: TimeSamplerAccentEvent } {
  applyQueuedParams(state, boundaryBeat);
  const count = effectiveSliceCount(
    state.sourceDurationSeconds,
    state.sliceCount,
    state.jumpSizeBeats,
    state.beatIntervalSeconds,
  );
  let reason: "scheduled" | "forced" = "scheduled";

  if (state.pendingTrigger !== null) {
    const random = randomSlice(
      state.forcedJumpState,
      count,
      state.activeSlice,
    );
    state.forcedJumpState = random.state;
    state.activeSlice = random.slice;
    state.pendingTrigger = null;
    state.loopIteration = 1;
    reason = "forced";
  } else if (state.loopIteration >= state.loopCount) {
    state.activeSlice = sequenceAdvance(state, count);
    state.loopIteration = 1;
  } else {
    state.loopIteration += 1;
  }

  state.activeSlice = clampSlice(state.activeSlice, count);
  state.sliceStartedBeat = boundaryBeat;
  state.sourceAnchorTransportSeconds = boundaryTransportSeconds;
  state.sourceAnchorOffsetSeconds = 0;
  state.jumpGeneration += 1;

  return {
    reason,
    accent: {
      generation: state.jumpGeneration,
      mode: state.accentMode,
      transportSeconds: boundaryTransportSeconds,
      presentationTimeSeconds: sample.presentationTimeSeconds,
    },
  };
}

function resetForDiscontinuity(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
): void {
  const count = effectiveSliceCount(
    state.sourceDurationSeconds,
    state.sliceCount,
    state.jumpSizeBeats,
    state.beatIntervalSeconds,
  );
  state.activeSlice = initialSlice(state.mode, count);
  state.pongDirection = 1;
  state.loopIteration = 1;
  state.jumpGeneration += 1;
  state.discontinuityGeneration = sample.discontinuityGeneration;
  state.nextBoundaryBeat = boundaryAfter(
    sample.beatPosition,
    state.jumpSizeBeats,
    state.feel,
  );
  state.sliceStartedBeat = sample.beatPosition;
  state.sourceAnchorTransportSeconds = sample.transportSeconds;
  state.sourceAnchorOffsetSeconds = 0;
  state.pendingTrigger = null;
  state.lastAcceptedOnsetTransportSeconds = null;
  state.queuedParams = null;
  state.rndState = state.rndSeed;
  state.forcedJumpState = state.forcedJumpSeed;
}

function boundaryTransportSeconds(
  state: TimeSamplerState,
  sample: TimeSamplerTransportSample,
  boundaryBeat: number,
): number {
  if (sample.transportSecondsAtBeat) {
    return Math.min(
      sample.transportSeconds,
      Math.max(
        state.lastTransportSeconds,
        sample.transportSecondsAtBeat(boundaryBeat),
      ),
    );
  }

  if (Math.abs(sample.beatPosition - boundaryBeat) <= BOUNDARY_EPSILON) {
    return sample.transportSeconds;
  }

  const interval = positiveFinite(
    sample.beatIntervalSeconds,
    state.beatIntervalSeconds,
  );
  const estimated =
    sample.transportSeconds -
    (sample.beatPosition - boundaryBeat) * interval;

  return Math.min(
    sample.transportSeconds,
    Math.max(state.lastTransportSeconds, estimated),
  );
}

function orderedTimedTriggers(
  events: readonly TimeSamplerTriggerEvent[],
  sample: TimeSamplerTransportSample,
): TimeSamplerTriggerEvent[] {
  return events
    .map((event, index) => ({
      event: {
        ...event,
        transportSeconds: event.transportSeconds ?? sample.transportSeconds,
      },
      index,
    }))
    .sort(
      (left, right) =>
        (left.event.transportSeconds ?? 0) -
          (right.event.transportSeconds ?? 0) || left.index - right.index,
    )
    .map(({ event }) => event);
}

function sourceSliceStart(
  state: TimeSamplerState,
  effectiveCount: number,
): number {
  return (
    clampSlice(state.activeSlice, effectiveCount) *
    (state.sourceDurationSeconds / effectiveCount)
  );
}

export function reduceTimeSampler(
  previousState: TimeSamplerState,
  sample: TimeSamplerTransportSample,
  orderedTriggerEvents: readonly TimeSamplerTriggerEvent[],
  inputParams: TimeSamplerParams,
): TimeSamplerReduction {
  const params = normalizeParams(inputParams);
  const state: TimeSamplerState = { ...previousState };
  let jumpReason: TimeSamplerOutput["jumpReason"] = null;
  let accent: TimeSamplerAccentEvent | null = null;

  const discontinuity =
    sample.discontinuityGeneration !== state.discontinuityGeneration ||
    sample.transportSeconds + SOURCE_EPSILON < state.lastTransportSeconds ||
    sample.beatPosition + BOUNDARY_EPSILON < state.lastBeatPosition;

  if (discontinuity) {
    state.playbackRate = params.playbackRate;
    state.accentMode = params.accentMode;
    // Groove follows the rail live: flipping STR8/SWNG/DOT mid-song should
    // move the next boundary, not wait for a clip change to take effect.
    state.feel = params.feel ?? 0;
    state.beatIntervalSeconds = positiveFinite(sample.beatIntervalSeconds, 0);
    state.sourceDurationSeconds = params.sourceDurationSeconds;
    state.sliceCount = params.sliceCount;
    state.rndSeed = params.randomSeed;
    state.forcedJumpSeed = params.forcedJumpSeed ?? params.randomSeed;
    resetForDiscontinuity(state, sample);
    jumpReason = "discontinuity";
  } else {
    const timedTriggers = orderedTimedTriggers(orderedTriggerEvents, sample);
    let triggerIndex = 0;
    const acceptTriggersThrough = (transportSeconds: number) => {
      const accepted: TimeSamplerTriggerEvent[] = [];
      while (
        triggerIndex < timedTriggers.length &&
        (timedTriggers[triggerIndex].transportSeconds ??
          sample.transportSeconds) <=
          transportSeconds + SOURCE_EPSILON
      ) {
        accepted.push(timedTriggers[triggerIndex]);
        triggerIndex += 1;
      }
      acceptTriggers(state, sample, accepted);
    };

    while (
      state.nextBoundaryBeat <
      sample.beatPosition - BOUNDARY_EPSILON
    ) {
      const boundaryBeat = state.nextBoundaryBeat;
      const boundaryTime = boundaryTransportSeconds(
        state,
        sample,
        boundaryBeat,
      );
      acceptTriggersThrough(boundaryTime);
      processBoundary(state, sample, boundaryBeat, boundaryTime);
      if (state.nextBoundaryBeat === boundaryBeat) {
        state.nextBoundaryBeat = boundaryAfter(boundaryBeat, state.jumpSizeBeats, state.feel);
      }
    }

    const oldCount = effectiveSliceCount(
      state.sourceDurationSeconds,
      state.sliceCount,
      state.jumpSizeBeats,
      state.beatIntervalSeconds,
    );
    const oldSourceTimestamp = sourceTimestamp(state, sample);
    const oldSliceStart = sourceSliceStart(state, oldCount);
    const oldOffset = Math.max(0, oldSourceTimestamp - oldSliceStart);
    const rateChange = params.playbackRate !== state.playbackRate;
    const structuralChange =
      params.sourceDurationSeconds !== state.sourceDurationSeconds ||
      params.sliceCount !== state.sliceCount;

    state.playbackRate = params.playbackRate;
    state.accentMode = params.accentMode;
    // Groove follows the rail live: flipping STR8/SWNG/DOT mid-song should
    // move the next boundary, not wait for a clip change to take effect.
    state.feel = params.feel ?? 0;
    state.beatIntervalSeconds = positiveFinite(
      sample.beatIntervalSeconds,
      state.beatIntervalSeconds,
    );
    state.sourceDurationSeconds = params.sourceDurationSeconds;
    state.sliceCount = params.sliceCount;

    if (params.randomSeed !== state.rndSeed) {
      state.rndSeed = params.randomSeed;
      state.rndState = params.randomSeed;
    }
    const forcedJumpSeed = params.forcedJumpSeed ?? params.randomSeed;
    if (forcedJumpSeed !== state.forcedJumpSeed) {
      state.forcedJumpSeed = forcedJumpSeed;
      state.forcedJumpState = forcedJumpSeed;
    }

    const newCount = effectiveSliceCount(
      state.sourceDurationSeconds,
      state.sliceCount,
      state.jumpSizeBeats,
      state.beatIntervalSeconds,
    );
    const effectiveCountChange = newCount !== oldCount;
    state.activeSlice = clampSlice(state.activeSlice, newCount);

    if (structuralChange || effectiveCountChange) {
      const newSliceDuration = state.sourceDurationSeconds / newCount;
      state.sourceAnchorTransportSeconds = sample.transportSeconds;
      state.sourceAnchorOffsetSeconds = Math.min(
        newSliceDuration,
        oldOffset,
      );
      const remappedSourceTimestamp = sourceTimestamp(state, sample);
      if (
        Math.abs(remappedSourceTimestamp - oldSourceTimestamp) > SOURCE_EPSILON
      ) {
        state.jumpGeneration += 1;
        jumpReason = "source-remap";
      }
    } else if (rateChange) {
      state.sourceAnchorTransportSeconds = sample.transportSeconds;
      state.sourceAnchorOffsetSeconds = oldOffset;
    }

    state.queuedParams = queuedParamsFrom(state, params);

    if (
      Math.abs(state.nextBoundaryBeat - sample.beatPosition) <=
      BOUNDARY_EPSILON
    ) {
      const boundaryBeat = state.nextBoundaryBeat;
      const boundaryTime = boundaryTransportSeconds(
        state,
        sample,
        boundaryBeat,
      );
      acceptTriggersThrough(boundaryTime);
      const boundary = processBoundary(
        state,
        sample,
        boundaryBeat,
        boundaryTime,
      );
      jumpReason = boundary.reason;
      accent = boundary.accent;
      if (state.nextBoundaryBeat === boundaryBeat) {
        state.nextBoundaryBeat = boundaryAfter(boundaryBeat, state.jumpSizeBeats, state.feel);
      }
    }

    acceptTriggersThrough(sample.transportSeconds);
  }

  state.lastTransportSeconds = sample.transportSeconds;
  state.lastBeatPosition = sample.beatPosition;

  return {
    nextState: state,
    output: outputFor(state, sample, jumpReason, accent),
  };
}
