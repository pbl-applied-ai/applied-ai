#!/usr/bin/env node
// Takes jobs from Supabase, runs the pipeline and saves the result (docs/worker-interface.md v0.3).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... node src/worker.mjs [--once]
//
// The service role key bypasses RLS, so it only ever lives in the worker's environment.
// Every write goes through the worker RPCs in supabase/migrations (claim_next_job, set_job_stage,
// complete_job, complete_job_from_cache, fail_job). They only touch the job while it is still the
// attempt this worker claimed, and fail_job owns retries and their delay.
// An upload job (KAN-49) also reads its file from the private "uploads" bucket and deletes it once
// the job is finished, as the upload screen promises.
import { pathToFileURL } from 'node:url';
import { canonicalKey, extractorVersion, isDevVersion, jobVersion, runJob } from './job.mjs';

const POLL_MS = 2000;
const LEASE = '10 minutes';
const UPLOAD_BUCKET = 'uploads';
// Public bucket read by run_thumbnail in SQL (20261125120000_stored_thumbnails.sql).
const THUMBNAIL_BUCKET = 'thumbnails';

// Where a run's thumbnail is kept: 'instagram:<code>' → 'instagram/<code>.jpg', 'upload:<id>' → 'upload/<id>.jpg'.
// YouTube has none (its thumbnail link is built from the video ID). Must match run_thumbnail.
export function thumbnailPath(key) {
  const m = /^(instagram|upload):([A-Za-z0-9_-]+)$/.exec(key ?? '');
  return m ? `${m[1]}/${m[2]}.jpg` : null;
}
// The transcription API picks the format from the file name and takes mp4 and webm, not mov or m4v.
// mov and m4v are the same ISO-BMFF family as mp4 (iPhone videos are mov), so they go as upload.mp4.
const ASR_FILE_BY_EXT = { mp4: 'mp4', m4v: 'mp4', mov: 'mp4', webm: 'webm' };
const MIME_BY_ASR_FILE = { mp4: 'video/mp4', webm: 'video/webm' };

