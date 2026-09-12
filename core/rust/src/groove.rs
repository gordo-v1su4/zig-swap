pub type PgmFeel = u8;

const MIN_INTERVAL_BEATS: f64 = 0.25;
const SWING_LONG: f64 = 4.0 / 3.0;
const DOTTED: f64 = 1.5;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GrooveSegment {
    pub start: f64,
    pub length: f64,
    pub progress: f64,
}

pub fn groove_segment(beat: f64, interval_beats: f64, feel: PgmFeel) -> GrooveSegment {
    let safe_beat = beat.max(0.0);
    let base = interval_beats.max(MIN_INTERVAL_BEATS);

    if feel == 2 {
        let step = base * DOTTED;
        let start = (safe_beat / step).floor() * step;
        return GrooveSegment {
            start,
            length: step,
            progress: (safe_beat - start) / step,
        };
    }

    if feel == 1 {
        let pair_length = base * 2.0;
        let pair_start = (safe_beat / pair_length).floor() * pair_length;
        let long_step = base * SWING_LONG;
        if safe_beat < pair_start + long_step - 1e-4 {
            return GrooveSegment {
                start: pair_start,
                length: long_step,
                progress: (safe_beat - pair_start) / long_step,
            };
        }
        let short_start = pair_start + long_step;
        let short_length = pair_length - long_step;
        return GrooveSegment {
            start: short_start,
            length: short_length,
            progress: (safe_beat - short_start) / short_length,
        };
    }

    let start = (safe_beat / base).floor() * base;
    GrooveSegment {
        start,
        length: base,
        progress: (safe_beat - start) / base,
    }
}

pub fn next_groove_beat(current_beat: f64, interval_beats: f64, feel: PgmFeel) -> f64 {
    let segment = groove_segment(current_beat, interval_beats, feel);
    segment.start + segment.length
}
