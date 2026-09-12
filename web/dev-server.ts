import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { spawnSync } from "node:child_process";
import index from "./index.html";
import benchmark from "./benchmark.html";
import musical from "./musical-benchmark.html";

const port = Number(process.env.PORT ?? 5173);
const outDir = `${import.meta.dir}/.dev`;
const repoRoot = `${import.meta.dir}/..`;
const fixtureRoot = join(repoRoot, "prep/fixtures");

mkdirSync(outDir, { recursive: true });

const wasmBuild = spawnSync("bun", ["run", "build:wasm"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (wasmBuild.status !== 0) {
  console.warn(
    "WASM build failed — worker will fall back to stub until build:wasm succeeds",
  );
}

const workerBuild = await Bun.build({
  entrypoints: [`${import.meta.dir}/src/remap.worker.ts`],
  outdir: outDir,
  target: "browser",
  format: "esm",
  naming: "remap.worker.[ext]",
});

if (!workerBuild.success) {
  console.error(workerBuild.logs);
  throw new Error("Failed to bundle remap worker");
}

const workerArtifact = workerBuild.outputs[0];
if (!workerArtifact) {
  throw new Error("Missing remap worker bundle output");
}

const wasmPath = join(outDir, "remap.wasm");
const wasmFile =
  wasmBuild.status === 0 && existsSync(wasmPath) ? Bun.file(wasmPath) : null;

async function fixtureResponse(pathname: string, range: string|null): Promise<Response | null> {
  if (!pathname.startsWith("/fixtures/")) return null;
  const relative = pathname.slice("/fixtures/".length);
  const filePath = normalize(join(fixtureRoot, relative));
  if (!filePath.startsWith(normalize(fixtureRoot)+ (process.platform==='win32'?'\\':'/'))) {
    return new Response("Forbidden", { status: 403 });
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }
  const headers={'Accept-Ranges':'bytes','Content-Type':file.type};
  if(range){
    const m=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(!m)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
    const start=Number(m[1]),end=Math.min(file.size-1,m[2]?Number(m[2]):file.size-1);
    if(start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
    return new Response(file.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${file.size}`,'Content-Length':String(end-start+1)}});
  }
  return new Response(file,{headers});
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  routes: {
    "/": index,
    "/benchmark": musical,
    "/seek-benchmark": benchmark,
    "/remap.worker.js": () => new Response(workerArtifact),
    "/remap.wasm": () =>
      wasmFile
        ? new Response(wasmFile)
        : new Response("WASM unavailable for this build", { status: 404 }),
  },
  async fetch(req) {
    const url = new URL(req.url);
    if(url.pathname==='/benchmark-results' && req.method==='POST') {
      if(req.headers.get('origin')!==url.origin)return new Response('Same-origin only',{status:403});
      const body=await req.text();
      if(body.length>32*1024*1024)return new Response('Too large',{status:413});
      try{JSON.parse(body);}catch{return new Response('Invalid JSON',{status:400});}
      const directory=join(repoRoot,'benchmark-results');mkdirSync(directory,{recursive:true});
      const name=`${Date.now()}-${crypto.randomUUID()}.json`;writeFileSync(join(directory,name),body);
      return Response.json({saved:name});
    }
    if(url.pathname.startsWith('/libmedia/')) {
      const name=url.pathname.slice('/libmedia/'.length);
      if(!/^[\w.-]+\.js$/.test(name))return new Response('Forbidden',{status:403});
      const file=Bun.file(join(repoRoot,'node_modules/@libmedia/avplayer/dist/umd',name));
      return await file.exists()?new Response(file):new Response('Not found',{status:404});
    }
    const fixture = await fixtureResponse(url.pathname,req.headers.get('range'));
    if (fixture) return fixture;
    return new Response("Not found", { status: 404 });
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Zig Swap web shell: http://localhost:${server.port}`);