// Minimal PostgREST RPC client: the pipeline keeps zero dependencies, so no supabase-js.
export function supabaseRpc({ url, key, fetchImpl = fetch }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1/rpc`;
  const rpc = async (name, args) => {
    const res = await fetchImpl(`${base}/${name}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase rpc ${name} ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  // Storage REST API, same service key. A missing file reads as null so the job fails as upload_missing.
  // Storage answers a missing object with 400 and a not_found body, but also answers key and request
  // errors with 400, so only the body decides: anything else is an error and the job is retried.
  const isMissing = async (res) => res.status === 404 || (res.status === 400 && /not_found|not found/i.test(await res.clone().text()));
  const object = (path, bucket = UPLOAD_BUCKET) => `${url.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const auth = { apikey: key, authorization: `Bearer ${key}` };
  return {
    downloadUpload: async (path) => {
      const res = await fetchImpl(object(path), { headers: auth });
      if (await isMissing(res)) return null;
      if (!res.ok) throw new Error(`Supabase storage get ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const ext = path.split('.').pop().toLowerCase();
      const asrExt = ASR_FILE_BY_EXT[ext] ?? 'mp4';
      return { bytes: new Uint8Array(await res.arrayBuffer()), filename: `upload.${asrExt}`, mime: MIME_BY_ASR_FILE[asrExt] };
    },
    deleteUpload: async (path) => {
      const res = await fetchImpl(object(path), { method: 'DELETE', headers: auth });
      if (!res.ok && !(await isMissing(res))) throw new Error(`Supabase storage delete ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
    // Overwrites: the same reel converted again gets the newer cover.
    uploadThumbnail: async (path, { bytes, mime }) => {
      const res = await fetchImpl(object(path, THUMBNAIL_BUCKET), {
        method: 'POST',
        headers: { ...auth, 'content-type': mime, 'x-upsert': 'true', 'cache-control': '86400' },
        body: bytes,
      });
      if (!res.ok) throw new Error(`Supabase storage put ${res.status}: ${(await res.text()).slice(0, 300)}`);
    },
    claimJob: async () => (await rpc('claim_next_job', { p_lease: LEASE }))?.[0] ?? null,
    setStage: (job, stage) => rpc('set_job_stage', { p_job_id: job.id, p_attempt: job.attempts, p_stage: stage }),
    findCachedRun: (key, version) => rpc('find_cached_run', { p_canonical_key: key, p_extractor_version: version }),
    completeFromCache: (job, runId) => rpc('complete_job_from_cache', { p_job_id: job.id, p_attempt: job.attempts, p_run_id: runId }),
    complete: (job, out) => rpc('complete_job', {
      p_job_id: job.id,
      p_attempt: job.attempts,
      p_canonical_key: out.canonical_key,
      p_extractor_version: out.extractor_version,
      p_bundle: out.bundle,
      p_recipe: out.recipe,
      p_metrics: out.metrics,
      p_internal: out.internal,
    }),
    fail: (job, out) => rpc('fail_job', {
      p_job_id: job.id,
      p_attempt: job.attempts,
      p_stage: out.stage ?? 'collect',
      p_error_code: out.error_code,
      p_reason: out.reason,
      p_retry: out.retry,
      p_message: out.message,
      p_canonical_key: out.canonical_key,
      p_extractor_version: out.extractor_version,
      p_partial: out.partial ? { ...out.partial, metrics: out.metrics } : null,
    }),
  };
}

// Apify sometimes leaves out a reel's audio and gives a video with no sound track. That can pass, so the
// first silent result is not reused ('no_audio'). But a reel that has no sound at all would then be read
// again on every request, so when an earlier read of the same version was silent too, this one is kept
// ('none', which the lookup above asks for). (#81 review)
const SILENT = 'none';
async function silentRead(out, key, db) {
  if (out.status !== 'succeeded' || out.extractor_version?.speech !== 'no_audio') return out;
  const before = await db.findCachedRun(key, out.extractor_version);
  return before ? { ...out, extractor_version: { ...out.extractor_version, speech: SILENT } } : out;
}

// Processes one claimed job. Returns what happened, for logs and tests.
export async function processJob(job, { db, env = process.env, fetchImpl = fetch, log = console.log, run = runJob } = {}) {
  const key = canonicalKey(job.source_url);
  const version = jobVersion(job.source_url, env);

  // An upload is never in the cache (its key is the upload ID), so it skips the lookup.
  const cacheable = key && !job.upload_path && !isDevVersion(version);
  if (cacheable) {
    // A reel read silent twice (silentRead below) is kept as it is, so it is not read and paid for every time.
    const cached = (await db.findCachedRun(key, version)) ?? (await db.findCachedRun(key, { ...version, speech: SILENT }));
    if (cached) {
      const done = await db.completeFromCache(job, cached);
      return { outcome: done ? 'cached' : 'lost', run_id: cached };
    }
  }

  // Stage writes are chained so they land in order, and awaited before the final write.
  let writes = Promise.resolve();
  const onStage = ({ stage, state }) => {
    if (state !== 'started') return;
    writes = writes.then(() => db.setStage(job, stage)).catch((err) => log(`job ${job.id}: stage write failed: ${err.message}`));
  };
  const input = { job_id: job.id, source_url: job.source_url };
  // A missing file goes to runJob as no upload, which fails the job as upload_missing. A storage error
  // fails it as a retry, so it does not sit in running until the lease runs out.
  let out;
  let unread = false;
  if (job.upload_path) {
    try {
      input.upload = (await db.downloadUpload(job.upload_path)) ?? undefined;
    } catch (err) {
      unread = true;
      out = { status: 'failed', canonical_key: key, extractor_version: version, stage: 'collect', error_code: 'retryable', reason: 'collect_network', retry: true, message: err.message, partial: null, metrics: { stages: [] } };
    }
  }
  out ??= await run(input, { onStage, env, fetchImpl });
  await writes;
  if (cacheable) out = await silentRead(out, key, db);

  const result = await save(job, out, db);
  // A thumbnail only makes the card nicer, so a failed upload is logged and the job stays done.
  const thumbPath = thumbnailPath(key);
  if (result.outcome === 'succeeded' && out.thumbnail && thumbPath && db.uploadThumbnail) {
    try {
      await db.uploadThumbnail(thumbPath, out.thumbnail);
    } catch (err) {
      log(`job ${job.id}: thumbnail upload failed: ${err.message}`);
    }
  }
  // The file is deleted once the job is over. A retry still needs it, a lost job belongs to another attempt,
  // and a file the worker could not read (storage or key error) is kept so the job can be run again.
  if (job.upload_path && !unread && (result.outcome === 'succeeded' || result.outcome === 'failed')) {
    try {
      await db.deleteUpload(job.upload_path);
    } catch (err) {
      log(`job ${job.id}: upload delete failed: ${err.message}`);
    }
  }
  return result;
}

// A null answer means the lease ran out and another attempt owns the job now.
async function save(job, out, db) {
  if (out.status === 'succeeded') {
    const runId = await db.complete(job, out);
    return runId ? { outcome: 'succeeded', run_id: runId, metrics: out.metrics } : { outcome: 'lost' };
  }
  const status = await db.fail(job, out);
  if (!status) return { outcome: 'lost' };
  return { outcome: status === 'queued' ? 'requeued' : 'failed', error_code: out.error_code, reason: out.reason, metrics: out.metrics };
}

async function main() {
  const once = process.argv.includes('--once');
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const db = supabaseRpc({ url, key });
  const version = extractorVersion();
  console.log(`worker started: pipeline ${version.pipeline}, model ${version.model ?? '(no LLM key)'}`);
  if (isDevVersion(version)) console.log('PIPELINE_TREE is not set: results are saved but never reused from the cache.');

  for (;;) {
    let job;
    try {
      job = await db.claimJob();
    } catch (err) {
      console.error(`claim failed: ${err.message}`);
    }
    if (job) {
      const t0 = Date.now();
      try {
        const r = await processJob(job, { db });
        console.log(`job ${job.id} (attempt ${job.attempts}): ${r.outcome}${r.reason ? ` ${r.reason}` : ''} in ${Date.now() - t0}ms`);
      } catch (err) {
        // The lease hands the job to another attempt; nothing more to do here.
        console.error(`job ${job.id}: ${err.message}`);
      }
      continue;
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
