const std = @import("std");
const testing = std.testing;
const json = std.json;
const ts = @import("timesampler");

const EPSILON: f64 = 1e-9;

const GrooveFixture = struct {
    cases: []GrooveCase,
};

const GrooveCase = struct {
    name: []const u8,
    input: GrooveInput,
    expected: GrooveExpected,
};

const GrooveInput = struct {
    beat: f64,
    intervalBeats: f64,
    feel: ts.PgmFeel,
};

const GrooveExpected = struct {
    segment: GrooveSegmentExpected,
    nextBeat: f64,
};

const GrooveSegmentExpected = struct {
    start: f64,
    length: f64,
    progress: f64,
};

const ReducerFixture = struct {
    cases: []ReducerCase,
};

const ReducerCase = struct {
    name: []const u8,
    input: ReducerInput,
    expected: ReducerExpected,
};

const ReducerInput = struct {
    fullPreviousState: ?JsonState = null,
    transport: JsonTransport,
    triggers: []JsonTrigger = &.{},
    params: JsonParams,
};

const ReducerExpected = struct {
    output: JsonOutput,
    nextState: JsonStatePartial,
};

const JsonTransport = struct {
    transportSeconds: f64,
    audioOutputTimeSeconds: f64 = 0,
    performanceTimeSeconds: f64 = 0,
    playing: bool = true,
    discontinuityGeneration: u32 = 0,
    beatPosition: f64,
    beatPhase: f64 = 0,
    beatIntervalSeconds: f64,
    presentationTimeSeconds: f64 = 0,
};

const JsonTrigger = struct {
    @"type": ts.TimeSamplerTriggerKind,
    transportSeconds: ?f64 = null,
};

const JsonParams = struct {
    sourceDurationSeconds: f64,
    sliceCount: u32,
    mode: ts.TimeSamplerMode,
    jumpSizeBeats: f64,
    loopCount: u32,
    playbackRate: f64,
    accentMode: ts.TimeSamplerAccentMode = .OFF,
    randomSeed: u32,
    forcedJumpSeed: ?u32 = null,
    feel: ?ts.PgmFeel = null,
};

const JsonOutput = struct {
    activeSlice: i32,
    effectiveSliceCount: u32,
    sourceTimestampSeconds: f64,
    targetPlaybackRate: f64,
    jumpGeneration: u32,
    jumpReason: ?ts.JumpReason,
    mode: ts.TimeSamplerMode,
    loopIteration: u32,
    loopCount: u32,
};

const JsonStatePartial = struct {
    activeSlice: i32,
    pongDirection: i8,
    loopIteration: u32,
    jumpGeneration: u32,
    nextBoundaryBeat: f64,
    sliceStartedBeat: f64,
    sourceAnchorTransportSeconds: f64,
    sourceAnchorOffsetSeconds: f64,
    mode: ts.TimeSamplerMode,
    loopCount: u32,
    pendingTrigger: ?ts.TimeSamplerTriggerKind,
};

const JsonState = struct {
    activeSlice: i32,
    pongDirection: i8,
    loopIteration: u32,
    jumpGeneration: u32,
    discontinuityGeneration: u32,
    nextBoundaryBeat: f64,
    sliceStartedBeat: f64,
    sourceAnchorTransportSeconds: f64,
    sourceAnchorOffsetSeconds: f64,
    beatIntervalSeconds: f64,
    rndSeed: u32,
    rndState: u32,
    forcedJumpSeed: u32,
    forcedJumpState: u32,
    pendingTrigger: ?ts.TimeSamplerTriggerKind,
    lastAcceptedOnsetTransportSeconds: ?f64,
    sourceDurationSeconds: f64,
    sliceCount: u32,
    mode: ts.TimeSamplerMode,
    jumpSizeBeats: f64,
    loopCount: u32,
    playbackRate: f64,
    accentMode: ts.TimeSamplerAccentMode,
    feel: ts.PgmFeel,
    queuedParams: ?JsonQueuedParams,
    lastTransportSeconds: f64,
    lastBeatPosition: f64,
};

const JsonQueuedParams = struct {
    mode: ts.TimeSamplerMode,
    jumpSizeBeats: f64,
    loopCount: u32,
};

