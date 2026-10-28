#!/usr/bin/env node
// Takes jobs from Supabase, runs the pipeline and saves the result (docs/worker-interface.md v0.3).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... node src/worker.mjs [--once]
//
// The service role key bypasses RLS, so it only ever lives in the worker's environment.
// Every write goes through the worker RPCs in supabase/migrations (claim_next_job, set_job_stage,
// complete_job, complete_job_from_cache, fail_job). They only touch the job while it is still the
// attempt this worker claimed, and fail_job owns retries and their delay.
import { pathToFileURL } from 'node:url';
import { canonicalKey, extractorVersion, isDevVersion, runJob } from './job.mjs';

const POLL_MS = 2000;
const LEASE = '10 minutes';

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
  return {
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

// Processes one claimed job. Returns what happened, for logs and tests.
export async function processJob(job, { db, env = process.env, fetchImpl = fetch, log = console.log, run = runJob } = {}) {
  const key = canonicalKey(job.source_url);
  const version = extractorVersion(env);

  if (key && !isDevVersion(version)) {
    const cached = await db.findCachedRun(key, version);
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
  const out = await run({ job_id: job.id, source_url: job.source_url }, { onStage, env, fetchImpl });
  await writes;

  // A null answer means the lease ran out and another attempt owns the job now.
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
