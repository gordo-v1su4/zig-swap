const std = @import("std");
const groove = @import("groove.zig");
const random = @import("random.zig");
const types = @import("types.zig");

const BOUNDARY_EPSILON: f64 = 1e-9;
const SOURCE_EPSILON: f64 = 1e-9;
const ONSET_COOLDOWN_SECONDS: f64 = 0.25;

const BoundaryResult = struct {
    reason: types.JumpReason,
    accent: types.TimeSamplerAccentEvent,
};

fn positiveFinite(value: f64, fallback: f64) f64 {
    if (std.math.isFinite(value) and value > 0) return value;
    return fallback;
}

fn integerAtLeastOne(value: f64) u32 {
    return @max(@as(u32, 1), @as(u32, @intFromFloat(@round(positiveFinite(value, 1)))));
}

fn normalizeParams(params: types.TimeSamplerParams) types.TimeSamplerParams {
    var normalized = params;
    normalized.source_duration_seconds = positiveFinite(params.source_duration_seconds, 0);
    normalized.slice_count = integerAtLeastOne(@floatFromInt(params.slice_count));
    normalized.jump_size_beats = positiveFinite(params.jump_size_beats, 1);
    normalized.loop_count = integerAtLeastOne(@floatFromInt(params.loop_count));
    normalized.playback_rate = positiveFinite(params.playback_rate, 1);
    normalized.random_seed = params.random_seed;
    normalized.forced_jump_seed = params.forced_jump_seed orelse params.random_seed;
    return normalized;
}

fn effectiveSliceCount(
    source_duration_seconds: f64,
    requested_slice_count: u32,
    jump_size_beats: f64,
    beat_interval_seconds: f64,
) u32 {
    const requested_slice_duration = jump_size_beats * positiveFinite(beat_interval_seconds, 0);

    if (source_duration_seconds <= 0 or
        (requested_slice_duration > 0 and
            source_duration_seconds + SOURCE_EPSILON < requested_slice_duration))
    {
        return 1;
    }

    return integerAtLeastOne(@floatFromInt(requested_slice_count));
}

fn initialSlice(mode: types.TimeSamplerMode, slice_count: u32) i32 {
    return if (mode == .REV) @as(i32, @intCast(slice_count)) - 1 else 0;
}

fn boundaryAfter(beat_position: f64, jump_size_beats: f64, feel: types.PgmFeel) f64 {
    return groove.nextGrooveBeat(beat_position + BOUNDARY_EPSILON, jump_size_beats, feel);
}

fn clampSlice(slice: i32, slice_count: u32) i32 {
    const max_slice = @as(i32, @intCast(slice_count)) - 1;
    return @min(@max(@as(i32, @intFromFloat(@round(@as(f64, @floatFromInt(slice))))), 0), max_slice);
}