fn approxEqual(expected: f64, actual: f64) !void {
    if (@abs(expected - actual) > EPSILON) {
        std.debug.print("float mismatch: expected {d}, got {d}\n", .{ expected, actual });
        return error.TestExpectedEqual;
    }
}

fn toTransport(j: JsonTransport) ts.TimeSamplerTransportSample {
    return .{
        .transport_seconds = j.transportSeconds,
        .audio_output_time_seconds = j.audioOutputTimeSeconds,
        .performance_time_seconds = j.performanceTimeSeconds,
        .playing = j.playing,
        .discontinuity_generation = j.discontinuityGeneration,
        .beat_position = j.beatPosition,
        .beat_phase = j.beatPhase,
        .beat_interval_seconds = j.beatIntervalSeconds,
        .presentation_time_seconds = j.presentationTimeSeconds,
    };
}

fn toParams(j: JsonParams) ts.TimeSamplerParams {
    return .{
        .source_duration_seconds = j.sourceDurationSeconds,
        .slice_count = j.sliceCount,
        .mode = j.mode,
        .jump_size_beats = j.jumpSizeBeats,
        .loop_count = j.loopCount,
        .playback_rate = j.playbackRate,
        .accent_mode = j.accentMode,
        .random_seed = j.randomSeed,
        .forced_jump_seed = j.forcedJumpSeed,
        .feel = j.feel,
    };
}

fn toTrigger(j: JsonTrigger) ts.TimeSamplerTriggerEvent {
    return .{
        .trigger_type = j.@"type",
        .transport_seconds = j.transportSeconds,
    };
}

fn toQueuedParams(j: JsonQueuedParams) ts.TimeSamplerQueuedParams {
    return .{
        .mode = j.mode,
        .jump_size_beats = j.jumpSizeBeats,
        .loop_count = j.loopCount,
    };
}

fn toState(j: JsonState) ts.TimeSamplerState {
    return .{
        .active_slice = j.activeSlice,
        .pong_direction = j.pongDirection,
        .loop_iteration = j.loopIteration,
        .jump_generation = j.jumpGeneration,
        .discontinuity_generation = j.discontinuityGeneration,
        .next_boundary_beat = j.nextBoundaryBeat,
        .slice_started_beat = j.sliceStartedBeat,
        .source_anchor_transport_seconds = j.sourceAnchorTransportSeconds,
        .source_anchor_offset_seconds = j.sourceAnchorOffsetSeconds,
        .beat_interval_seconds = j.beatIntervalSeconds,
        .rnd_seed = j.rndSeed,
        .rnd_state = j.rndState,
        .forced_jump_seed = j.forcedJumpSeed,
        .forced_jump_state = j.forcedJumpState,
        .pending_trigger = j.pendingTrigger,
        .last_accepted_onset_transport_seconds = j.lastAcceptedOnsetTransportSeconds,
        .source_duration_seconds = j.sourceDurationSeconds,
        .slice_count = j.sliceCount,
        .mode = j.mode,
        .jump_size_beats = j.jumpSizeBeats,
        .loop_count = j.loopCount,
        .playback_rate = j.playbackRate,
        .accent_mode = j.accentMode,
        .feel = j.feel,
        .queued_params = if (j.queuedParams) |q| toQueuedParams(q) else null,
        .last_transport_seconds = j.lastTransportSeconds,
        .last_beat_position = j.lastBeatPosition,
    };
}

fn readFixture(comptime T: type, allocator: std.mem.Allocator, path: []const u8) !json.Parsed(T) {
    const contents = try std.Io.Dir.cwd().readFileAlloc(
        testing.io,
        path,
        allocator,
        .limited(1024 * 1024),
    );
    defer allocator.free(contents);
    return json.parseFromSlice(T, allocator, contents, .{ .ignore_unknown_fields = true });
}

