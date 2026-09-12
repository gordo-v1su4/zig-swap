import type {Clip} from './adapters';
interface Player {
  load(url:string):Promise<void>;play(options?:unknown):Promise<void>;pause():Promise<void>;seek(ms:bigint):Promise<void>;destroy():Promise<void>;
  getStats():{videoCurrentTime:bigint;videoFrameRenderCount:bigint};
  on(event:string,fn:(...args:unknown[])=>void):void;
}
declare global {interface Window {AVPlayer?:new(options:Record<string,unknown>)=>Player}}
/** Capability gate only. A player clock is not evidence of the pixels currently on its canvas. */
export async function probeLibmedia(clip:Clip,container:HTMLDivElement){
  if(!window.AVPlayer)await new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='/libmedia/avplayer.js';script.onload=()=>resolve();script.onerror=()=>reject(new Error('libmedia bundle failed'));document.head.append(script);
  });
  const events:unknown[]=[];
  const player=new window.AVPlayer!({container,enableWebGPU:true,enableWebCodecs:true,enableHardware:true,enableWorker:true,checkUseMSE:()=>false,wasmBaseUrl:'https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@1.3.1/dist'});
  player.on('error',(...args)=>events.push({error:String(args)}));
  const timeout=async<T>(p:Promise<T>)=>{let t:ReturnType<typeof setTimeout>;try{return await Promise.race([p,new Promise<never>((_,reject)=>{t=setTimeout(()=>reject(new Error('Capability probe timed out')),15000);})]);}finally{clearTimeout(t!);}};
  try{
    await timeout(player.load(new URL(clip.url,location.href).href));events.push({stage:'loaded'});await timeout(player.play({audio:false}));events.push({stage:'playing'});
    for(const seconds of [1,5,2]){
      await timeout(player.seek(BigInt(seconds*1000)));
      const s=player.getStats();events.push({requested:seconds,reportedVideoTimeMs:String(s.videoCurrentTime),renderCount:String(s.videoFrameRenderCount)});
    }
    return {eligible:false,requestedPath:'libmedia WebCodecs + WebGPU, MSE disabled; fallback may be internally initialized',actualPath:'unverified: no public per-frame decoder identity',reason:'Seeking works, but public render statistics are not an atomic frame/PTS observation. Excluded from latency ranking until frame delivery and decoder identity can be instrumented.',events};
  }catch(e){return {eligible:false,reason:String(e),events};}
  finally{await timeout(player.destroy()).catch(()=>{});container.replaceChildren();}
}
