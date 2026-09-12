import { VideoPool } from './vendor/VideoPool';
import { RemappedFrameSource } from '../remapped-frame-source';
import type { Cut } from './schedule';
export interface Clip {url:string;duration:number;fps:number;width:number;height:number;sha256:string}
export interface Target {source:number;event:Cut;time:number;playing:boolean;epoch:number}
export interface Observation {source:VideoFrame|HTMLCanvasElement|HTMLVideoElement|GPUTexture;pts:number;duration:number;generation:number}
export interface DeckAdapter {
  load():Promise<void>; target(t:Target,future:Cut[]):void; pause():void; dispose():Promise<void>;
  stats():Record<string,unknown>; poll?():void;
}
export type Backend='beatsmaxxer'|'mediabunny'|'libmedia'|'gpu-bank';
export function makeAdapter(backend:Backend,clip:Clip,onFrame:(o:Observation)=>void,onError:(e:string)=>void,budget:number):DeckAdapter {
  if(backend==='beatsmaxxer')return new HtmlDeck(clip,onFrame);
  if(backend==='mediabunny')return new BunnyDeck(clip,onFrame,onError,budget);
  throw new Error('libmedia must pass the capability probe before scoring');
}
class HtmlDeck implements DeckAdapter {
  pool=new VideoPool(); video:HTMLVideoElement|null=null; stopped=false; callback=0; generation=0;
  constructor(private clip:Clip,private frame:(o:Observation)=>void){}
  async load(){
    const candidate=await this.pool.prepare('deck',this.clip.url);
    await this.pool.prewarmCandidate(candidate);
    if(this.stopped){await this.pool.discardCandidate(candidate);return;}
    this.video=this.pool.commitCandidate(candidate).video;
    const observe:VideoFrameRequestCallback=(_,m)=>{
      if(this.stopped)return;
      this.frame({source:this.video!,pts:m.mediaTime,duration:1/this.clip.fps,generation:this.generation});
      this.callback=this.video!.requestVideoFrameCallback(observe);
    };
    this.callback=this.video.requestVideoFrameCallback(observe);
  }
  target(t:Target,_future:Cut[]){
    this.generation=t.event.id;
    this.pool.syncControlledModule('deck',t.source,1,{generation:t.epoch,playing:t.playing,contextTimeSeconds:t.time,positionSeconds:t.time,playbackRate:1},t.event.id);
  }
  pause(){this.video?.pause();}
  async dispose(){this.stopped=true;if(this.video)this.video.cancelVideoFrameCallback(this.callback);await this.pool.dispose();}
  stats(){return {path:'Beatmaxxer VideoPool HTMLVideoElement',observation:'rVFC mediaTime -> common WebGPU upload -> rAF submit',futurePolicy:'pool prewarm; no speculative seek of active video',cacheBytes:0,browserDecoderMemory:'unavailable'};}
}
class BunnyDeck implements DeckAdapter {
  source:RemappedFrameSource; current:Target|null=null; stopped=false;
  constructor(clip:Clip,frame:(o:Observation)=>void,error:(e:string)=>void,budget:number){
    this.source=new RemappedFrameSource(clip.url,f=>{
      if(!this.stopped&&this.current)frame({source:f,pts:f.timestamp/1e6,duration:(f.duration??1e6/clip.fps)/1e6,generation:this.current.event.id});
    },error,{cacheFrames:1000,cacheBytes:budget});
  }
  async load(){await this.source.init();}
  target(t:Target,_future:Cut[]){this.current=t;if(t.playing)this.source.presentAt(t.source);}
  pause(){this.current=null;}
  async dispose(){this.stopped=true;this.source.stop();}
  stats(){return {path:'Mediabunny WebCodecs',observation:'decoded PTS -> common WebGPU upload -> rAF submit',futurePolicy:'bounded sequential decode; LRU reuse, no speculative seek',...this.source.getStats(),browserDecoderMemory:'unavailable'};}
}
