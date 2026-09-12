import { Input, MP4, UrlSource, VideoSampleSink } from 'mediabunny';
import type {Clip,DeckAdapter,Observation,Target} from './adapters';
import type {Cut} from './schedule';
export function estimatedResidentBytes(clip:Pick<Clip,'width'|'height'|'duration'|'fps'>){return clip.width*clip.height*4*Math.ceil(clip.duration*clip.fps);}
/** Complete clip in GPU textures. Decoder is disposed before playback begins. */
export class GpuBankDeck implements DeckAdapter {
  private input:Input|null=null;
  private frames:{texture:GPUTexture;pts:number;duration:number}[]=[];
  private bytes=0;private stopped=false;private hits=0;private misses=0;private last=-1;private lastGeneration=-1;private preloadMs=0;
  constructor(private clip:Clip,private device:GPUDevice,private frame:(o:Observation)=>void,private budget:number,private progress:(loaded:number,total:number)=>void){}
  async load(){
    if(estimatedResidentBytes(this.clip)>this.budget)throw new Error(`GPU frame bank requires ${(estimatedResidentBytes(this.clip)/2**20).toFixed(0)} MiB for this deck; cap is ${(this.budget/2**20).toFixed(0)} MiB. No hidden downscale or decoder fallback.`);
    const start=performance.now();
    const input=new Input({formats:[MP4],source:new UrlSource(this.clip.url)});this.input=input;
    try{
      const track=await input.getPrimaryVideoTrack();if(!track||this.stopped)throw new Error('GPU bank load cancelled');
      const sink=new VideoSampleSink(track);
      for await(const sample of sink.samples()){
        try{
          if(this.stopped)break;
          const frame=sample.toVideoFrame();
          try{
            const bytes=frame.displayWidth*frame.displayHeight*4;
            if(this.bytes+bytes>this.budget)throw new Error('GPU bank exceeded its allocation cap');
            const texture=this.device.createTexture({size:[frame.displayWidth,frame.displayHeight],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
            this.frames.push({texture,pts:sample.timestamp,duration:sample.duration});this.bytes+=bytes;
            this.device.queue.copyExternalImageToTexture({source:frame},{texture},[frame.displayWidth,frame.displayHeight]);
          }finally{frame.close();}
          if(this.frames.length%16===0){await this.device.queue.onSubmittedWorkDone();this.progress(this.frames.length,Math.ceil(this.clip.duration*this.clip.fps));}
        }finally{sample.close();}
      }
      await this.device.queue.onSubmittedWorkDone();
      if(this.stopped)throw new Error('GPU bank load cancelled');
      if(!this.frames.length)throw new Error('GPU bank has no decoded frames');
      this.progress(this.frames.length,this.frames.length);this.preloadMs=performance.now()-start;
    }finally{input.dispose();this.input=null;}
  }
  target(t:Target,_future:Cut[]){
    if(this.stopped||!t.playing)return;
    let lo=0,hi=this.frames.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.frames[mid].pts<=t.source)lo=mid;else hi=mid-1;}
    const f=this.frames[lo];
    if(!f||t.source<f.pts-1e-6||t.source>=f.pts+f.duration+1e-6){this.misses++;return;}
    if(lo===this.last&&t.event.id===this.lastGeneration)return;
    this.last=lo;this.lastGeneration=t.event.id;this.hits++;
    this.frame({source:f.texture,pts:f.pts,duration:f.duration,generation:t.event.id});
  }
  pause(){this.last=this.lastGeneration=-1;}
  async dispose(){this.stopped=true;this.input?.dispose();this.frames.forEach(f=>f.texture.destroy());this.frames=[];this.bytes=0;}
  stats(){return {path:'Fully resident GPU texture bank',observation:'predecoded PTS -> texture bind selection -> common rAF submit',preloadMs:this.preloadMs,residentFrames:this.frames.length,estimatedCacheBytes:this.bytes,cacheHits:this.hits,cacheMisses:this.misses,decodeDuringPlayback:0,uploadsDuringPlayback:0,decoderDisposedBeforePlayback:this.input===null};}
}
