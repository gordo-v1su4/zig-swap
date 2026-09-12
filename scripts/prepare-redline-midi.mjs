import {parseMidi} from 'midi-file';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve('../beatsmaxxer-pro/test_media/Redline (Remastered) Stems');
const out=resolve('prep/fixtures/test-media/benchmark');mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const audioSource=join(root,'Redline (Remastered).mp3'),audio=readFileSync(audioSource);
copyFileSync(audioSource,join(out,'redline.mp3'));
const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',audioSource],{encoding:'utf8'});
if(probe.status!==0)throw new Error(probe.stderr);
const duration=Number(probe.stdout);
const stems=[];let commonBeats=[];
for(const name of ['Vocals','Synth','Bass']){
  const path=join(root,`Redline (Remastered) (${name}).mid`),bytes=readFileSync(path),midi=parseMidi(bytes);
  if(!midi.header.ticksPerBeat)throw new Error('SMPTE MIDI not supported');
  const ppq=midi.header.ticksPerBeat;
  const events=midi.tracks.flatMap(track=>{let tick=0;return track.map(e=>({...e,tick:tick+=e.deltaTime}));}).sort((a,b)=>a.tick-b.tick);
  let tick=0,time=0,tempo=500000;const notes=[],tempos=[];
  for(const e of events){
    time+=(e.tick-tick)/ppq*tempo/1e6;tick=e.tick;
    if(e.type==='setTempo'){tempo=e.microsecondsPerBeat;tempos.push({tick,time,tempo});}
    if(e.type==='noteOn'&&e.velocity>0)notes.push({time,note:e.noteNumber,velocity:e.velocity,channel:e.channel});
  }
  const timeAt=t=>{let segment={tick:0,time:0,tempo:500000};for(const entry of tempos){if(entry.tick>t)break;segment=entry;}return segment.time+(t-segment.tick)/ppq*segment.tempo/1e6;};
  const beats=[];for(let t=0;timeAt(t)<duration;t+=ppq)beats.push(timeAt(t));
  if(!commonBeats.length)commonBeats=beats;
  const warnings=events.filter(e=>e.type==='keySignature'&&Math.abs(e.key)>7).map(e=>`Nonstandard key signature ${e.key}; ignored for note timing`);
  stems.push({name:name.toLowerCase(),file:`Redline (Remastered) (${name}).mid`,sha256:hash(bytes),ppq,notes,tempos,warnings});
  console.log(`${name}: ${notes.length} note-ons, first ${notes[0]?.time.toFixed(3)}s, last ${notes.at(-1)?.time.toFixed(3)}s, ${tempos.length} tempo events`);
}
writeFileSync(join(out,'redline-midi.json'),JSON.stringify({version:1,sourceUrl:'/fixtures/test-media/benchmark/redline.mp3',sourceSha256:hash(audio),duration,bpm:60/((commonBeats.at(-1)-commonBeats[0])/(commonBeats.length-1)),beats:commonBeats,stems,analysis:{method:'MIDI note-on timing with each file tempo map; vocal MIDI tempo map supplies common beat subdivisions',audio:'Unchanged Redline mix from same stem export folder',alignment:'Export-relative timestamps; no manually applied offset; validate alignment by listening',parser:'midi-file 1.2.4; malformed key signature does not affect delta ticks or note events'}},null,2));
