use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeSamplerMode {
    Fwd,
    Rev,
    Pong,
    Rnd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeSamplerAccentMode {
    Off,
    Lum,
    Rgb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TimeSamplerTriggerKind {
    ManualTrigger,
    MidiTrigger,
    OnsetTrigger,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerTransportSample {
    pub transport_seconds: f64,
    pub audio_output_time_seconds: f64,
    pub performance_time_seconds: f64,
    pub playing: bool,
    pub discontinuity_generation: u32,
    pub beat_position: f64,
    pub beat_phase: f64,
    pub beat_interval_seconds: f64,
    pub presentation_time_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerTriggerEvent {
    #[serde(rename = "type")]
    pub trigger_type: TimeSamplerTriggerKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerParams {
    pub source_duration_seconds: f64,
    pub slice_count: u32,
    pub mode: TimeSamplerMode,
    pub jump_size_beats: f64,
    pub loop_count: u32,
    pub playback_rate: f64,
    pub accent_mode: TimeSamplerAccentMode,
    pub random_seed: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forced_jump_seed: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feel: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerQueuedParams {
    pub mode: TimeSamplerMode,
    pub jump_size_beats: f64,
    pub loop_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerAccentEvent {
    pub generation: u32,
    pub mode: TimeSamplerAccentMode,
    pub transport_seconds: f64,
    pub presentation_time_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JumpReason {
    Initial,
    Scheduled,
    Forced,
    Discontinuity,
    #[serde(rename = "source-remap")]
    SourceRemap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerOutput {
    pub active_slice: i32,
    pub effective_slice_count: u32,
    pub source_timestamp_seconds: f64,
    pub target_playback_rate: f64,
    pub jump_generation: u32,
    pub jump_reason: Option<JumpReason>,
    pub mode: TimeSamplerMode,
    pub loop_iteration: u32,
    pub loop_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerState {
    pub active_slice: i32,
    pub pong_direction: i8,
    pub loop_iteration: u32,
    pub jump_generation: u32,
    pub discontinuity_generation: u32,
    pub next_boundary_beat: f64,
    pub slice_started_beat: f64,
    pub source_anchor_transport_seconds: f64,
    pub source_anchor_offset_seconds: f64,
    pub beat_interval_seconds: f64,
    pub rnd_seed: u32,
    pub rnd_state: u32,
    pub forced_jump_seed: u32,
    pub forced_jump_state: u32,
    pub pending_trigger: Option<TimeSamplerTriggerKind>,
    pub last_accepted_onset_transport_seconds: Option<f64>,
    pub source_duration_seconds: f64,
    pub slice_count: u32,
    pub mode: TimeSamplerMode,
    pub jump_size_beats: f64,
    pub loop_count: u32,
    pub playback_rate: f64,
    pub accent_mode: TimeSamplerAccentMode,
    pub feel: u8,
    pub queued_params: Option<TimeSamplerQueuedParams>,
    pub last_transport_seconds: f64,
    pub last_beat_position: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSamplerReduction {
    pub next_state: TimeSamplerState,
    pub output: TimeSamplerOutput,
}
