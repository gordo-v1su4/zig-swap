/**
 * Run Zig spike tests from core/zig (fixture paths are relative to that dir).
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const zigDir = resolve(dirname(fileURLToPath(import.meta.url)), '../core/zig');
const result = spawnSync('zig', ['build', 'test'], {
  cwd: zigDir,
  stdio: 'inherit',
  shell: true,
});

const code = result.status ?? 1;
if (code === 0) {
  console.log('zig: all fixture tests passed (core/zig)');
}
process.exit(code);
