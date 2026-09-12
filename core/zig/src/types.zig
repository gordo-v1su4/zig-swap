pub const TimeSamplerMode = enum {
    FWD,
    REV,
    PONG,
    RND,
};

pub const TimeSamplerAccentMode = enum {
    OFF,
    LUM,
    RGB,
};

pub const TimeSamplerTriggerKind = enum {
    @"manual-trigger",
    @"midi-trigger",
    @"onset-trigger",
};

pub const JumpReason = enum {
    initial,
    scheduled,
    forced,
    discontinuity,
    @"source-remap",
};

pub const PgmFeel = u8;

pub const TimeSamplerTransportSample = struct {
    transport_seconds: f64,
    audio_output_time_seconds: f64,
    performance_time_seconds: f64,
    playing: bool,
    discontinuity_generation: u32,
    beat_position: f64,
    beat_phase: f64,
    beat_interval_seconds: f64,
    presentation_time_seconds: f64,
};

pub const TimeSamplerTriggerEvent = struct {
    trigger_type: TimeSamplerTriggerKind,
    transport_seconds: ?f64 = null,
};

pub const TimeSamplerParams = struct {
    source_duration_seconds: f64,
    slice_count: u32,
    mode: TimeSamplerMode,
    jump_size_beats: f64,
    loop_count: u32,
    playback_rate: f64,
    accent_mode: TimeSamplerAccentMode,
    random_seed: u32,
    forced_jump_seed: ?u32 = null,
    feel: ?PgmFeel = null,
};

pub const TimeSamplerQueuedParams = struct {
    mode: TimeSamplerMode,
    jump_size_beats: f64,
    loop_count: u32,
};

pub const TimeSamplerAccentEvent = struct {
    generation: u32,
    mode: TimeSamplerAccentMode,
    transport_seconds: f64,
    presentation_time_seconds: f64,
};

pub const TimeSamplerOutput = struct {
    active_slice: i32,
    effective_slice_count: u32,
    source_timestamp_seconds: f64,
    target_playback_rate: f64,
    jump_generation: u32,
    jump_reason: ?JumpReason,
    mode: TimeSamplerMode,
    loop_iteration: u32,
    loop_count: u32,
    accent: ?TimeSamplerAccentEvent = null,
};

pub const TimeSamplerState = struct {
    active_slice: i32,
    pong_direction: i8,
    loop_iteration: u32,
    jump_generation: u32,
    discontinuity_generation: u32,
    next_boundary_beat: f64,
    slice_started_beat: f64,
    source_anchor_transport_seconds: f64,
    source_anchor_offset_seconds: f64,
    beat_interval_seconds: f64,
    rnd_seed: u32,
    rnd_state: u32,
    forced_jump_seed: u32,
    forced_jump_state: u32,
    pending_trigger: ?TimeSamplerTriggerKind,
    last_accepted_onset_transport_seconds: ?f64,
    source_duration_seconds: f64,
    slice_count: u32,
    mode: TimeSamplerMode,
    jump_size_beats: f64,
    loop_count: u32,
    playback_rate: f64,
    accent_mode: TimeSamplerAccentMode,
    feel: PgmFeel,
    queued_params: ?TimeSamplerQueuedParams,
    last_transport_seconds: f64,
    last_beat_position: f64,
};

pub const TimeSamplerReduction = struct {
    next_state: TimeSamplerState,
    output: TimeSamplerOutput,
};
