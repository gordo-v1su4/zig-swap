import { mkdirSync } from 'node:fs';
import index from './index.html';

const port = Number(process.env.PORT ?? 5173);
const outDir = `${import.meta.dir}/.dev`;

mkdirSync(outDir, { recursive: true });

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

const server = Bun.serve({
  port,
  routes: {
    '/': index,
    '/remap.worker.js': workerArtifact,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Zig Swap web shell: http://localhost:${server.port}`);
