# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["librosa==0.11.0", "soundfile==0.13.1"]
# ///
"""Offline, reproducible onset/beat analysis of the exact benchmark audio.
Run with uv run scripts/analyze-benchmark-audio.py. Never runs during playback.
"""
import hashlib
import json
from pathlib import Path
import librosa
import numpy as np

root = Path(__file__).resolve().parents[1]
source = root / 'prep/fixtures/test-media/audio/track-excerpt.mp3'
destination = root / 'prep/fixtures/test-media/benchmark/audio-events.json'
print('Loading exact MP3 excerpt', flush=True)
y, sr = librosa.load(source, sr=22050, mono=True)
hop = 220
print('Computing spectral-flux onsets and independent beat tracking', flush=True)
envelope = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
# Peak picking uses the spectral flux, not random events or RMS alone.
onset_frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=sr, hop_length=hop, units='frames', backtrack=False)
tempo, beats = librosa.beat.beat_track(onset_envelope=envelope, sr=sr, hop_length=hop, start_bpm=132, tightness=100, trim=False)
beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
tracked_beat_times = beat_times.copy()
# Fit the stable body, rather than making stutter subdivisions follow syncopated onset jitter.
indices = np.arange(len(beat_times))
body = (beat_times >= 20) & (beat_times <= min(160, len(y)/sr-5))
period, intercept = np.polyfit(indices[body], beat_times[body], 1)
phase = float(intercept % period)
beat_times = np.arange(phase, len(y)/sr, period)
onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)
strengths = envelope[onset_frames]
scale = float(np.percentile(strengths, 95)) if len(strengths) else 1
onsets = [{'time': float(t), 'strength': min(1., float(s) / max(scale, 1e-9))} for t, s in zip(onset_times, strengths)]
payload = {
    'version': 1, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'sourceUrl': '/fixtures/test-media/audio/track-excerpt.mp3',
    'duration': len(y)/sr, 'bpm': float(60/period),
    'trackerBpm': float(np.asarray(tempo).flat[0]), 'trackedBeats': tracked_beat_times.tolist(),
    'phaseSeconds':phase,
    'beats': beat_times.tolist(), 'onsets': onsets,
    'analysis': {'library': 'librosa 0.11.0', 'sampleRate': sr, 'hopLength': hop,
                 'onsets': 'positive spectral flux, peak picking; no kick/snare classification',
                 'beats': 'linear beat-time fit to dynamic-programming beat indices in 20-160s; fixed tempo for subdivisions; original trackedBeats retained',
                 'timingResolutionMs': hop/sr*1000,
                 'validation': 'exact audio hash; independent of old Essentia grid; musical alignment still needs listening'},
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(payload, indent=2)+'\n', encoding='utf-8')
intervals=np.diff(beat_times)
print(json.dumps({'bpm':payload['bpm'],'beats':len(beats),'onsets':len(onsets),'firstBeats':beat_times[:12].tolist(),'medianInterval':float(np.median(intervals)),'minInterval':float(min(intervals)),'maxInterval':float(max(intervals)),'output':str(destination)},indent=2),flush=True)
