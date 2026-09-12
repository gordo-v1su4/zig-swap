import { mkdirSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import index from './index.html';

const port = Number(process.env.PORT ?? 5173);
const outDir = `${import.meta.dir}/.dev`;
const repoRoot = `${import.meta.dir}/..`;
const fixtureRoot = join(repoRoot, 'prep/fixtures');

mkdirSync(outDir, { recursive: true });

const wasmBuild = spawnSync('bun', ['run', 'build:wasm'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (wasmBuild.status !== 0) {
  console.warn('WASM build failed — worker will fall back to stub until build:wasm succeeds');
}

const workerBuild = await Bun.build({
  entrypoints: [`${import.meta.dir}/src/remap.worker.ts`],
  outdir: outDir,
  target: 'browser',
  format: 'esm',
  naming: 'remap.worker.[ext]',
});

if (!workerBuild.success) {
  console.error(workerBuild.logs);
  throw new Error('Failed to bundle remap worker');
}

const workerArtifact = workerBuild.outputs[0];
if (!workerArtifact) {
  throw new Error('Missing remap worker bundle output');
}

const wasmPath = join(outDir, 'remap.wasm');
const wasmFile = existsSync(wasmPath) ? Bun.file(wasmPath) : null;

async function fixtureResponse(pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/fixtures/')) return null;
  const relative = pathname.slice('/fixtures/'.length);
  const filePath = normalize(join(fixtureRoot, relative));
  if (!filePath.startsWith(normalize(fixtureRoot))) {
    return new Response('Forbidden', { status: 403 });
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(file);
}

const server = Bun.serve({
  port,
  routes: {
    '/': index,
    '/remap.worker.js': workerArtifact,
    ...(wasmFile ? { '/remap.wasm': wasmFile } : {}),
  },
  async fetch(req) {
    const url = new URL(req.url);
    const fixture = await fixtureResponse(url.pathname);
    if (fixture) return fixture;
    return new Response('Not found', { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Zig Swap web shell: http://localhost:${server.port}`);
