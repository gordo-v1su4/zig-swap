/**
 * Generate JSON oracle fixtures from webgpu-research timesampler (do not redesign semantics).
 * Run: bun run core/fixtures/generate-timesampler-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grooveSegment, nextGrooveBeat } from '../../../webgpu-research/lab/browser/deck-pgm/src/timesampler/groove.ts';
import {
  createTimeSamplerState,
  reduceTimeSampler,
} from '../../../webgpu-research/lab/browser/deck-pgm/src/timesampler/reducer.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;

const ORACLE =
  'webgpu-research/lab/browser/deck-pgm/src/timesampler/';

function pickOutput(output) {
  return {
    activeSlice: output.activeSlice,
    effectiveSliceCount: output.effectiveSliceCount,
    sourceTimestampSeconds: output.sourceTimestampSeconds,
    targetPlaybackRate: output.targetPlaybackRate,
    jumpGeneration: output.jumpGeneration,
    jumpReason: output.jumpReason,
    mode: output.mode,
    loopIteration: output.loopIteration,
    loopCount: output.loopCount,
  };
}

function pickState(state) {
  return {
    activeSlice: state.activeSlice,
    pongDirection: state.pongDirection,
    loopIteration: state.loopIteration,
    jumpGeneration: state.jumpGeneration,
    nextBoundaryBeat: state.nextBoundaryBeat,
    sliceStartedBeat: state.sliceStartedBeat,
    sourceAnchorTransportSeconds: state.sourceAnchorTransportSeconds,
    sourceAnchorOffsetSeconds: state.sourceAnchorOffsetSeconds,
    mode: state.mode,
    loopCount: state.loopCount,
    pendingTrigger: state.pendingTrigger,
  };
}

/** Full reducer state for native spike harness replay (V1S-73, V1S-74). */
function serializeFullState(state) {
  if (state === null) return null;
  return {
    activeSlice: state.activeSlice,
    pongDirection: state.pongDirection,
    loopIteration: state.loopIteration,
    jumpGeneration: state.jumpGeneration,
    discontinuityGeneration: state.discontinuityGeneration,
    nextBoundaryBeat: state.nextBoundaryBeat,
    sliceStartedBeat: state.sliceStartedBeat,
    sourceAnchorTransportSeconds: state.sourceAnchorTransportSeconds,
    sourceAnchorOffsetSeconds: state.sourceAnchorOffsetSeconds,
    beatIntervalSeconds: state.beatIntervalSeconds,
    rndSeed: state.rndSeed,
    rndState: state.rndState,
    forcedJumpSeed: state.forcedJumpSeed,
    forcedJumpState: state.forcedJumpState,
    pendingTrigger: state.pendingTrigger,
    lastAcceptedOnsetTransportSeconds: state.lastAcceptedOnsetTransportSeconds,
    sourceDurationSeconds: state.sourceDurationSeconds,
    sliceCount: state.sliceCount,
    mode: state.mode,
    jumpSizeBeats: state.jumpSizeBeats,
    loopCount: state.loopCount,
    playbackRate: state.playbackRate,
    accentMode: state.accentMode,
    feel: state.feel,
    queuedParams: state.queuedParams,
    lastTransportSeconds: state.lastTransportSeconds,
    lastBeatPosition: state.lastBeatPosition,
  };
}

function reducerInput(previousState, transport, triggers, params) {
  return {
    previousState: previousState === null ? null : pickState(previousState),
    fullPreviousState: serializeFullState(previousState),
    transport,
    triggers,
    params,
  };
}

function baseTransport(overrides = {}) {
  return {
    transportSeconds: 0,
    audioOutputTimeSeconds: 0,
    performanceTimeSeconds: 0,
    playing: true,
    discontinuityGeneration: 0,
    beatPosition: 0,
    beatPhase: 0,
    beatIntervalSeconds: 0.5,
    presentationTimeSeconds: 0,
    ...overrides,
  };
}

