/**
 * Build core/zig remap WASM artifact for the web worker.
 *
 * Usage: bun run build:wasm
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const zigDir = resolve(repoRoot, 'core/zig');
const outDir = resolve(repoRoot, 'web/.dev');
const wasmSrc = resolve(zigDir, 'zig-out/bin/remap.wasm');
const wasmDest = resolve(outDir, 'remap.wasm');

mkdirSync(outDir, { recursive: true });

const build = spawnSync(
  'zig',
  ['build', '-Dtarget=wasm32-freestanding', '-Doptimize=ReleaseSmall'],
  { cwd: zigDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(wasmSrc)) {
  console.error(`build-wasm: missing ${wasmSrc}`);
  process.exit(1);
}

copyFileSync(wasmSrc, wasmDest);
console.log(`build-wasm: wrote ${wasmDest}`);
