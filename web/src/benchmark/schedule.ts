import { createTimeSamplerState, reduceTimeSampler } from './vendor/reducer';
import {nextGrooveBeat} from './vendor/groove';
import type { TimeSamplerParams, TimeSamplerTransportSample } from './vendor/types';
export interface Grid { beats: number[]; duration: number; bpm: number; onsets?:{time:number;strength:number}[]; variedGroove?:boolean; stems?:{name:string;notes:{time:number;note:number;velocity:number;channel:number}[]}[] }
export interface Cut { id: number; at: number; source: number; pattern: string; stress: boolean; surprise: boolean; beat: number; triggerTime?:number }
export const patterns = ['midi-stems','audio-dense','audio-stutter4','mixed','straight','forward','backward','quarter','eighth','sixteenth','stutter2','stutter4','stutter8','dotted','swing','surprise','32nd','64th'] as const;
export type Pattern = typeof patterns[number];
export function beatTime(grid: Grid, beat: number): number {
  const i = Math.floor(beat), f = beat-i;
  if (i < 0) return grid.beats[0] + beat * (grid.beats[1]-grid.beats[0]);
  if (i >= grid.beats.length-1) return grid.beats.at(-1)! + (beat-grid.beats.length+1)*60/grid.bpm;
  return grid.beats[i] + f*(grid.beats[i+1]-grid.beats[i]);
}
export function beatAt(grid: Grid, seconds: number): number {
  let lo=0, hi=grid.beats.length-1;
  while(lo<hi) { const mid=Math.ceil((lo+hi)/2); if(grid.beats[mid]<=seconds)lo=mid;else hi=mid-1; }
  const interval=(grid.beats[lo+1]??grid.beats[lo]+60/grid.bpm)-grid.beats[lo];
  return lo+(seconds-grid.beats[lo])/interval;
}
export function buildSchedule(grid: Grid, durations: number[], seed: number, seconds: number, selected: Pattern='mixed'): Cut[][] {
  if(grid.beats.length<2 || grid.beats.some((b,i)=>!Number.isFinite(b)||(i>0&&b<=grid.beats[i-1]))) throw new Error('Invalid beat grid');
  if(selected==='midi-stems')return buildMidiSchedule(grid,durations,seed,seconds);
  if(selected==='audio-stutter4'||selected==='audio-dense')return buildAudioSchedule(grid,durations,seed,seconds,selected==='audio-dense');
  return durations.map((duration,deck)=>{
    const events: Cut[]=[];
    let rnd=(seed+deck*997)>>>0;
    const random=()=>{rnd=(Math.imul(rnd,1664525)+1013904223)>>>0;return rnd/4294967296;};
    if(selected==='straight')return [{id:0,at:0,source:deck*duration/durations.length,pattern:'straight',stress:false,surprise:false,beat:0}];
    for(let bar=0;beatTime(grid,bar*4)<seconds;bar++) {
      // Cycle guarantees coverage; seed varies order between decks and source selection.
      const choices: Pattern[]=['straight','forward','backward','quarter','eighth','sixteenth','stutter4','swing','dotted','stutter2','stutter8','surprise'];
      const pattern=selected==='mixed'?choices[(bar+deck*3+Math.abs(seed)%choices.length)%choices.length]:selected;
      const start=bar*4;
      const step=pattern==='straight'?4:pattern==='sixteenth'||pattern==='stutter8'?.25:pattern==='32nd'?.125:pattern==='64th'?.0625:pattern==='quarter'||pattern==='forward'||pattern==='backward'?1:.5;
      const stress=step<.25;
      const params:TimeSamplerParams={sourceDurationSeconds:duration,sliceCount:8,mode:pattern==='backward'?'REV':pattern==='forward'?'FWD':'RND',jumpSizeBeats:step,loopCount:pattern==='stutter4'?4:pattern==='stutter2'?2:pattern==='stutter8'?8:1,playbackRate:1,accentMode:'OFF',randomSeed:Math.floor(random()*0xffffffff),feel:pattern==='swing'?1:pattern==='dotted'?2:0};
      const sample=(beat:number):TimeSamplerTransportSample=>({transportSeconds:beatTime(grid,beat),audioOutputTimeSeconds:beatTime(grid,beat),performanceTimeSeconds:beatTime(grid,beat),playing:true,discontinuityGeneration:bar,beatPosition:beat,beatPhase:beat%1,beatIntervalSeconds:beatTime(grid,Math.floor(beat)+1)-beatTime(grid,Math.floor(beat)),presentationTimeSeconds:beatTime(grid,beat),transportSecondsAtBeat:b=>beatTime(grid,b)});
      let reduction=createTimeSamplerState(sample(start),params);
      // Offset starting slices to avoid every deck opening on frame zero.
      const offset=deck*duration/durations.length;
      let beat=start;
      while(beat<start+4-1e-7) {
        const at=Math.max(0,beatTime(grid,beat));
        if(at>=seconds)break;
        const source=stress?Math.floor(random()*8)*duration/8:reduction.output.sourceTimestampSeconds;
        events.push({id:events.length,at,source:(source+offset)%duration,pattern,stress,surprise:pattern==='surprise',beat});
        beat=stress?beat+step:reduction.nextState.nextBoundaryBeat;
        if(beat>=start+4-1e-7)break;
        reduction=reduceTimeSampler(reduction.nextState,sample(beat),[],params);
      }
    }
    if(!events.length||events[0].at>0)events.unshift({id:-1,at:0,source:0,pattern:'preroll',stress:false,surprise:false,beat:-1});
    return events.map((e,i)=>({...e,id:i}));
  });
}
export function strongOnsets(grid:Grid,dense=false){
  const selected:{time:number;strength:number}[]=[];
  for(const onset of grid.onsets??[]){
    if(onset.strength>=(dense?.45:.65)&&onset.time>=0&&Number.isFinite(onset.time)&&(!selected.length||onset.time-selected.at(-1)!.time>=(dense?.08:.12)))selected.push(onset);
  }
  return selected;
}
export function buildAudioSchedule(grid:Grid,durations:number[],seed:number,seconds:number,dense=false):Cut[][]{
  const triggers=strongOnsets(grid,dense);
  if(!triggers.length)throw new Error('Audio onset analysis is required; no random fallback');
  return durations.map((duration,deck)=>{
    let state=(seed+deck*997)>>>0,blockedUntil=-1;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const events:Cut[]=[{id:0,at:0,source:deck*duration/durations.length,pattern:'preroll',stress:false,surprise:false,beat:0}];
    let accepted=0;
    for(const [index,onset] of triggers.entries()){
      if(onset.time>=seconds)break;
      if(onset.time<blockedUntil||index%(dense?1:1+deck%3)!==0)continue;
      const source=Math.floor(random()*8)*duration/8;
      events.push({id:events.length,at:onset.time,source,pattern:'audio-onset',stress:false,surprise:false,beat:beatAt(grid,onset.time),triggerTime:onset.time});
      // Every fourth accepted onset starts a four-repeat burst. Deck phases differ.
      if(accepted++%(dense?2:4)===deck%(dense?2:4)){
        const step=dense?[1,.5,.25][(accepted+deck)%3]:deck%2?.25:.5;
        const feel:0|1|2=dense&&grid.variedGroove?(accepted+deck)%3 as 0|1|2:0;
        const repeats=dense?[2,4,8][(accepted+deck)%3]:4;
        // Give the onset at least two 60 Hz display opportunities before repeating.
        let beat=nextGrooveBeat(beatAt(grid,onset.time+1/30),step,feel);
        for(let repeat=0;repeat<repeats;repeat++){
          const at=beatTime(grid,beat);
          if(at>=seconds)break;
          events.push({id:events.length,at,source,pattern:`stutter${repeats}-${step===1?'quarter':step===.5?'eighth':'sixteenth'}-${['straight','swing','dotted'][feel]}`,stress:false,surprise:false,beat,triggerTime:onset.time});
          beat=nextGrooveBeat(beat+1e-7,step,feel);
        }
        blockedUntil=beatTime(grid,beat);
      }
    }
    return events;
  });
}
export function targetAt(events: Cut[], time:number, duration:number) {
  let lo=0,hi=events.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(events[mid].at<=time)lo=mid;else hi=mid-1;}
  const event=events[lo];
  return { event, source:((event.source+Math.max(0,time-event.at))%duration+duration)%duration };
}

