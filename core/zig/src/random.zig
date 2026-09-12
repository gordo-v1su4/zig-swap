pub const XorshiftResult = struct {
    state: u32,
    value: f64,
};

pub const RandomSliceResult = struct {
    state: u32,
    slice: i32,
};

pub fn xorshift32(state: u32) XorshiftResult {
    var next = state;
    next ^= next << 13;
    next ^= next >> 17;
    next ^= next << 5;
    return .{
        .state = next,
        .value = @as(f64, @floatFromInt(next)) / @as(f64, @floatFromInt(0x1_0000_0000)),
    };
}

pub fn randomSlice(state: u32, slice_count: u32, current_slice: i32) RandomSliceResult {
    const random = xorshift32(state);
    var slice: i32 = @intFromFloat(@floor(random.value * @as(f64, @floatFromInt(slice_count))));
    if (slice_count > 1 and slice == current_slice) {
        slice = @rem(slice + 1, @as(i32, @intCast(slice_count)));
    }
    return .{
        .state = random.state,
        .slice = slice,
    };
}
