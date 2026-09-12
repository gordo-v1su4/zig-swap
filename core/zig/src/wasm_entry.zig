//! WASM remap entry — tick API for the web worker (V1S-79).

const std = @import("std");
const ts = @import("root.zig");

var g_state: ts.TimeSamplerState = undefined;
var g_params: ts.TimeSamplerParams = undefined;
var g_initialized = false;
var g_last_source_time: f64 = 0;

var scratch: [8192]u8 = undefined;
var fixed_allocator = std.heap.FixedBufferAllocator.init(&scratch);

export fn remap_init(
    transport_seconds: f64,
    beat_position: f64,
    beat_interval_seconds: f64,
    source_duration_seconds: f64,
    slice_count: u32,
) void {
    g_params = .{
        .source_duration_seconds = source_duration_seconds,
        .slice_count = slice_count,
        .mode = .FWD,
        .jump_size_beats = 1,
        .loop_count = 2,
        .playback_rate = 1,
        .accent_mode = .OFF,
        .random_seed = 305419896,
        .feel = 0,
    };

    const sample = ts.TimeSamplerTransportSample{
        .transport_seconds = transport_seconds,
        .audio_output_time_seconds = transport_seconds,
        .performance_time_seconds = transport_seconds,
        .playing = true,
        .discontinuity_generation = 0,
        .beat_position = beat_position,
        .beat_phase = 0,
        .beat_interval_seconds = beat_interval_seconds,
        .presentation_time_seconds = transport_seconds,
    };

    const reduction = ts.createTimeSamplerState(sample, g_params);
    g_state = reduction.next_state;
    g_last_source_time = reduction.output.source_timestamp_seconds;
    g_initialized = true;
}

export fn remap_tick(
    transport_seconds: f64,
    beat_position: f64,
    beat_interval_seconds: f64,
) f64 {
    if (!g_initialized) return 0;

    fixed_allocator.reset();

    const sample = ts.TimeSamplerTransportSample{
        .transport_seconds = transport_seconds,
        .audio_output_time_seconds = transport_seconds,
        .performance_time_seconds = transport_seconds,
        .playing = true,
        .discontinuity_generation = 0,
        .beat_position = beat_position,
        .beat_phase = 0,
        .beat_interval_seconds = beat_interval_seconds,
        .presentation_time_seconds = transport_seconds,
    };

    const reduction = ts.reduceTimeSampler(
        fixed_allocator.allocator(),
        g_state,
        sample,
        &.{},
        g_params,
    ) catch return g_last_source_time;

    g_state = reduction.next_state;
    g_last_source_time = reduction.output.source_timestamp_seconds;
    return g_last_source_time;
}

export fn remap_active_slice() i32 {
    if (!g_initialized) return 0;
    return g_state.active_slice;
}

export fn remap_loop_iteration() u32 {
    if (!g_initialized) return 1;
    return g_state.loop_iteration;
}

export fn remap_stutter_active() u32 {
    if (!g_initialized) return 0;
    return if (g_state.pending_trigger != null) 1 else 0;
}
