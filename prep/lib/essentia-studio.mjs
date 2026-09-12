/**
 * Direct Essentia Studio API client — ported from webgpu-research/lab/lib/essentia-studio.mjs
 * Prep lane: POST multipart audio → poll job → studio-audio-v1 result.
 *
 * Env (prep/.env): ESSENTIA_ANALYSIS_ENABLED, ESSENTIA_API_BASE_URL, ESSENTIA_API_KEY
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREP_ROOT = resolve(__dirname, '..');

export const STUDIO_POLL_INTERVAL_MS = 3_000;
export const STUDIO_POLL_TIMEOUT_MS = 30 * 60_000;
export const STUDIO_SUBMIT_TIMEOUT_MS = 120_000;
export const STUDIO_POLL_REQUEST_TIMEOUT_MS = 60_000;
export const STUDIO_TYPICAL_SECONDS = 45;

/** @param {string} [prepRoot] */
export function loadEssentiaEnv(prepRoot = PREP_ROOT) {
  const merged = { ...process.env };
  for (const envPath of [
    resolve(prepRoot, '.env'),
    resolve(prepRoot, '..', '..', 'webgpu-research', 'lab', '.env'),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      merged[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  const apiBaseUrl = (merged.ESSENTIA_API_BASE_URL ?? merged.ESSENTIA_API_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = (merged.ESSENTIA_API_KEY ?? '').trim();
  const enabled =
    merged.ESSENTIA_ANALYSIS_ENABLED?.trim().toLowerCase() === 'true' ||
    (Boolean(apiBaseUrl) && Boolean(apiKey));
  return { apiBaseUrl, apiKey, enabled };
}

function requireEnv(env) {
  if (!env.enabled || !env.apiBaseUrl || !env.apiKey) {
    throw new Error(
      'Essentia unavailable — set ESSENTIA_ANALYSIS_ENABLED=true and ESSENTIA_API_* in prep/.env',
    );
  }
}

function jobErrorMessage(payload, status) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.error && typeof payload.error === 'object') {
      const code = typeof payload.error.code === 'string' ? payload.error.code : 'analysis_failed';
      const message = typeof payload.error.message === 'string' ? payload.error.message : 'Analysis failed.';
      return `${code}: ${message}`;
    }
  }
  return `Hosted analysis failed with HTTP ${status}.`;
}

function parseJob(payload) {
  if (!payload || typeof payload !== 'object' || !payload.id) {
    throw new Error('Hosted analysis returned an invalid job response.');
  }
  const status = payload.status;
  if (status !== 'queued' && status !== 'running' && status !== 'completed' && status !== 'failed') {
    throw new Error('Hosted analysis returned an invalid job response.');
  }
  return payload;
}

/**
 * @param {Buffer | Uint8Array} bytes
 * @param {string} fileName
 * @param {import('./essentia-studio.mjs').EssentiaEnv} env
 * @param {string} [idempotencyKey]
 */
function mimeForFileName(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  return 'audio/mpeg';
}

export async function submitStudioJob(bytes, fileName, env, idempotencyKey = randomUUID()) {
  requireEnv(env);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mimeForFileName(fileName) }), fileName);
  const res = await fetch(`${env.apiBaseUrl}/analyze/studio/jobs`, {
    method: 'POST',
    headers: {
      'X-API-Key': env.apiKey,
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
    signal: AbortSignal.timeout(STUDIO_SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!res.ok) throw new Error(jobErrorMessage(payload, res.status));
  const job = parseJob(payload);
  return job.id;
}

/**
 * @param {string} jobId
 * @param {import('./essentia-studio.mjs').EssentiaEnv} env
 * @param {(stage: string, elapsedSeconds: number) => void} [onProgress]
 */
export async function pollStudioJob(jobId, env, onProgress) {
  requireEnv(env);
  const started = Date.now();
  const deadline = started + STUDIO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const res = await fetch(`${env.apiBaseUrl}/analyze/studio/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'X-API-Key': env.apiKey },
      signal: AbortSignal.timeout(STUDIO_POLL_REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    if (!res.ok) throw new Error(jobErrorMessage(payload, res.status));
    const job = parseJob(payload);
    if (job.id !== jobId) throw new Error('Hosted analysis returned an unexpected job id.');
    onProgress?.(job.stage ?? job.status ?? '-', elapsed);
    if (job.status === 'failed') {
      const code = job.error?.code ?? 'analysis_failed';
      const message = job.error?.message ?? 'Analysis failed.';
      throw new Error(`${code}: ${message}`);
    }
    if (job.status === 'completed') {
      if (job.result?.schema_version !== 'studio-audio-v1') {
        throw new Error('Unsupported hosted analysis result contract.');
      }
      return job.result;
    }
    await new Promise((r) => setTimeout(r, STUDIO_POLL_INTERVAL_MS));
  }
  throw new Error(`Analysis is still running (job ${jobId}). Try again shortly.`);
}

/** @param {string} audioPath @param {import('./essentia-studio.mjs').EssentiaEnv} env @param {typeof pollStudioJob extends (...args: infer A) => unknown ? A[2] : never} onProgress */
export async function analyzeAudioFile(audioPath, env, onProgress) {
  const bytes = readFileSync(audioPath);
  const jobId = await submitStudioJob(bytes, audioPath.split(/[/\\]/).pop() ?? 'track.mp3', env);
  return pollStudioJob(jobId, env, onProgress);
}
