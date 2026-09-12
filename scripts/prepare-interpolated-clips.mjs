import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out=resolve('prep/fixtures/test-media/benchmark'),scratch=resolve('.scratch/interpolation');
const engine=resolve(process.env.RIFE_EXE??'.scratch/rife/rife-ncnn-vulkan-20221029-windows/rife-ncnn-vulkan.exe');
const model=resolve(engine,'../rife-v4.6');
const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
const sourceRoot=resolve('../beatsmaxxer-pro/test_media/redline-media/cleaned');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(r.stderr);return r;}
const result={version:1,engine:'rife-ncnn-vulkan 20221029',model:'rife-v4.6',engineSha256:hash(engine),factor:4,preparation:'Original source -> 720p PNG -> 4x RIFE frames -> H264 at 96fps. Quarter-speed playback yields 24 unique frames/sec. Final three frames hold the last source frame. Scene boundaries retain hard cuts.',clips:[]};
for(const id of [1,4,6,8]){
  const clip=manifest.clips.find(c=>c.id===id),source=join(sourceRoot,clip.sourceFile),dest=join(out,`deck-${id}-720-rife4.mp4`);
  const input=join(scratch,`deck-${id}-input`),output=join(scratch,`deck-${id}-rife4`);mkdirSync(input,{recursive:true});mkdirSync(output,{recursive:true});
  if(hash(source)!==clip.sourceSha256)throw Error('Source hash mismatch');
  const start=performance.now();
  run('ffmpeg',['-y','-v','error','-i',source,'-t',String(clip.variants['720'].duration),'-an','-vf','scale=1280:720','-fps_mode','passthrough',join(input,'%08d.png')]);
  const count=readdirSync(input).filter(f=>f.endsWith('.png')).length;
  console.log(`Deck ${id}: RIFE ${count} -> ${count*4} frames`,{flush:true});
  const renderStart=performance.now();
  const r=run(engine,['-i',input,'-o',output,'-n',String(count*4),'-m',model,'-j','2:2:2','-f','%08d.png']);
  writeFileSync(join(scratch,`deck-${id}-rife.log`),r.stderr);
  const renderSeconds=(performance.now()-renderStart)/1000;
  const scene=run('ffmpeg',['-hide_banner','-i',source,'-t',String(clip.variants['720'].duration),'-vf',"select='gt(scene,0.3)',showinfo",'-an','-f','null','-']).stderr;
  const cuts=[...scene.matchAll(/pts_time:([\d.]+)/g)].map(m=>Math.round(Number(m[1])*clip.variants['720'].fps)).filter(n=>n>0&&n<count);
  for(const cut of cuts)for(let j=1;j<4;j++)copyFileSync(join(input,String(cut).padStart(8,'0')+'.png'),join(output,String((cut-1)*4+j+1).padStart(8,'0')+'.png'));
  run('ffmpeg',['-y','-v','error','-framerate',String(clip.variants['720'].fps*4),'-i',join(output,'%08d.png'),'-vf',`drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':text='DECK ${id} RIFE4 FRAME %{n}':x=24:y=24:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.8`,'-an','-c:v','libx264','-preset','fast','-crf','18','-g','96','-pix_fmt','yuv420p','-movflags','+faststart',dest]);
  const stream=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',dest]).stdout).streams[0];
  const [n,d]=stream.avg_frame_rate.split('/').map(Number);
  run('ffmpeg',['-v','error','-i',dest,'-f','null','-']);
  result.clips.push({id,sourceSha256:clip.sourceSha256,variant:{url:'/fixtures/test-media/benchmark/'+dest.split(/[\\/]/).at(-1),sha256:hash(dest),duration:Number(stream.duration),fps:n/d,width:stream.width,height:stream.height,codec:stream.codec_name},inputFrames:count,outputFrames:Number(stream.nb_frames),sceneCuts:cuts,renderSeconds,totalSeconds:(performance.now()-start)/1000});
  writeFileSync(join(out,'interpolation-manifest.json'),JSON.stringify(result,null,2));
  console.log(`Deck ${id} ready: ${renderSeconds.toFixed(1)}s interpolation; ${result.clips.at(-1).totalSeconds.toFixed(1)}s total`);
}
