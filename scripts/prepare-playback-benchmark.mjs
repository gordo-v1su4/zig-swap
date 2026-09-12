import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const sourceRoot = resolve(process.argv[2] ?? '../beatsmaxxer-pro/test_media/redline-media/cleaned');
const root = resolve('prep/fixtures/test-media');
const out = join(root, 'benchmark');
mkdirSync(out, { recursive: true });
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function run(program, args) {
  const r = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${program}: ${r.stderr}`);
  return r.stdout;
}
function probe(file) {
  const data = JSON.parse(run('ffprobe', ['-v','error','-select_streams','v:0','-show_streams','-show_frames','-show_entries','stream=codec_name,width,height,avg_frame_rate,duration:frame=key_frame,best_effort_timestamp_time','-of','json',file]));
  const s = data.streams[0], [num,den] = s.avg_frame_rate.split('/').map(Number);
  const keys = data.frames.filter(f=>f.key_frame).map(f=>Number(f.best_effort_timestamp_time));
  return { codec:s.codec_name, width:s.width, height:s.height, fps:num/den, duration:Number(s.duration), keyframes:keys, maxKeyframeGapSeconds:Math.max(0,...keys.slice(1).map((v,i)=>v-keys[i])) };
}
const files = readdirSync(sourceRoot).filter(f=>f.endsWith('.mp4')).sort().slice(0,8);
if(files.length !== 8) throw new Error('Eight source clips required');
const clips=[];
for(const [i,file] of files.entries()) {
  const source = join(sourceRoot,file), original = probe(source);
  const variants={};
  for(const height of [720,1080]) {
    const dest=join(out,`deck-${i+1}-${height}.mp4`);
    // Fixed GOP, no blending/interpolation; burned-in source frame and deck identity.
    if(!existsSync(dest)) run('ffmpeg',['-hide_banner','-loglevel','error','-i',source,'-t','12','-an','-vf',`scale=-2:${height},drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':text='DECK ${i+1}  FRAME %{n}':x=24:y=24:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.8`,'-c:v','libx264','-preset','fast','-crf','18','-g','48','-keyint_min','48','-sc_threshold','0','-pix_fmt','yuv420p','-movflags','+faststart',dest]);
    variants[height]={url:`/fixtures/test-media/benchmark/${basename(dest)}`,sha256:hash(dest),...probe(dest),upscaled:original.height<height};
  }
  clips.push({id:i+1,sourceFile:file,sourceSha256:hash(source),original,variants});
  console.log(`Prepared deck ${i+1}/8`);
}
const audio=join(root,'audio','track-excerpt.mp3');
const grid=join(root,'analysis','track.beats.json');
const audioDuration=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',audio]));
const gridData=JSON.parse(readFileSync(grid,'utf8'));
if(Math.abs(audioDuration-gridData.duration)>.1) throw new Error('Audio/grid duration mismatch');
writeFileSync(join(out,'manifest.json'),JSON.stringify({version:1,clips,audio:{url:'/fixtures/test-media/audio/track-excerpt.mp3',sha256:hash(audio),duration:audioDuration},grid:{url:'/fixtures/test-media/analysis/track.beats.json',sha256:hash(grid),provenance:'analyze-track.mjs prioritizes track-excerpt.mp3; durations verified; original analysis has no input hash'},preparation:'12-second clips, original cadence, H264 CRF18 GOP48, IDs burned in; 1080 variants may be upscaled and are labeled'},null,2));
