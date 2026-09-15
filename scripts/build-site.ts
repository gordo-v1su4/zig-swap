import {mkdirSync,cpSync,readdirSync,readFileSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {join} from 'node:path';

const MEDIA = /\.(mp4|webm|mov|mkv|avi|wav|mp3|ogg|m4a|flac)$/i;

function copyNonMedia(src: string, dest: string) {
  mkdirSync(dest, {recursive: true});
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) copyNonMedia(from, to);
    else if (!MEDIA.test(name)) cpSync(from, to);
  }
}

const out='dist';mkdirSync(out,{recursive:true});
const build=await Bun.build({entrypoints:['web/musical-benchmark.html'],outdir:out,target:'browser',minify:true,define:{FRAME_LAB_HOSTED:'true'}});
if(!build.success)throw new Error(build.logs.join('\n'));
renameSync(`${out}/musical-benchmark.html`,`${out}/index.html`);
copyNonMedia('prep/fixtures', `${out}/fixtures`);
cpSync('benchmark-results',`${out}/benchmark-results`,{recursive:true});
cpSync('docs',`${out}/docs`,{recursive:true});
cpSync('node_modules/@libmedia/avplayer/dist/umd',`${out}/libmedia`,{recursive:true});
const runs=readdirSync('benchmark-results').filter(f=>f.endsWith('.json')).map(file=>{const {raw,schedule,...run}=JSON.parse(readFileSync(`benchmark-results/${file}`,'utf8'));return {...run,file};});
writeFileSync(`${out}/reference-results.json`,JSON.stringify(runs));
console.log(`Built Frame Lab with ${runs.length} reference reports (fixtures JSON only, no media).`);