fn expectOutput(expected: JsonOutput, actual: ts.TimeSamplerOutput) !void {
    try testing.expectEqual(expected.activeSlice, actual.active_slice);
    try testing.expectEqual(expected.effectiveSliceCount, actual.effective_slice_count);
    try approxEqual(expected.sourceTimestampSeconds, actual.source_timestamp_seconds);
    try approxEqual(expected.targetPlaybackRate, actual.target_playback_rate);
    try testing.expectEqual(expected.jumpGeneration, actual.jump_generation);
    try testing.expect(expected.jumpReason == actual.jump_reason);
    if (expected.jumpReason) |reason| {
        try testing.expectEqual(reason, actual.jump_reason.?);
    }
    try testing.expectEqual(expected.mode, actual.mode);
    try testing.expectEqual(expected.loopIteration, actual.loop_iteration);
    try testing.expectEqual(expected.loopCount, actual.loop_count);
}

fn expectStatePartial(expected: JsonStatePartial, actual: ts.TimeSamplerState) !void {
    try testing.expectEqual(expected.activeSlice, actual.active_slice);
    try testing.expectEqual(expected.pongDirection, actual.pong_direction);
    try testing.expectEqual(expected.loopIteration, actual.loop_iteration);
    try testing.expectEqual(expected.jumpGeneration, actual.jump_generation);
    try approxEqual(expected.nextBoundaryBeat, actual.next_boundary_beat);
    try approxEqual(expected.sliceStartedBeat, actual.slice_started_beat);
    try approxEqual(expected.sourceAnchorTransportSeconds, actual.source_anchor_transport_seconds);
    try approxEqual(expected.sourceAnchorOffsetSeconds, actual.source_anchor_offset_seconds);
    try testing.expectEqual(expected.mode, actual.mode);
    try testing.expectEqual(expected.loopCount, actual.loop_count);
    try testing.expect(expected.pendingTrigger == actual.pending_trigger);
    if (expected.pendingTrigger) |pending| {
        try testing.expectEqual(pending, actual.pending_trigger.?);
    }
}

fn runGrooveFixture(allocator: std.mem.Allocator, filename: []const u8) !void {
    const parsed = try readFixture(GrooveFixture, allocator, filename);
    defer parsed.deinit();

    for (parsed.value.cases) |case| {
        const segment = ts.grooveSegment(
            case.input.beat,
            case.input.intervalBeats,
            case.input.feel,
        );
        try approxEqual(case.expected.segment.start, segment.start);
        try approxEqual(case.expected.segment.length, segment.length);
        try approxEqual(case.expected.segment.progress, segment.progress);

        const next_beat = ts.nextGrooveBeat(
            case.input.beat,
            case.input.intervalBeats,
            case.input.feel,
        );
        try approxEqual(case.expected.nextBeat, next_beat);
    }
}

fn runReducerFixture(allocator: std.mem.Allocator, filename: []const u8) !void {
    const parsed = try readFixture(ReducerFixture, allocator, filename);
    defer parsed.deinit();

    for (parsed.value.cases) |case| {
        const transport = toTransport(case.input.transport);
        const params = toParams(case.input.params);

        var triggers = try allocator.alloc(ts.TimeSamplerTriggerEvent, case.input.triggers.len);
        defer allocator.free(triggers);
        for (case.input.triggers, 0..) |jt, i| {
            triggers[i] = toTrigger(jt);
        }

        const reduction = if (case.input.fullPreviousState) |json_state| blk: {
            const previous = toState(json_state);
            break :blk try ts.reduceTimeSampler(allocator, previous, transport, triggers, params);
        } else blk: {
            break :blk ts.createTimeSamplerState(transport, params);
        };

        try expectOutput(case.expected.output, reduction.output);
        try expectStatePartial(case.expected.nextState, reduction.next_state);
    }
}

test "groove.json oracle" {
    try runGrooveFixture(testing.allocator, "../fixtures/groove.json");
}

test "chop-reducer-initial.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/chop-reducer-initial.json");
}

test "chop-reducer-scheduled.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/chop-reducer-scheduled.json");
}

test "chop-reducer-forced-trigger.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/chop-reducer-forced-trigger.json");
}

test "chop-reducer-pong.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/chop-reducer-pong.json");
}

test "chop-reducer-rnd.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/chop-reducer-rnd.json");
}

test "seek-settlement-discontinuity.json oracle" {
    try runReducerFixture(testing.allocator, "../fixtures/seek-settlement-discontinuity.json");
}