export function buildMidiSchedule(grid:Grid,durations:number[],seed:number,seconds:number):Cut[][] {
  if(!grid.stems?.length)throw new Error('MIDI stem events are required');
  return durations.map((duration,deck)=>{
    const stem=grid.stems![deck%grid.stems!.length];
    const step=stem.name==='vocals'?.5:stem.name==='synth'?.25:1;
    let state=(seed+deck*997)>>>0,blockedUntil=0;
    const events:Cut[]=[{id:0,at:0,source:deck*duration/durations.length,pattern:stem.name+'-preroll',stress:false,surprise:false,beat:0}];
    for(const note of stem.notes){
      if(note.time>=seconds)break;
      if(note.time<blockedUntil||note.velocity<=0)continue;
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const source=Math.floor(state/4294967296*8)*duration/8;
      const startBeat=beatAt(grid,note.time);
      // Four plays of the same anchor, beginning exactly at the note-on.
      // Chords and notes inside a burst coalesce so they cannot cancel repeats.
      for(let repeat=0;repeat<4;repeat++){
        const beat=startBeat+repeat*step,at=beatTime(grid,beat);
        if(at>=seconds)break;
        events.push({id:events.length,at,source,pattern:stem.name+'-stutter4-'+(step===1?'quarter':step===.5?'eighth':'sixteenth')+'-note'+note.note,stress:false,surprise:false,beat,triggerTime:note.time});
      }
      blockedUntil=beatTime(grid,startBeat+4*step);
    }
    return events;
  });
}
