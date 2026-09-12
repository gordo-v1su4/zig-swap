export interface Xorshift32Result {
  state: number;
  value: number;
}

export function xorshift32(state: number): Xorshift32Result {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;

  return {
    state: next,
    value: next / 0x1_0000_0000,
  };
}

export function randomSlice(
  state: number,
  sliceCount: number,
  currentSlice: number,
): { state: number; slice: number } {
  const random = xorshift32(state);
  let slice = Math.floor(random.value * sliceCount);

  if (sliceCount > 1 && slice === currentSlice) {
    slice = (slice + 1) % sliceCount;
  }

  return { state: random.state, slice };
}
