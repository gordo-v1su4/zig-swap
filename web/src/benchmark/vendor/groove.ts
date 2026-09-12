type PgmFeel = 0 | 1 | 2;

/**
 * The rack's groove: where the beat grid actually falls under STR8/SWNG/DOT.
 *
 * This used to exist in four places that did not agree. The PGM rail quantised
 * its cut boundaries through nextQuantizedBeat; STUTTER carried its own copy in
 * the shader with the swing ratio rounded to 1.34/0.66; and TIMESAMPLER,
 * TRANSITION and SPEEDRAMP had no feel at all -- they ran on a straight modulo
 * grid no matter what the rail said. Setting the rail to SWNG swung the cuts and
 * nothing else, so most of the rack played straight through a swung song.
 *
 * One rule, one implementation, used by all of them:
 *
 *   STRAIGHT  an even grid of `interval` beats
 *   SWING     each PAIR of intervals splits 2:1 -- the first hit gets 4/3 of an
 *             interval and the second 2/3. That ratio is triplet swing, the same
 *             thing a hardware sequencer means by 66% swing, and it is why the
 *             off-beat lands late rather than the whole grid stretching.
 *   DOTTED    an even grid of 1.5x `interval`, so hits walk against the bar
 *             instead of sitting on it.
 *
 * grooveSegment is the primitive and nextGrooveBeat is derived from it, so the
 * two cannot disagree about where a boundary is -- which is exactly how the
 * copies drifted apart in the first place.
 */

/** The smallest interval worth quantising to; guards divide-by-zero. */
const MIN_INTERVAL_BEATS = 0.25;

/** Swing puts the first hit of each pair at 4/3 of an interval: a 2:1 split. */
const SWING_LONG = 4 / 3;

/** Dotted stretches every step to one and a half intervals. */
const DOTTED = 1.5;

export interface GrooveSegment {
  /** Beat position where this segment begins. */
  start: number;
  /** Length of this segment in beats. Uneven under swing. */
  length: number;
  /** 0 at the segment's start, approaching 1 at its end. */
  progress: number;
}

/**
 * Which segment of the groove `beat` falls inside.
 *
 * Under swing the two halves of a pair have different lengths, so `length` is
 * per-segment rather than a constant -- an effect that eases across its segment
 * has to stretch with it or the swing reads as a stutter instead of a groove.
 */
export function grooveSegment(
  beat: number,
  intervalBeats: number,
  feel: PgmFeel
): GrooveSegment {
  const safeBeat = Math.max(0, beat);
  const base = Math.max(MIN_INTERVAL_BEATS, intervalBeats);

  if (feel === 2) {
    const step = base * DOTTED;
    const start = Math.floor(safeBeat / step) * step;
    return { start, length: step, progress: (safeBeat - start) / step };
  }

  if (feel === 1) {
    const pairLength = base * 2;
    const pairStart = Math.floor(safeBeat / pairLength) * pairLength;
    const longStep = base * SWING_LONG;
    // 1e-4 keeps a beat sitting exactly on the split from being claimed by the
    // segment it is leaving, which would report progress 1 instead of 0.
    if (safeBeat < pairStart + longStep - 1e-4) {
      return {
        start: pairStart,
        length: longStep,
        progress: (safeBeat - pairStart) / longStep
      };
    }
    const shortStart = pairStart + longStep;
    const shortLength = pairLength - longStep;
    return {
      start: shortStart,
      length: shortLength,
      progress: (safeBeat - shortStart) / shortLength
    };
  }

  const start = Math.floor(safeBeat / base) * base;
  return { start, length: base, progress: (safeBeat - start) / base };
}

/** The next grid boundary strictly after `currentBeat`. */
export function nextGrooveBeat(
  currentBeat: number,
  intervalBeats: number,
  feel: PgmFeel
): number {
  const segment = grooveSegment(currentBeat, intervalBeats, feel);
  return segment.start + segment.length;
}
