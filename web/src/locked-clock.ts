/** Pausing freezes elapsed time; manual source steering never modifies this clock. */
export class LockedClock {
  private elapsed = 0;
  private anchorMs = 0;
  playing = false;

  time(nowMs: number): number {
    return (
      this.elapsed +
      (this.playing ? Math.max(0, nowMs - this.anchorMs) / 1000 : 0)
    );
  }

  setPlaying(playing: boolean, nowMs: number): void {
    this.elapsed = this.time(nowMs);
    this.anchorMs = nowMs;
    this.playing = playing;
  }

  reset(nowMs: number): void {
    this.elapsed = 0;
    this.anchorMs = nowMs;
    this.playing = false;
  }
}

/** Interpolate the actual locked markers, including the wrap between analysis cycles. */
export function beatAt(
  seconds: number,
  beats: readonly number[],
  duration: number,
) {
  const cycle = Math.floor(seconds / duration);
  const phase = seconds % duration;
  let low = 0;
  let high = beats.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (beats[mid] <= phase) low = mid + 1;
    else high = mid;
  }
  const index = low - 1;
  const start = index >= 0 ? beats[index] : beats[beats.length - 1] - duration;
  const end = low < beats.length ? beats[low] : duration + beats[0];
  const interval = end - start;
  return {
    position: Math.max(
      0,
      cycle * beats.length + index + (phase - start) / interval,
    ),
    interval,
  };
}
