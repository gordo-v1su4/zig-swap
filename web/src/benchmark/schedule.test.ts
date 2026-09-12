import { expect, test } from 'bun:test';
import { buildSchedule, targetAt, beatTime } from './schedule';
const grid = { beats: Array.from({ length: 301 }, (_, i) => i * 0.5), duration: 150, bpm: 120 };
test('four stutters repeat the same source window on eighth notes without slowing the clock', () => {
  const events = buildSchedule(grid, [20], 42, 4, 'stutter4')[0];
  expect(events.slice(0, 4).map(e => e.at)).toEqual([0, .25, .5, .75]);
  expect(new Set(events.slice(0, 4).map(e => e.source)).size).toBe(1);
  expect(targetAt(events, .625, 20).source).toBeCloseTo(events[2].source + .125);
});
test('swing is 2:1, dotted eighths are three quarters of a beat',()=>{
  expect(buildSchedule(grid,[20],1,2,'swing')[0].slice(0,3).map(e=>e.at)).toEqual([0,1/3,.5]);
  expect(buildSchedule(grid,[20],1,2,'dotted')[0].slice(0,3).map(e=>e.at)).toEqual([0,.375,.75]);
});
test('same seed replays eight independent decks and backward jumps continue forward',()=>{
  const a=buildSchedule(grid,Array(8).fill(20),37,120);
  expect(a).toEqual(buildSchedule(grid,Array(8).fill(20),37,120));
  expect(a[0]).not.toEqual(a[1]);
  const back=buildSchedule(grid,[20],1,3,'backward')[0];
  expect(back[1].source).toBeLessThan(back[0].source);
  expect(targetAt(back,.6,20).source).toBeGreaterThan(back[1].source);
});
test('beat mapping uses irregular locked timestamps and stress is explicitly labeled',()=>{
  expect(beatTime({...grid,beats:[0,.4,1]},1.5)).toBe(.7);
  const stress=buildSchedule(grid,[20],1,1,'64th')[0];
  expect(stress[1].at).toBe(.03125);
  expect(stress.every(e=>e.stress)).toBe(true);
});
test('audio onsets trigger exact cuts and four quantized repeats survive intervening transients',()=>{
  const g={...grid,onsets:[{time:.6,strength:1},{time:.8,strength:1},{time:2,strength:.1}]};
  const cuts=buildSchedule(g,[20],42,3,'audio-stutter4')[0];
  expect(cuts.map(c=>c.at)).toEqual([0,.6,.75,1,1.25,1.5]);
  expect(new Set(cuts.slice(1).map(c=>c.source)).size).toBe(1);
  expect(cuts.slice(1).every(c=>c.triggerTime===.6)).toBe(true);
});
test('an onset just before a grid boundary remains visible before the stutter',()=>{
  const g={...grid,onsets:[{time:.749,strength:1}]};
  const cuts=buildSchedule(g,[20],1,3,'audio-stutter4')[0];
  expect(cuts[2].at).toBe(1);
  expect(cuts[2].at-cuts[1].at).toBeGreaterThan(1/30);
});

test('MIDI stems use their note-on times and retain four repeats through overlapping notes',()=>{
  const note=(time:number)=>({time,note:60,velocity:100,channel:0});
  const grid={beats:Array.from({length:40},(_,i)=>i*.48),duration:18,bpm:125,stems:[{name:'vocals',notes:[note(.51),note(.51),note(.6)]},{name:'synth',notes:[note(2.4)]},{name:'bass',notes:[note(10.113)]}]};
  const decks=buildSchedule(grid,[12,12,12],42,15,'midi-stems');
  expect(decks[0].slice(1).map(e=>Number(e.at.toFixed(3)))).toEqual([.51,.75,.99,1.23]);
  expect(decks[1].slice(1).map(e=>Number(e.at.toFixed(3)))).toEqual([2.4,2.52,2.64,2.76]);
  expect(decks[2].slice(1).map(e=>Number(e.at.toFixed(3)))).toEqual([10.113,10.593,11.073,11.553]);
  expect(new Set(decks[0].slice(1).map(e=>e.source)).size).toBe(1);
});
