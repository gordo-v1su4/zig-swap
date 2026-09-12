use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use timesampler::{
    create_time_sampler_state, groove_segment, next_groove_beat, reduce_time_sampler,
    TimeSamplerMode, TimeSamplerOutput, TimeSamplerParams, TimeSamplerState,
    TimeSamplerTransportSample, TimeSamplerTriggerEvent,
};

const EPSILON: f64 = 1e-9;

fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

fn approx_eq(a: f64, b: f64) -> bool {
    (a - b).abs() <= EPSILON
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrooveFixture {
    module: String,
    cases: Vec<GrooveCase>,
}

#[derive(Debug, Deserialize)]
struct GrooveCase {
    name: String,
    input: GrooveInput,
    expected: GrooveExpected,
}

#[derive(Debug, Deserialize)]
struct GrooveInput {
    beat: f64,
    #[serde(rename = "intervalBeats")]
    interval_beats: f64,
    feel: u8,
}

#[derive(Debug, Deserialize)]
struct GrooveExpected {
    segment: GrooveSegmentExpected,
    #[serde(rename = "nextBeat")]
    next_beat: f64,
}

#[derive(Debug, Deserialize)]
struct GrooveSegmentExpected {
    start: f64,
    length: f64,
    progress: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReducerFixture {
    module: String,
    cases: Vec<ReducerCase>,
}

#[derive(Debug, Deserialize)]
struct ReducerCase {
    name: String,
    input: ReducerInput,
    expected: ReducerExpected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReducerInput {
    full_previous_state: Option<TimeSamplerState>,
    transport: TimeSamplerTransportSample,
    triggers: Vec<TimeSamplerTriggerEvent>,
    params: TimeSamplerParams,
}

#[derive(Debug, Deserialize)]
struct ReducerExpected {
    output: ExpectedOutput,
    #[serde(rename = "nextState")]
    next_state: ExpectedNextState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedOutput {
    active_slice: i32,
    effective_slice_count: u32,
    source_timestamp_seconds: f64,
    target_playback_rate: f64,
    jump_generation: u32,
    jump_reason: Option<String>,
    mode: TimeSamplerMode,
    loop_iteration: u32,
    loop_count: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedNextState {
    active_slice: i32,
    pong_direction: i8,
    loop_iteration: u32,
    jump_generation: u32,
    next_boundary_beat: f64,
    slice_started_beat: f64,
    source_anchor_transport_seconds: f64,
    source_anchor_offset_seconds: f64,
    mode: TimeSamplerMode,
    loop_count: u32,
    pending_trigger: Option<Value>,
}

fn assert_output(actual: &TimeSamplerOutput, expected: &ExpectedOutput, case: &str) {
    assert_eq!(
        actual.active_slice, expected.active_slice,
        "{case}: active_slice"
    );
    assert_eq!(
        actual.effective_slice_count, expected.effective_slice_count,
        "{case}: effective_slice_count"
    );
    assert!(
        approx_eq(
            actual.source_timestamp_seconds,
            expected.source_timestamp_seconds
        ),
        "{case}: source_timestamp_seconds expected {} got {}",
        expected.source_timestamp_seconds,
        actual.source_timestamp_seconds
    );
    assert!(
        approx_eq(actual.target_playback_rate, expected.target_playback_rate),
        "{case}: target_playback_rate"
    );
    assert_eq!(
        actual.jump_generation, expected.jump_generation,
        "{case}: jump_generation"
    );
    let actual_reason = actual
        .jump_reason
        .map(|reason| serde_json::to_string(&reason).unwrap().trim_matches('"').to_string());
    assert_eq!(actual_reason, expected.jump_reason, "{case}: jump_reason");
    assert_eq!(actual.mode, expected.mode, "{case}: mode");
    assert_eq!(
        actual.loop_iteration, expected.loop_iteration,
        "{case}: loop_iteration"
    );
    assert_eq!(actual.loop_count, expected.loop_count, "{case}: loop_count");
}

fn assert_next_state(actual: &TimeSamplerState, expected: &ExpectedNextState, case: &str) {
    assert_eq!(
        actual.active_slice, expected.active_slice,
        "{case}: active_slice"
    );
    assert_eq!(
        actual.pong_direction, expected.pong_direction,
        "{case}: pong_direction"
    );
    assert_eq!(
        actual.loop_iteration, expected.loop_iteration,
        "{case}: loop_iteration"
    );
    assert_eq!(
        actual.jump_generation, expected.jump_generation,
        "{case}: jump_generation"
    );
    assert!(
        approx_eq(actual.next_boundary_beat, expected.next_boundary_beat),
        "{case}: next_boundary_beat expected {} got {}",
        expected.next_boundary_beat,
        actual.next_boundary_beat
    );
    assert!(
        approx_eq(actual.slice_started_beat, expected.slice_started_beat),
        "{case}: slice_started_beat"
    );
    assert!(
        approx_eq(
            actual.source_anchor_transport_seconds,
            expected.source_anchor_transport_seconds
        ),
        "{case}: source_anchor_transport_seconds"
    );
    assert!(
        approx_eq(
            actual.source_anchor_offset_seconds,
            expected.source_anchor_offset_seconds
        ),
        "{case}: source_anchor_offset_seconds"
    );
    assert_eq!(actual.mode, expected.mode, "{case}: mode");
    assert_eq!(actual.loop_count, expected.loop_count, "{case}: loop_count");
    let actual_pending = actual
        .pending_trigger
        .map(|t| serde_json::to_string(&t).unwrap());
    let expected_pending = expected.pending_trigger.as_ref().map(|v| v.to_string());
    assert_eq!(actual_pending, expected_pending, "{case}: pending_trigger");
}

fn run_groove_fixture(path: &Path) {
    let text = fs::read_to_string(path).expect("read groove fixture");
    let fixture: GrooveFixture = serde_json::from_str(&text).expect("parse groove fixture");
    assert_eq!(fixture.module, "groove.ts");

    for case in fixture.cases {
        let segment = groove_segment(
            case.input.beat,
            case.input.interval_beats,
            case.input.feel,
        );
        assert!(
            approx_eq(segment.start, case.expected.segment.start),
            "{}: segment.start",
            case.name
        );
        assert!(
            approx_eq(segment.length, case.expected.segment.length),
            "{}: segment.length",
            case.name
        );
        assert!(
            approx_eq(segment.progress, case.expected.segment.progress),
            "{}: segment.progress",
            case.name
        );

        let next = next_groove_beat(
            case.input.beat + EPSILON,
            case.input.interval_beats,
            case.input.feel,
        );
        assert!(
            approx_eq(next, case.expected.next_beat),
            "{}: next_beat expected {} got {}",
            case.name,
            case.expected.next_beat,
            next
        );
    }
}

fn run_reducer_fixture(path: &Path) {
    let text = fs::read_to_string(path).expect("read reducer fixture");
    let fixture: ReducerFixture = serde_json::from_str(&text).expect("parse reducer fixture");
    assert_eq!(fixture.module, "reducer.ts");

    for case in fixture.cases {
        let reduction = if case.input.full_previous_state.is_none() {
            create_time_sampler_state(&case.input.transport, &case.input.params)
        } else {
            reduce_time_sampler(
                case.input.full_previous_state.as_ref().unwrap(),
                &case.input.transport,
                &case.input.triggers,
                &case.input.params,
            )
        };

        assert_output(&reduction.output, &case.expected.output, &case.name);
        assert_next_state(&reduction.next_state, &case.expected.next_state, &case.name);
    }
}

#[test]
fn all_fixture_json_files() {
    let dir = fixtures_dir();
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)
        .expect("read fixtures dir")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    paths.sort();

    assert!(!paths.is_empty(), "expected JSON fixtures under {:?}", dir);

    for path in paths {
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name == "groove.json" {
            run_groove_fixture(&path);
        } else if file_name.starts_with("chop-reducer-")
            || file_name == "seek-settlement-discontinuity.json"
        {
            run_reducer_fixture(&path);
        } else {
            panic!("unexpected fixture file: {file_name}");
        }
    }
}
