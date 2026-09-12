/**
 * V1S-77 — verify locked prep output exists and matches studio-audio-v1 shape.
 *
 * Usage: bun run scripts/verify-track-beats.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const beatsPath = resolve(
  repoRoot,
  'prep/fixtures/test-media/analysis/track.beats.json',
);

function fail(message) {
  console.error(`verify-track-beats: ${message}`);
  process.exit(1);
}

if (!existsSync(beatsPath)) {
  fail(`missing ${beatsPath} — run bun run prep:analyze when fixture audio is present`);
}

/** @type {unknown} */
let payload;
try {
  payload = JSON.parse(readFileSync(beatsPath, 'utf8'));
} catch {
  fail('track.beats.json is not valid JSON');
}

if (typeof payload !== 'object' || payload === null) {
  fail('track.beats.json must be an object');
}

const record = /** @type {Record<string, unknown>} */ (payload);

if (typeof record.bpm !== 'number' || !Number.isFinite(record.bpm)) {
  fail('bpm must be a finite number');
}
if (!Array.isArray(record.beats) || record.beats.length === 0) {
  fail('beats must be a non-empty array');
}
if (typeof record.duration !== 'number' || !Number.isFinite(record.duration)) {
  fail('duration must be a finite number');
}
if (record.locked !== true) {
  fail('locked must be true for runtime consumption');
}

const beats = record.beats.filter((t) => typeof t === 'number' && Number.isFinite(t));
if (beats.length !== record.beats.length) {
  fail('beats must contain only finite numbers');
}

console.log(
  `verify-track-beats: ok — BPM ${record.bpm}, ${beats.length} beats, duration ${record.duration}s`,
);
