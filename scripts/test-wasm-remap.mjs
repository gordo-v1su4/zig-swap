/**
 * V1S-79 — round-trip WASM remap tick against oracle fixture transport.
 *
 * Usage: bun run test:wasm-remap
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const wasmPath = resolve(repoRoot, 'web/.dev/remap.wasm');
const fixturePath = resolve(
  repoRoot,
  'core/fixtures/chop-reducer-initial.json',
);

const build = spawnSync('bun', ['run', 'build:wasm'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const wasmBytes = readFileSync(wasmPath);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const testCase = fixture.cases[0];

const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const {
  remap_init,
  remap_tick,
  remap_active_slice,
  remap_loop_iteration,
} = instance.exports;

if (
  typeof remap_init !== 'function' ||
  typeof remap_tick !== 'function' ||
  typeof remap_active_slice !== 'function' ||
  typeof remap_loop_iteration !== 'function'
) {
  throw new Error('remap.wasm missing expected exports');
}

const { transport, params } = testCase.input;
const expected = testCase.expected.output;
remap_init(
  transport.transportSeconds,
  transport.beatPosition,
  transport.beatIntervalSeconds,
  params.sourceDurationSeconds,
  params.sliceCount,
);

const sourceTime = remap_tick(
  transport.transportSeconds,
  transport.beatPosition,
  transport.beatIntervalSeconds,
);

const expectedSource = expected.sourceTimestampSeconds;
const epsilon = 1e-9;
if (Math.abs(sourceTime - expectedSource) > epsilon) {
  throw new Error(
    `sourceTime mismatch: expected ${expectedSource}, got ${sourceTime}`,
  );
}

const gridIndex = remap_active_slice();
if (gridIndex !== expected.activeSlice) {
  throw new Error(
    `activeSlice mismatch: expected ${expected.activeSlice}, got ${gridIndex}`,
  );
}

const loopCount = remap_loop_iteration();
if (loopCount !== expected.loopIteration) {
  throw new Error(
    `loopIteration mismatch: expected ${expected.loopIteration}, got ${loopCount}`,
  );
}

console.log('wasm-remap: round-trip ok (chop-reducer-initial initial-fwd-quarter)');
