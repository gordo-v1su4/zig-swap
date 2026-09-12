import { targetAt, type Cut } from './schedule';
export const percentile=(values:number[],q:number)=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.ceil(q*a.length)-1)];};
export class FrameScore {
  observations: {time:number;generation:number;pts:number;error:number;accepted:boolean}[]=[];
  first=new Map<number,number>();
  constructor(public events:Cut[],public duration:number,public fps:number){}
  observe(time:number,generation:number,pts:number,frameDuration:number):boolean {
    const target=targetAt(this.events,time,this.duration);
    const direct=pts-target.source;
    const error=Math.abs(direct)>this.duration/2?direct-Math.sign(direct)*this.duration:direct;
    const accepted=generation===target.event.id&&error<=1/60&&error>=-frameDuration-1/60;
    this.observations.push({time,generation,pts,error,accepted});
    if(accepted&&!this.first.has(generation))this.first.set(generation,time);
    return accepted;
  }
  summary(elapsed:number,displayInterval:number) {
    const due=this.events.filter(e=>e.at<elapsed&&e.pattern!=='preroll');
    const standard=due.filter(e=>!e.stress), stress=due.filter(e=>e.stress);
    const summarize=(events:Cut[])=>{
      const latency=events.flatMap(e=>this.first.has(e.id)?[(this.first.get(e.id)!-e.at)*1000]:[]);
      const onTime=events.filter(e=>this.first.has(e.id)&&this.first.get(e.id)!-e.at<=displayInterval).length;
      return {cuts:events.length,missedCuts:events.length-latency.length,onTimeCuts:onTime,onTimePercent:events.length?100*onTime/events.length:0,p50Ms:percentile(latency,.5),p95Ms:percentile(latency,.95),p99Ms:percentile(latency,.99)};
    };
    return {...summarize(standard),stress:summarize(stress),rejectedFrames:this.observations.filter(o=>!o.accepted).length,sourceErrorP95Ms:percentile(this.observations.map(o=>Math.abs(o.error)*1000),.95),unresolvableCuts:due.filter((e)=>{const next=this.events[e.id+1];return next&&next.at-e.at<displayInterval;}).length};
  }
}
