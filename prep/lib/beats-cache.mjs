/**
 * Serialize Essentia studio-audio-v1 result → locked prep-lane JSON cache.
 * Ported from webgpu-research/lab/lib/beats-cache.mjs
 */

/** @param {Record<string, unknown>} result */
export function studioResultToCachePayload(result) {
  if (result.schema_version !== 'studio-audio-v1') {
    throw new Error('Unsupported studio result schema');
  }

  /** @type {Record<string, unknown>} */
  const energyRaw =
    result.energy && typeof result.energy === 'object' ? result.energy : null;

  /** @type {number[] | undefined} */
  const onsets = Array.isArray(result.onsets)
    ? result.onsets.filter((t) => typeof t === 'number' && Number.isFinite(t))
    : undefined;

  /** @type {Record<string, unknown> | undefined} */
  let energy;
  if (energyRaw && Array.isArray(energyRaw.curve)) {
    energy = {
      mean: typeof energyRaw.mean === 'number' ? energyRaw.mean : 0,
      std: typeof energyRaw.std === 'number' ? energyRaw.std : 0,
      curve: energyRaw.curve.filter((v) => typeof v === 'number' && Number.isFinite(v)),
    };
    if (typeof energyRaw.sample_rate_hz === 'number') {
      energy.sample_rate_hz = energyRaw.sample_rate_hz;
    }
    if (typeof energyRaw.start_time_s === 'number') {
      energy.start_time_s = energyRaw.start_time_s;
    }
  }

  return {
    bpm: result.bpm,
    beats: result.beats,
    confidence: result.confidence,
    duration: result.duration,
    ...(Array.isArray(result.structure) ? { structure: result.structure } : {}),
    ...(onsets?.length ? { onsets } : {}),
    ...(energy?.curve?.length ? { energy } : {}),
    source: 'studio',
    locked: true,
    analyzedAt: new Date().toISOString(),
  };
}
