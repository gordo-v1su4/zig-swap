const types = @import("types.zig");

pub const GrooveSegment = struct {
    start: f64,
    length: f64,
    progress: f64,
};

const MIN_INTERVAL_BEATS: f64 = 0.25;
const SWING_LONG: f64 = 4.0 / 3.0;
const DOTTED: f64 = 1.5;

pub fn grooveSegment(
    beat: f64,
    interval_beats: f64,
    feel: types.PgmFeel,
) GrooveSegment {
    const safe_beat = @max(0, beat);
    const base = @max(MIN_INTERVAL_BEATS, interval_beats);

    if (feel == 2) {
        const step = base * DOTTED;
        const start = @floor(safe_beat / step) * step;
        return .{
            .start = start,
            .length = step,
            .progress = (safe_beat - start) / step,
        };
    }

    if (feel == 1) {
        const pair_length = base * 2.0;
        const pair_start = @floor(safe_beat / pair_length) * pair_length;
        const long_step = base * SWING_LONG;
        if (safe_beat < pair_start + long_step - 1e-4) {
            return .{
                .start = pair_start,
                .length = long_step,
                .progress = (safe_beat - pair_start) / long_step,
            };
        }
        const short_start = pair_start + long_step;
        const short_length = pair_length - long_step;
        return .{
            .start = short_start,
            .length = short_length,
            .progress = (safe_beat - short_start) / short_length,
        };
    }

    const start = @floor(safe_beat / base) * base;
    return .{
        .start = start,
        .length = base,
        .progress = (safe_beat - start) / base,
    };
}

pub fn nextGrooveBeat(
    current_beat: f64,
    interval_beats: f64,
    feel: types.PgmFeel,
) f64 {
    const segment = grooveSegment(current_beat, interval_beats, feel);
    return segment.start + segment.length;
}
