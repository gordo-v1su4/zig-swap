pub fn xorshift32(state: u32) -> (u32, f64) {
    let mut next = state;
    next ^= next.wrapping_shl(13);
    next ^= next.wrapping_shr(17);
    next ^= next.wrapping_shl(5);
    let value = f64::from(next) / 4294967296.0;
    (next, value)
}

pub fn random_slice(state: u32, slice_count: u32, current_slice: i32) -> (u32, i32) {
    let (next_state, value) = xorshift32(state);
    let mut slice = (value * f64::from(slice_count)).floor() as i32;
    if slice_count > 1 && slice == current_slice {
        slice = (slice + 1) % slice_count as i32;
    }
    (next_state, slice)
}
