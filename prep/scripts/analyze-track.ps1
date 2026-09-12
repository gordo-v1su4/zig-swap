# Prep lane: MP3 excerpt + Essentia beat grid via direct Studio API (prep/.env keys).
# Requires: ffmpeg on PATH, ESSENTIA_API_* in prep/.env (or webgpu-research/lab/.env).
param(
    [string]$Wav = (Join-Path $PSScriptRoot "..\fixtures\test-media\audio\Love me tonight (fullsong).wav"),
    [int]$ExcerptSeconds = 180
)

$ErrorActionPreference = "Stop"
$prepRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$audioDir = Join-Path $prepRoot "fixtures\test-media\audio"
$analysisDir = Join-Path $prepRoot "fixtures\test-media\analysis"
New-Item -ItemType Directory -Force -Path $audioDir, $analysisDir | Out-Null

$mp3 = Join-Path $audioDir "track-excerpt.mp3"
$beatsJson = Join-Path $analysisDir "track.beats.json"

if (-not (Test-Path $Wav)) {
    Write-Error "Missing WAV: $Wav"
}

Write-Host "MP3 excerpt ($ExcerptSeconds s) for studio upload..."
ffmpeg -y -nostdin -loglevel error -i $Wav -t $ExcerptSeconds -vn -c:a libmp3lame -q:a 2 $mp3

Write-Host "Essentia direct API (expect ~40-50 s) ..."
bun run (Join-Path $PSScriptRoot "analyze-track.mjs")
if (-not (Test-Path $beatsJson)) { throw "track.beats.json not written" }
Write-Host "Done: $beatsJson"
