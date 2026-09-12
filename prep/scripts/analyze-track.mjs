/**
 * Prep lane: Essentia beat grid via direct Studio API.
 * Typical job duration ~40-50 seconds.
 *
 * Usage: bun run prep/scripts/analyze-track.mjs
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeAudioFile,
  loadEssentiaEnv,
  STUDIO_TYPICAL_SECONDS,
} from '../lib/essentia-studio.mjs';
import { studioResultToCachePayload } from '../lib/beats-cache.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prepRoot = resolve(__dirname, '..');
const fixtureRoot = resolve(prepRoot, 'fixtures/test-media');
const wavPath = resolve(fixtureRoot, 'audio/Love me tonight (fullsong).wav');
const mp3Path = resolve(fixtureRoot, 'audio/track-excerpt.mp3');
const beatsPath = resolve(fixtureRoot, 'analysis/track.beats.json');

async function main() {
  const env = loadEssentiaEnv(prepRoot);
  if (!env.enabled) {
    throw new Error('Essentia disabled — set ESSENTIA_ANALYSIS_ENABLED=true and keys in prep/.env');
  }

  const audioPath = existsSync(mp3Path) ? mp3Path : wavPath;
  if (!existsSync(audioPath)) {
    throw new Error(`Missing fixture audio — expected ${wavPath} or ${mp3Path}`);
  }

  mkdirSync(dirname(beatsPath), { recursive: true });

  console.log(`Essentia: ${env.apiBaseUrl} (expect ~${STUDIO_TYPICAL_SECONDS}s)`);
  console.log(`Input: ${audioPath}`);
  const result = await analyzeAudioFile(audioPath, env, (stage, elapsed) => {
    console.log(`  ${elapsed}s · stage: ${stage}`);
  });

  const payload = studioResultToCachePayload(result);
  writeFileSync(beatsPath, JSON.stringify(payload, null, 2), 'utf8');

  const onsetCount = payload.onsets?.length ?? 0;
  const energySamples = payload.energy?.curve?.length ?? 0;
  console.log(
    `Wrote ${beatsPath} (BPM ${result.bpm}, ${result.beats.length} beats, ${onsetCount} onsets, ${energySamples} energy samples)`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