function baseParams(overrides = {}) {
  return {
    sourceDurationSeconds: 8,
    sliceCount: 4,
    mode: 'FWD',
    jumpSizeBeats: 1,
    loopCount: 2,
    playbackRate: 1,
    accentMode: 'OFF',
    randomSeed: 0x12345678,
    feel: 0,
    ...overrides,
  };
}

function writeFixture(name, body) {
  const path = resolve(OUT, name);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path}`);
}

function runReducerCase(name, previousState, transport, triggers, params) {
  const reduction =
    previousState === null
      ? createTimeSamplerState(transport, params)
      : reduceTimeSampler(previousState, transport, triggers, params);

  return {
    name,
    input: reducerInput(previousState, transport, triggers, params),
    expected: {
      output: pickOutput(reduction.output),
      nextState: pickState(reduction.nextState),
    },
    fullNextState: reduction.nextState,
  };
}

mkdirSync(OUT, { recursive: true });

// --- groove ---
const grooveCases = [
  { beat: 0, intervalBeats: 1, feel: 0 },
  { beat: 0.5, intervalBeats: 1, feel: 0 },
  { beat: 1.75, intervalBeats: 0.5, feel: 1 },
  { beat: 2.1, intervalBeats: 0.5, feel: 1 },
  { beat: 0, intervalBeats: 0.75, feel: 2 },
  { beat: 1.5, intervalBeats: 0.75, feel: 2 },
].map(({ beat, intervalBeats, feel }) => ({
  name: `beat=${beat} interval=${intervalBeats} feel=${feel}`,
  input: { beat, intervalBeats, feel },
  expected: {
    segment: grooveSegment(beat, intervalBeats, feel),
    nextBeat: nextGrooveBeat(beat + 1e-9, intervalBeats, feel),
  },
}));

writeFixture('groove.json', {
  oracle: ORACLE,
  module: 'groove.ts',
  version: 1,
  cases: grooveCases,
});

// --- initial chop state ---
const initTransport = baseTransport({ beatPosition: 0, transportSeconds: 10 });
const initParams = baseParams();
const initCase = runReducerCase('initial-fwd-quarter', null, initTransport, [], initParams);
let reducerState = initCase.fullNextState;

writeFixture('chop-reducer-initial.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: [{ name: initCase.name, input: initCase.input, expected: initCase.expected }],
});

// --- scheduled boundary advance (loop then jump) ---
let state = reducerState;
const scheduledCases = [];

for (const step of [
  { beatPosition: 0.5, transportSeconds: 10.25, label: 'mid-slice-no-jump' },
  { beatPosition: 1, transportSeconds: 10.5, label: 'boundary-loop-iteration' },
  { beatPosition: 2, transportSeconds: 11, label: 'boundary-slice-advance' },
]) {
  const { label, ...transportFields } = step;
  const transport = baseTransport({
    discontinuityGeneration: 0,
    beatIntervalSeconds: 0.5,
    ...transportFields,
  });
  const params = baseParams();
  const reduction = reduceTimeSampler(state, transport, [], params);
  scheduledCases.push({
    name: label,
    input: reducerInput(state, transport, [], params),
    expected: {
      output: pickOutput(reduction.output),
      nextState: pickState(reduction.nextState),
    },
  });
  state = reduction.nextState;
}

writeFixture('chop-reducer-scheduled.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: scheduledCases,
});

// --- seek / discontinuity settlement ---
const seekBase = createTimeSamplerState(
  baseTransport({ beatPosition: 4, transportSeconds: 12 }),
  baseParams({ mode: 'FWD', loopCount: 1, jumpSizeBeats: 1 }),
);

const seekTransport = baseTransport({
  beatPosition: 1,
  transportSeconds: 8,
  discontinuityGeneration: 1,
});

const seekReduction = reduceTimeSampler(
  seekBase.nextState,
  seekTransport,
  [],
  baseParams({ mode: 'FWD', loopCount: 1, jumpSizeBeats: 1 }),
);

writeFixture('seek-settlement-discontinuity.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: [
    {
      name: 'transport-rewind-resets-slice',
      input: reducerInput(
        seekBase.nextState,
        seekTransport,
        [],
        baseParams({ mode: 'FWD', loopCount: 1, jumpSizeBeats: 1 }),
      ),
      expected: {
        output: pickOutput(seekReduction.output),
        nextState: pickState(seekReduction.nextState),
      },
    },
  ],
});

// --- forced trigger at boundary ---
const forcedInit = createTimeSamplerState(
  baseTransport({ beatPosition: 0, transportSeconds: 0 }),
  baseParams({ mode: 'FWD', sliceCount: 8, loopCount: 4, jumpSizeBeats: 1 }),
);
const forcedTransport = baseTransport({
  beatPosition: 1,
  transportSeconds: 0.5,
});
const forcedReduction = reduceTimeSampler(
  forcedInit.nextState,
  forcedTransport,
  [{ type: 'manual-trigger', transportSeconds: 0.5 }],
  baseParams({ mode: 'FWD', sliceCount: 8, loopCount: 4, jumpSizeBeats: 1 }),
);

writeFixture('chop-reducer-forced-trigger.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: [
    {
      name: 'manual-trigger-forced-jump',
      input: reducerInput(
        forcedInit.nextState,
        forcedTransport,
        [{ type: 'manual-trigger', transportSeconds: 0.5 }],
        baseParams({ mode: 'FWD', sliceCount: 8, loopCount: 4, jumpSizeBeats: 1 }),
      ),
      expected: {
        output: pickOutput(forcedReduction.output),
        nextState: pickState(forcedReduction.nextState),
      },
    },
  ],
});

// --- PONG mode sequence ---
const pongInit = createTimeSamplerState(
  baseTransport({ beatPosition: 0, transportSeconds: 0 }),
  baseParams({ mode: 'PONG', sliceCount: 3, loopCount: 1, jumpSizeBeats: 1 }),
);
let pongState = pongInit.nextState;
const pongCases = [pongInit].map((r) => ({
  name: 'pong-initial',
  input: reducerInput(null, baseTransport(), [], baseParams({ mode: 'PONG', sliceCount: 3, loopCount: 1, jumpSizeBeats: 1 })),
  expected: { output: pickOutput(r.output), nextState: pickState(r.nextState) },
}));

for (let i = 1; i <= 3; i += 1) {
  const transport = baseTransport({ beatPosition: i, transportSeconds: i * 0.5 });
  const params = baseParams({ mode: 'PONG', sliceCount: 3, loopCount: 1, jumpSizeBeats: 1 });
  const reduction = reduceTimeSampler(pongState, transport, [], params);
  pongCases.push({
    name: `pong-boundary-${i}`,
    input: reducerInput(pongState, transport, [], params),
    expected: {
      output: pickOutput(reduction.output),
      nextState: pickState(reduction.nextState),
    },
  });
  pongState = reduction.nextState;
}

writeFixture('chop-reducer-pong.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: pongCases,
});

// --- RND mode with fixed seed ---
const rndInit = createTimeSamplerState(
  baseTransport({ beatPosition: 0, transportSeconds: 0 }),
  baseParams({ mode: 'RND', sliceCount: 6, loopCount: 1, jumpSizeBeats: 1, randomSeed: 0xdeadbeef }),
);
const rndTransport = baseTransport({ beatPosition: 1, transportSeconds: 0.5 });
const rndReduction = reduceTimeSampler(
  rndInit.nextState,
  rndTransport,
  [],
  baseParams({ mode: 'RND', sliceCount: 6, loopCount: 1, jumpSizeBeats: 1, randomSeed: 0xdeadbeef }),
);

writeFixture('chop-reducer-rnd.json', {
  oracle: ORACLE,
  module: 'reducer.ts',
  version: 1,
  cases: [
    {
      name: 'rnd-seeded-jump',
      input: reducerInput(
        rndInit.nextState,
        rndTransport,
        [],
        baseParams({ mode: 'RND', sliceCount: 6, loopCount: 1, jumpSizeBeats: 1, randomSeed: 0xdeadbeef }),
      ),
      expected: {
        output: pickOutput(rndReduction.output),
        nextState: pickState(rndReduction.nextState),
      },
    },
  ],
});

console.log('done');