fn sourceTimestamp(
    state: types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
) f64 {
    const count = effectiveSliceCount(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    const slice = clampSlice(state.active_slice, count);
    const slice_duration = state.source_duration_seconds / @as(f64, @floatFromInt(count));
    const slice_start = @as(f64, @floatFromInt(slice)) * slice_duration;
    const elapsed_seconds =
        @max(0, sample.transport_seconds - state.source_anchor_transport_seconds) *
        state.playback_rate;
    const timestamp = @min(
        state.source_duration_seconds,
        slice_start + @min(slice_duration, state.source_anchor_offset_seconds + elapsed_seconds),
    );

    if (std.math.isFinite(timestamp)) return @max(0, timestamp);
    return 0;
}

fn outputFor(
    state: types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
    jump_reason: ?types.JumpReason,
    accent: ?types.TimeSamplerAccentEvent,
) types.TimeSamplerOutput {
    return .{
        .active_slice = state.active_slice,
        .effective_slice_count = effectiveSliceCount(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        ),
        .source_timestamp_seconds = sourceTimestamp(state, sample),
        .target_playback_rate = state.playback_rate,
        .jump_generation = state.jump_generation,
        .jump_reason = jump_reason,
        .mode = state.mode,
        .loop_iteration = state.loop_iteration,
        .loop_count = state.loop_count,
        .accent = accent,
    };
}

pub fn createTimeSamplerState(
    sample: types.TimeSamplerTransportSample,
    input_params: types.TimeSamplerParams,
) types.TimeSamplerReduction {
    const params = normalizeParams(input_params);
    const count = effectiveSliceCount(
        params.source_duration_seconds,
        params.slice_count,
        params.jump_size_beats,
        sample.beat_interval_seconds,
    );
    const forced_seed = params.forced_jump_seed orelse params.random_seed;
    const state = types.TimeSamplerState{
        .active_slice = initialSlice(params.mode, count),
        .pong_direction = 1,
        .loop_iteration = 1,
        .jump_generation = 0,
        .discontinuity_generation = sample.discontinuity_generation,
        .next_boundary_beat = boundaryAfter(
            sample.beat_position,
            params.jump_size_beats,
            params.feel orelse 0,
        ),
        .slice_started_beat = sample.beat_position,
        .source_anchor_transport_seconds = sample.transport_seconds,
        .source_anchor_offset_seconds = 0,
        .beat_interval_seconds = positiveFinite(sample.beat_interval_seconds, 0),
        .rnd_seed = params.random_seed,
        .rnd_state = params.random_seed,
        .forced_jump_seed = forced_seed,
        .forced_jump_state = forced_seed,
        .pending_trigger = null,
        .last_accepted_onset_transport_seconds = null,
        .source_duration_seconds = params.source_duration_seconds,
        .slice_count = params.slice_count,
        .mode = params.mode,
        .jump_size_beats = params.jump_size_beats,
        .loop_count = params.loop_count,
        .playback_rate = params.playback_rate,
        .accent_mode = params.accent_mode,
        .feel = params.feel orelse 0,
        .queued_params = null,
        .last_transport_seconds = sample.transport_seconds,
        .last_beat_position = sample.beat_position,
    };

    return .{
        .next_state = state,
        .output = outputFor(state, sample, .initial, null),
    };
}

fn queuedParamsFrom(
    state: types.TimeSamplerState,
    params: types.TimeSamplerParams,
) ?types.TimeSamplerQueuedParams {
    if (params.mode == state.mode and
        params.jump_size_beats == state.jump_size_beats and
        params.loop_count == state.loop_count)
    {
        return null;
    }

    return .{
        .mode = params.mode,
        .jump_size_beats = params.jump_size_beats,
        .loop_count = params.loop_count,
    };
}

fn triggerPriority(trigger: types.TimeSamplerTriggerKind) u8 {
    return switch (trigger) {
        .@"manual-trigger" => 3,
        .@"midi-trigger" => 2,
        .@"onset-trigger" => 1,
    };
}

fn acceptTriggers(
    state: *types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
    events: []const types.TimeSamplerTriggerEvent,
) void {
    for (events) |event| {
        const event_time = event.transport_seconds orelse sample.transport_seconds;
        if (event.trigger_type == .@"onset-trigger" and
            state.last_accepted_onset_transport_seconds != null and
            event_time - state.last_accepted_onset_transport_seconds.? <
                ONSET_COOLDOWN_SECONDS - SOURCE_EPSILON)
        {
            continue;
        }

        if (state.pending_trigger) |pending| {
            if (triggerPriority(event.trigger_type) < triggerPriority(pending)) continue;

            if (triggerPriority(event.trigger_type) == triggerPriority(pending)) {
                if (event.trigger_type == .@"onset-trigger") {
                    state.last_accepted_onset_transport_seconds = event_time;
                }
                continue;
            }
        }

        state.pending_trigger = event.trigger_type;
        if (event.trigger_type == .@"onset-trigger") {
            state.last_accepted_onset_transport_seconds = event_time;
        }
    }
}

fn applyQueuedParams(state: *types.TimeSamplerState, boundary_beat: f64) void {
    const queued = state.queued_params orelse return;

    const mode_changed = queued.mode != state.mode;
    state.mode = queued.mode;
    state.jump_size_beats = queued.jump_size_beats;
    state.loop_count = queued.loop_count;
    state.queued_params = null;

    if (mode_changed) {
        state.pong_direction = 1;
    }
    state.next_boundary_beat = boundary_beat + state.jump_size_beats;
}

fn sequenceAdvance(state: *types.TimeSamplerState, slice_count: u32) i32 {
    switch (state.mode) {
        .FWD => return @rem(state.active_slice + 1, @as(i32, @intCast(slice_count))),
        .REV => return @rem(state.active_slice - 1 + @as(i32, @intCast(slice_count)), @as(i32, @intCast(slice_count))),
        .PONG => {
            var candidate = state.active_slice + state.pong_direction;
            if (candidate < 0 or candidate >= @as(i32, @intCast(slice_count))) {
                state.pong_direction = if (state.pong_direction == 1) -1 else 1;
                candidate = state.active_slice + state.pong_direction;
            }
            return clampSlice(candidate, slice_count);
        },
        .RND => {
            const rnd = random.randomSlice(state.rnd_state, slice_count, state.active_slice);
            state.rnd_state = rnd.state;
            return rnd.slice;
        },
    }
}

fn processBoundary(
    state: *types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
    boundary_beat: f64,
    boundary_transport_seconds: f64,
) BoundaryResult {
    applyQueuedParams(state, boundary_beat);
    const count = effectiveSliceCount(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    var reason: types.JumpReason = .scheduled;

    if (state.pending_trigger != null) {
        const rnd = random.randomSlice(state.forced_jump_state, count, state.active_slice);
        state.forced_jump_state = rnd.state;
        state.active_slice = rnd.slice;
        state.pending_trigger = null;
        state.loop_iteration = 1;
        reason = .forced;
    } else if (state.loop_iteration >= state.loop_count) {
        state.active_slice = sequenceAdvance(state, count);
        state.loop_iteration = 1;
    } else {
        state.loop_iteration += 1;
    }

    state.active_slice = clampSlice(state.active_slice, count);
    state.slice_started_beat = boundary_beat;
    state.source_anchor_transport_seconds = boundary_transport_seconds;
    state.source_anchor_offset_seconds = 0;
    state.jump_generation += 1;

    return .{
        .reason = reason,
        .accent = .{
            .generation = state.jump_generation,
            .mode = state.accent_mode,
            .transport_seconds = boundary_transport_seconds,
            .presentation_time_seconds = sample.presentation_time_seconds,
        },
    };
}

fn resetForDiscontinuity(
    state: *types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
) void {
    const count = effectiveSliceCount(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    state.active_slice = initialSlice(state.mode, count);
    state.pong_direction = 1;
    state.loop_iteration = 1;
    state.jump_generation += 1;
    state.discontinuity_generation = sample.discontinuity_generation;
    state.next_boundary_beat = boundaryAfter(
        sample.beat_position,
        state.jump_size_beats,
        state.feel,
    );
    state.slice_started_beat = sample.beat_position;
    state.source_anchor_transport_seconds = sample.transport_seconds;
    state.source_anchor_offset_seconds = 0;
    state.pending_trigger = null;
    state.last_accepted_onset_transport_seconds = null;
    state.queued_params = null;
    state.rnd_state = state.rnd_seed;
    state.forced_jump_state = state.forced_jump_seed;
}

fn boundaryTransportSeconds(
    state: types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
    boundary_beat: f64,
) f64 {
    if (@abs(sample.beat_position - boundary_beat) <= BOUNDARY_EPSILON) {
        return sample.transport_seconds;
    }

    const interval = positiveFinite(
        sample.beat_interval_seconds,
        state.beat_interval_seconds,
    );
    const estimated = sample.transport_seconds -
        (sample.beat_position - boundary_beat) * interval;

    return @min(
        sample.transport_seconds,
        @max(state.last_transport_seconds, estimated),
    );
}

fn sourceSliceStart(state: types.TimeSamplerState, effective_count: u32) f64 {
    return @as(f64, @floatFromInt(clampSlice(state.active_slice, effective_count))) *
        (state.source_duration_seconds / @as(f64, @floatFromInt(effective_count)));
}

const TimedTrigger = struct {
    event: types.TimeSamplerTriggerEvent,
    index: usize,
};

fn orderedTimedTriggers(
    allocator: std.mem.Allocator,
    events: []const types.TimeSamplerTriggerEvent,
    sample: types.TimeSamplerTransportSample,
) ![]types.TimeSamplerTriggerEvent {
    var items = try allocator.alloc(TimedTrigger, events.len);
    defer allocator.free(items);

    for (events, 0..) |event, index| {
        items[index] = .{
            .event = .{
                .trigger_type = event.trigger_type,
                .transport_seconds = event.transport_seconds orelse sample.transport_seconds,
            },
            .index = index,
        };
    }

    std.mem.sort(TimedTrigger, items, {}, struct {
        fn lessThan(_: void, left: TimedTrigger, right: TimedTrigger) bool {
            const left_time = left.event.transport_seconds orelse 0;
            const right_time = right.event.transport_seconds orelse 0;
            if (left_time != right_time) return left_time < right_time;
            return left.index < right.index;
        }
    }.lessThan);

    const result = try allocator.alloc(types.TimeSamplerTriggerEvent, events.len);
    for (items, 0..) |item, i| {
        result[i] = item.event;
    }
    return result;
}

pub fn reduceTimeSampler(
    allocator: std.mem.Allocator,
    previous_state: types.TimeSamplerState,
    sample: types.TimeSamplerTransportSample,
    ordered_trigger_events: []const types.TimeSamplerTriggerEvent,
    input_params: types.TimeSamplerParams,
) !types.TimeSamplerReduction {
    const params = normalizeParams(input_params);
    var state = previous_state;
    var jump_reason: ?types.JumpReason = null;
    var accent: ?types.TimeSamplerAccentEvent = null;

    const discontinuity =
        sample.discontinuity_generation != state.discontinuity_generation or
        sample.transport_seconds + SOURCE_EPSILON < state.last_transport_seconds or
        sample.beat_position + BOUNDARY_EPSILON < state.last_beat_position;

    if (discontinuity) {
        state.playback_rate = params.playback_rate;
        state.accent_mode = params.accent_mode;
        state.feel = params.feel orelse 0;
        state.beat_interval_seconds = positiveFinite(sample.beat_interval_seconds, 0);
        state.source_duration_seconds = params.source_duration_seconds;
        state.slice_count = params.slice_count;
        state.rnd_seed = params.random_seed;
        state.forced_jump_seed = params.forced_jump_seed orelse params.random_seed;
        resetForDiscontinuity(&state, sample);
        jump_reason = .discontinuity;
    } else {
        const timed_triggers = try orderedTimedTriggers(allocator, ordered_trigger_events, sample);
        defer allocator.free(timed_triggers);

        var trigger_index: usize = 0;
        const acceptTriggersThrough = struct {
            fn call(
                st: *types.TimeSamplerState,
                smp: types.TimeSamplerTransportSample,
                triggers: []const types.TimeSamplerTriggerEvent,
                idx: *usize,
                transport_seconds: f64,
            ) void {
                var accepted: [64]types.TimeSamplerTriggerEvent = undefined;
                var accepted_len: usize = 0;
                while (idx.* < triggers.len and
                    (triggers[idx.*].transport_seconds orelse smp.transport_seconds) <=
                        transport_seconds + SOURCE_EPSILON)
                {
                    if (accepted_len < accepted.len) {
                        accepted[accepted_len] = triggers[idx.*];
                        accepted_len += 1;
                    }
                    idx.* += 1;
                }
                acceptTriggers(st, smp, accepted[0..accepted_len]);
            }
        }.call;

        while (state.next_boundary_beat < sample.beat_position - BOUNDARY_EPSILON) {
            const boundary_beat = state.next_boundary_beat;
            const boundary_time = boundaryTransportSeconds(state, sample, boundary_beat);
            acceptTriggersThrough(&state, sample, timed_triggers, &trigger_index, boundary_time);
            _ = processBoundary(&state, sample, boundary_beat, boundary_time);
            if (state.next_boundary_beat == boundary_beat) {
                state.next_boundary_beat = boundary_beat + state.jump_size_beats;
            }
        }

        const old_count = effectiveSliceCount(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        );
        const old_source_timestamp = sourceTimestamp(state, sample);
        const old_slice_start = sourceSliceStart(state, old_count);
        const old_offset = @max(0, old_source_timestamp - old_slice_start);
        const rate_change = params.playback_rate != state.playback_rate;
        const structural_change =
            params.source_duration_seconds != state.source_duration_seconds or
            params.slice_count != state.slice_count;

        state.playback_rate = params.playback_rate;
        state.accent_mode = params.accent_mode;
        state.feel = params.feel orelse 0;
        state.beat_interval_seconds = positiveFinite(
            sample.beat_interval_seconds,
            state.beat_interval_seconds,
        );
        state.source_duration_seconds = params.source_duration_seconds;
        state.slice_count = params.slice_count;

        if (params.random_seed != state.rnd_seed) {
            state.rnd_seed = params.random_seed;
            state.rnd_state = params.random_seed;
        }
        const forced_jump_seed = params.forced_jump_seed orelse params.random_seed;
        if (forced_jump_seed != state.forced_jump_seed) {
            state.forced_jump_seed = forced_jump_seed;
            state.forced_jump_state = forced_jump_seed;
        }

        const new_count = effectiveSliceCount(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        );
        const effective_count_change = new_count != old_count;
        state.active_slice = clampSlice(state.active_slice, new_count);

        if (structural_change or effective_count_change) {
            const new_slice_duration = state.source_duration_seconds / @as(f64, @floatFromInt(new_count));
            state.source_anchor_transport_seconds = sample.transport_seconds;
            state.source_anchor_offset_seconds = @min(new_slice_duration, old_offset);
            const remapped_source_timestamp = sourceTimestamp(state, sample);
            if (@abs(remapped_source_timestamp - old_source_timestamp) > SOURCE_EPSILON) {
                state.jump_generation += 1;
                jump_reason = .@"source-remap";
            }
        } else if (rate_change) {
            state.source_anchor_transport_seconds = sample.transport_seconds;
            state.source_anchor_offset_seconds = old_offset;
        }

        state.queued_params = queuedParamsFrom(state, params);

        if (@abs(state.next_boundary_beat - sample.beat_position) <= BOUNDARY_EPSILON) {
            const boundary_beat = state.next_boundary_beat;
            const boundary_time = boundaryTransportSeconds(state, sample, boundary_beat);
            acceptTriggersThrough(&state, sample, timed_triggers, &trigger_index, boundary_time);
            const boundary = processBoundary(&state, sample, boundary_beat, boundary_time);
            jump_reason = boundary.reason;
            accent = boundary.accent;
            if (state.next_boundary_beat == boundary_beat) {
                state.next_boundary_beat = boundary_beat + state.jump_size_beats;
            }
        }

        acceptTriggersThrough(&state, sample, timed_triggers, &trigger_index, sample.transport_seconds);
    }

    state.last_transport_seconds = sample.transport_seconds;
    state.last_beat_position = sample.beat_position;

    return .{
        .next_state = state,
        .output = outputFor(state, sample, jump_reason, accent),
    };
}
