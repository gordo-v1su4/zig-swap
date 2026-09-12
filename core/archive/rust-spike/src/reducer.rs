use crate::groove::next_groove_beat;
use crate::random::random_slice;
use crate::types::{
    JumpReason, TimeSamplerAccentEvent, TimeSamplerMode, TimeSamplerOutput, TimeSamplerParams,
    TimeSamplerQueuedParams, TimeSamplerReduction, TimeSamplerState, TimeSamplerTransportSample,
    TimeSamplerTriggerEvent, TimeSamplerTriggerKind,
};

const BOUNDARY_EPSILON: f64 = 1e-9;
const SOURCE_EPSILON: f64 = 1e-9;
const ONSET_COOLDOWN_SECONDS: f64 = 0.25;

fn positive_finite(value: f64, fallback: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn integer_at_least_one(value: f64) -> u32 {
    positive_finite(value, 1.0).round().max(1.0) as u32
}

fn normalize_params(params: &TimeSamplerParams) -> TimeSamplerParams {
    TimeSamplerParams {
        source_duration_seconds: positive_finite(params.source_duration_seconds, 0.0),
        slice_count: integer_at_least_one(f64::from(params.slice_count)),
        mode: params.mode,
        jump_size_beats: positive_finite(params.jump_size_beats, 1.0),
        loop_count: integer_at_least_one(f64::from(params.loop_count)),
        playback_rate: positive_finite(params.playback_rate, 1.0),
        accent_mode: params.accent_mode,
        random_seed: params.random_seed,
        forced_jump_seed: Some(params.forced_jump_seed.unwrap_or(params.random_seed)),
        feel: params.feel,
    }
}

fn effective_slice_count(
    source_duration_seconds: f64,
    requested_slice_count: u32,
    jump_size_beats: f64,
    beat_interval_seconds: f64,
) -> u32 {
    let requested_slice_duration =
        jump_size_beats * positive_finite(beat_interval_seconds, 0.0);

    if source_duration_seconds <= 0.0
        || (requested_slice_duration > 0.0
            && source_duration_seconds + SOURCE_EPSILON < requested_slice_duration)
    {
        return 1;
    }

    integer_at_least_one(f64::from(requested_slice_count))
}

fn initial_slice(mode: TimeSamplerMode, slice_count: u32) -> i32 {
    if mode == TimeSamplerMode::Rev {
        slice_count as i32 - 1
    } else {
        0
    }
}

fn boundary_after(beat_position: f64, jump_size_beats: f64, feel: u8) -> f64 {
    next_groove_beat(beat_position + BOUNDARY_EPSILON, jump_size_beats, feel)
}

fn clamp_slice(slice: i32, slice_count: u32) -> i32 {
    f64::from(slice)
        .round()
        .clamp(0.0, f64::from(slice_count.saturating_sub(1))) as i32
}

fn source_timestamp(state: &TimeSamplerState, sample: &TimeSamplerTransportSample) -> f64 {
    let count = effective_slice_count(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    let slice = clamp_slice(state.active_slice, count);
    let slice_duration = state.source_duration_seconds / f64::from(count);
    let slice_start = f64::from(slice) * slice_duration;
    let elapsed_seconds = (sample.transport_seconds - state.source_anchor_transport_seconds)
        .max(0.0)
        * state.playback_rate;
    let timestamp = state
        .source_duration_seconds
        .min(slice_start + (slice_duration).min(state.source_anchor_offset_seconds + elapsed_seconds));

    if timestamp.is_finite() {
        timestamp.max(0.0)
    } else {
        0.0
    }
}

fn output_for(
    state: &TimeSamplerState,
    sample: &TimeSamplerTransportSample,
    jump_reason: Option<JumpReason>,
) -> TimeSamplerOutput {
    TimeSamplerOutput {
        active_slice: state.active_slice,
        effective_slice_count: effective_slice_count(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        ),
        source_timestamp_seconds: source_timestamp(state, sample),
        target_playback_rate: state.playback_rate,
        jump_generation: state.jump_generation,
        jump_reason,
        mode: state.mode,
        loop_iteration: state.loop_iteration,
        loop_count: state.loop_count,
    }
}

pub fn create_time_sampler_state(
    sample: &TimeSamplerTransportSample,
    input_params: &TimeSamplerParams,
) -> TimeSamplerReduction {
    let params = normalize_params(input_params);
    let count = effective_slice_count(
        params.source_duration_seconds,
        params.slice_count,
        params.jump_size_beats,
        sample.beat_interval_seconds,
    );
    let forced_jump_seed = params.forced_jump_seed.unwrap_or(params.random_seed);
    let feel = params.feel.unwrap_or(0);
    let state = TimeSamplerState {
        active_slice: initial_slice(params.mode, count),
        pong_direction: 1,
        loop_iteration: 1,
        jump_generation: 0,
        discontinuity_generation: sample.discontinuity_generation,
        next_boundary_beat: boundary_after(sample.beat_position, params.jump_size_beats, feel),
        slice_started_beat: sample.beat_position,
        source_anchor_transport_seconds: sample.transport_seconds,
        source_anchor_offset_seconds: 0.0,
        beat_interval_seconds: positive_finite(sample.beat_interval_seconds, 0.0),
        rnd_seed: params.random_seed,
        rnd_state: params.random_seed,
        forced_jump_seed,
        forced_jump_state: forced_jump_seed,
        pending_trigger: None,
        last_accepted_onset_transport_seconds: None,
        source_duration_seconds: params.source_duration_seconds,
        slice_count: params.slice_count,
        mode: params.mode,
        jump_size_beats: params.jump_size_beats,
        loop_count: params.loop_count,
        playback_rate: params.playback_rate,
        accent_mode: params.accent_mode,
        feel,
        queued_params: None,
        last_transport_seconds: sample.transport_seconds,
        last_beat_position: sample.beat_position,
    };

    TimeSamplerReduction {
        next_state: state.clone(),
        output: output_for(&state, sample, Some(JumpReason::Initial)),
    }
}

fn queued_params_from(
    state: &TimeSamplerState,
    params: &TimeSamplerParams,
) -> Option<TimeSamplerQueuedParams> {
    if params.mode == state.mode
        && params.jump_size_beats == state.jump_size_beats
        && params.loop_count == state.loop_count
    {
        return None;
    }

    Some(TimeSamplerQueuedParams {
        mode: params.mode,
        jump_size_beats: params.jump_size_beats,
        loop_count: params.loop_count,
    })
}

fn trigger_priority(trigger: TimeSamplerTriggerKind) -> u8 {
    match trigger {
        TimeSamplerTriggerKind::ManualTrigger => 3,
        TimeSamplerTriggerKind::MidiTrigger => 2,
        TimeSamplerTriggerKind::OnsetTrigger => 1,
    }
}

fn accept_triggers(
    state: &mut TimeSamplerState,
    sample: &TimeSamplerTransportSample,
    events: &[TimeSamplerTriggerEvent],
) {
    for event in events {
        let event_time = event.transport_seconds.unwrap_or(sample.transport_seconds);
        if event.trigger_type == TimeSamplerTriggerKind::OnsetTrigger {
            if let Some(last) = state.last_accepted_onset_transport_seconds {
                if event_time - last < ONSET_COOLDOWN_SECONDS - SOURCE_EPSILON {
                    continue;
                }
            }
        }

        if let Some(pending) = state.pending_trigger {
            if trigger_priority(event.trigger_type) < trigger_priority(pending) {
                continue;
            }

            if trigger_priority(event.trigger_type) == trigger_priority(pending) {
                if event.trigger_type == TimeSamplerTriggerKind::OnsetTrigger {
                    state.last_accepted_onset_transport_seconds = Some(event_time);
                }
                continue;
            }
        }

        state.pending_trigger = Some(event.trigger_type);
        if event.trigger_type == TimeSamplerTriggerKind::OnsetTrigger {
            state.last_accepted_onset_transport_seconds = Some(event_time);
        }
    }
}

fn apply_queued_params(state: &mut TimeSamplerState, boundary_beat: f64) {
    let Some(queued) = state.queued_params.clone() else {
        return;
    };

    let mode_changed = queued.mode != state.mode;
    state.mode = queued.mode;
    state.jump_size_beats = queued.jump_size_beats;
    state.loop_count = queued.loop_count;
    state.queued_params = None;

    if mode_changed {
        state.pong_direction = 1;
    }
    state.next_boundary_beat = boundary_beat + state.jump_size_beats;
}

fn sequence_advance(state: &mut TimeSamplerState, slice_count: u32) -> i32 {
    match state.mode {
        TimeSamplerMode::Fwd => (state.active_slice + 1) % slice_count as i32,
        TimeSamplerMode::Rev => (state.active_slice - 1 + slice_count as i32) % slice_count as i32,
        TimeSamplerMode::Pong => {
            let mut candidate = state.active_slice + i32::from(state.pong_direction);
            if candidate < 0 || candidate >= slice_count as i32 {
                state.pong_direction = if state.pong_direction == 1 { -1 } else { 1 };
                candidate = state.active_slice + i32::from(state.pong_direction);
            }
            clamp_slice(candidate, slice_count)
        }
        TimeSamplerMode::Rnd => {
            let (next_state, slice) =
                random_slice(state.rnd_state, slice_count, state.active_slice);
            state.rnd_state = next_state;
            slice
        }
    }
}

struct BoundaryResult {
    reason: JumpReason,
    accent: TimeSamplerAccentEvent,
}

fn process_boundary(
    state: &mut TimeSamplerState,
    sample: &TimeSamplerTransportSample,
    boundary_beat: f64,
    boundary_transport_seconds: f64,
) -> BoundaryResult {
    apply_queued_params(state, boundary_beat);
    let count = effective_slice_count(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    let mut reason = JumpReason::Scheduled;

    if state.pending_trigger.is_some() {
        let (next_state, slice) =
            random_slice(state.forced_jump_state, count, state.active_slice);
        state.forced_jump_state = next_state;
        state.active_slice = slice;
        state.pending_trigger = None;
        state.loop_iteration = 1;
        reason = JumpReason::Forced;
    } else if state.loop_iteration >= state.loop_count {
        state.active_slice = sequence_advance(state, count);
        state.loop_iteration = 1;
    } else {
        state.loop_iteration += 1;
    }

    state.active_slice = clamp_slice(state.active_slice, count);
    state.slice_started_beat = boundary_beat;
    state.source_anchor_transport_seconds = boundary_transport_seconds;
    state.source_anchor_offset_seconds = 0.0;
    state.jump_generation += 1;

    BoundaryResult {
        reason,
        accent: TimeSamplerAccentEvent {
            generation: state.jump_generation,
            mode: state.accent_mode,
            transport_seconds: boundary_transport_seconds,
            presentation_time_seconds: sample.presentation_time_seconds,
        },
    }
}

fn reset_for_discontinuity(state: &mut TimeSamplerState, sample: &TimeSamplerTransportSample) {
    let count = effective_slice_count(
        state.source_duration_seconds,
        state.slice_count,
        state.jump_size_beats,
        state.beat_interval_seconds,
    );
    state.active_slice = initial_slice(state.mode, count);
    state.pong_direction = 1;
    state.loop_iteration = 1;
    state.jump_generation += 1;
    state.discontinuity_generation = sample.discontinuity_generation;
    state.next_boundary_beat = boundary_after(
        sample.beat_position,
        state.jump_size_beats,
        state.feel,
    );
    state.slice_started_beat = sample.beat_position;
    state.source_anchor_transport_seconds = sample.transport_seconds;
    state.source_anchor_offset_seconds = 0.0;
    state.pending_trigger = None;
    state.last_accepted_onset_transport_seconds = None;
    state.queued_params = None;
    state.rnd_state = state.rnd_seed;
    state.forced_jump_state = state.forced_jump_seed;
}

fn boundary_transport_seconds(
    state: &TimeSamplerState,
    sample: &TimeSamplerTransportSample,
    boundary_beat: f64,
) -> f64 {
    if (sample.beat_position - boundary_beat).abs() <= BOUNDARY_EPSILON {
        return sample.transport_seconds;
    }

    let interval = positive_finite(sample.beat_interval_seconds, state.beat_interval_seconds);
    let estimated =
        sample.transport_seconds - (sample.beat_position - boundary_beat) * interval;

    sample
        .transport_seconds
        .min(state.last_transport_seconds.max(estimated))
}

fn ordered_timed_triggers(
    events: &[TimeSamplerTriggerEvent],
    sample: &TimeSamplerTransportSample,
) -> Vec<TimeSamplerTriggerEvent> {
    let mut indexed: Vec<(usize, TimeSamplerTriggerEvent)> = events
        .iter()
        .enumerate()
        .map(|(index, event)| {
            (
                index,
                TimeSamplerTriggerEvent {
                    trigger_type: event.trigger_type,
                    transport_seconds: Some(event.transport_seconds.unwrap_or(sample.transport_seconds)),
                },
            )
        })
        .collect();

    indexed.sort_by(|left, right| {
        left.1
            .transport_seconds
            .unwrap_or(0.0)
            .partial_cmp(&right.1.transport_seconds.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.0.cmp(&right.0))
    });

    indexed.into_iter().map(|(_, event)| event).collect()
}

fn source_slice_start(state: &TimeSamplerState, effective_count: u32) -> f64 {
    f64::from(clamp_slice(state.active_slice, effective_count))
        * (state.source_duration_seconds / f64::from(effective_count))
}

pub fn reduce_time_sampler(
    previous_state: &TimeSamplerState,
    sample: &TimeSamplerTransportSample,
    ordered_trigger_events: &[TimeSamplerTriggerEvent],
    input_params: &TimeSamplerParams,
) -> TimeSamplerReduction {
    let params = normalize_params(input_params);
    let mut state = previous_state.clone();
    let mut jump_reason: Option<JumpReason> = None;
    let mut _accent: Option<TimeSamplerAccentEvent> = None;

    let discontinuity = sample.discontinuity_generation != state.discontinuity_generation
        || sample.transport_seconds + SOURCE_EPSILON < state.last_transport_seconds
        || sample.beat_position + BOUNDARY_EPSILON < state.last_beat_position;

    if discontinuity {
        state.playback_rate = params.playback_rate;
        state.accent_mode = params.accent_mode;
        state.feel = params.feel.unwrap_or(0);
        state.beat_interval_seconds = positive_finite(sample.beat_interval_seconds, 0.0);
        state.source_duration_seconds = params.source_duration_seconds;
        state.slice_count = params.slice_count;
        state.rnd_seed = params.random_seed;
        state.forced_jump_seed = params.forced_jump_seed.unwrap_or(params.random_seed);
        reset_for_discontinuity(&mut state, sample);
        jump_reason = Some(JumpReason::Discontinuity);
    } else {
        let timed_triggers = ordered_timed_triggers(ordered_trigger_events, sample);
        let mut trigger_index = 0;

        let mut accept_triggers_through =
            |state: &mut TimeSamplerState, transport_seconds: f64| {
                let mut accepted = Vec::new();
                while trigger_index < timed_triggers.len()
                    && timed_triggers[trigger_index]
                        .transport_seconds
                        .unwrap_or(sample.transport_seconds)
                        <= transport_seconds + SOURCE_EPSILON
                {
                    accepted.push(timed_triggers[trigger_index].clone());
                    trigger_index += 1;
                }
                accept_triggers(state, sample, &accepted);
            };

        while state.next_boundary_beat < sample.beat_position - BOUNDARY_EPSILON {
            let boundary_beat = state.next_boundary_beat;
            let boundary_time = boundary_transport_seconds(&state, sample, boundary_beat);
            accept_triggers_through(&mut state, boundary_time);
            process_boundary(&mut state, sample, boundary_beat, boundary_time);
            if state.next_boundary_beat == boundary_beat {
                state.next_boundary_beat = boundary_beat + state.jump_size_beats;
            }
        }

        let old_count = effective_slice_count(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        );
        let old_source_timestamp = source_timestamp(&state, sample);
        let old_slice_start = source_slice_start(&state, old_count);
        let old_offset = (old_source_timestamp - old_slice_start).max(0.0);
        let rate_change = params.playback_rate != state.playback_rate;
        let structural_change = params.source_duration_seconds != state.source_duration_seconds
            || params.slice_count != state.slice_count;

        state.playback_rate = params.playback_rate;
        state.accent_mode = params.accent_mode;
        state.feel = params.feel.unwrap_or(0);
        state.beat_interval_seconds =
            positive_finite(sample.beat_interval_seconds, state.beat_interval_seconds);
        state.source_duration_seconds = params.source_duration_seconds;
        state.slice_count = params.slice_count;

        if params.random_seed != state.rnd_seed {
            state.rnd_seed = params.random_seed;
            state.rnd_state = params.random_seed;
        }
        let forced_jump_seed = params.forced_jump_seed.unwrap_or(params.random_seed);
        if forced_jump_seed != state.forced_jump_seed {
            state.forced_jump_seed = forced_jump_seed;
            state.forced_jump_state = forced_jump_seed;
        }

        let new_count = effective_slice_count(
            state.source_duration_seconds,
            state.slice_count,
            state.jump_size_beats,
            state.beat_interval_seconds,
        );
        let effective_count_change = new_count != old_count;
        state.active_slice = clamp_slice(state.active_slice, new_count);

        if structural_change || effective_count_change {
            let new_slice_duration = state.source_duration_seconds / f64::from(new_count);
            state.source_anchor_transport_seconds = sample.transport_seconds;
            state.source_anchor_offset_seconds = old_offset.min(new_slice_duration);
            let remapped_source_timestamp = source_timestamp(&state, sample);
            if (remapped_source_timestamp - old_source_timestamp).abs() > SOURCE_EPSILON {
                state.jump_generation += 1;
                jump_reason = Some(JumpReason::SourceRemap);
            }
        } else if rate_change {
            state.source_anchor_transport_seconds = sample.transport_seconds;
            state.source_anchor_offset_seconds = old_offset;
        }

        state.queued_params = queued_params_from(&state, &params);

        if (state.next_boundary_beat - sample.beat_position).abs() <= BOUNDARY_EPSILON {
            let boundary_beat = state.next_boundary_beat;
            let boundary_time = boundary_transport_seconds(&state, sample, boundary_beat);
            accept_triggers_through(&mut state, boundary_time);
            let boundary = process_boundary(&mut state, sample, boundary_beat, boundary_time);
            jump_reason = Some(boundary.reason);
            _accent = Some(boundary.accent);
            if state.next_boundary_beat == boundary_beat {
                state.next_boundary_beat = boundary_beat + state.jump_size_beats;
            }
        }

        accept_triggers_through(&mut state, sample.transport_seconds);
    }

    state.last_transport_seconds = sample.transport_seconds;
    state.last_beat_position = sample.beat_position;

    TimeSamplerReduction {
        output: output_for(&state, sample, jump_reason),
        next_state: state,
    }
}
