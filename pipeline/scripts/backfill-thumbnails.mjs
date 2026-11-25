// node scripts/backfill-thumbnails.mjs [--dry]
// Stores the cover of every Instagram run converted before thumbnails were kept (11/24). One Apify call per reel.
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN, and the thumbnails bucket (20261125120000).
// Reels that already have a file are skipped, so it can be run again. Uploads cannot be filled in: the file is gone.
import { fetchReel, reelCover } from '../src/instagram.mjs';
import { supabaseRpc, thumbnailPath } from '../src/worker.mjs';

const dry = process.argv.includes('--dry');
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key || !process.env.APIFY_TOKEN) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APIFY_TOKEN.');
  process.exit(1);
}
const base = url.replace(/\/$/, '');
const auth = { apikey: key, authorization: `Bearer ${key}` };

const res = await fetch(`${base}/rest/v1/runs?select=canonical_key&canonical_key=like.instagram:*`, { headers: auth });
if (!res.ok) throw new Error(`runs ${res.status}: ${(await res.text()).slice(0, 200)}`);
const keys = [...new Set((await res.json()).map((r) => r.canonical_key))];
const db = supabaseRpc({ url, key });
let stored = 0;
for (const k of keys) {
  const path = thumbnailPath(k);
  if (!path) continue;
  const head = await fetch(`${base}/storage/v1/object/public/thumbnails/${path}`, { method: 'HEAD' });
  if (head.ok) {
    console.log(`${k}: already stored`);
    continue;
  }
  try {
    const cover = await reelCover(await fetchReel(k.slice('instagram:'.length)));
    if (!cover) {
      console.log(`${k}: no cover`);
      continue;
    }
    if (!dry) await db.uploadThumbnail(path, cover);
    stored += 1;
    console.log(`${k}: ${dry ? 'would store' : 'stored'} ${cover.bytes.byteLength} bytes`);
  } catch (err) {
    console.log(`${k}: failed (${err.message})`);
  }
}
console.log(`${stored}/${keys.length} reels ${dry ? 'would be' : ''} stored`);
