import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commentsToken, fetchPinnedComment, pinnedCreatorComment } from '../src/comments.mjs';
import { commentSegments, renderForPrompt } from '../src/segments.mjs';
import { loadSource, runPipeline } from '../src/pipeline.mjs';
import { teamIdMap, toEvidenceBundle } from '../src/team-schema.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));

// Tokens are base64 protobufs; only the section name inside matters here.
const token = (section) => encodeURIComponent(Buffer.from(`\x12\x0b${section}`, 'latin1').toString('base64'));
const watchPage = {
  contents: { a: { continuationCommand: { token: token('engagement-panel-other'), request: 'CONTINUATION_REQUEST_TYPE_WATCH_NEXT' } } },
  engagementPanels: [{ b: { continuationCommand: { token: token('comments-section'), request: 'CONTINUATION_REQUEST_TYPE_WATCH_NEXT' } } }],
};

// One thread renderer per comment; pinned ones carry pinnedText. Text and author sit in entity payloads.
const commentsPage = (comments) => ({
  onResponseReceivedEndpoints: [{
    reloadContinuationItemsCommand: {
      continuationItems: comments.map((c) => ({
        commentThreadRenderer: { commentViewModel: { commentViewModel: { commentId: c.id, ...(c.pinned && { pinnedText: '@cook님이 고정함' }) } } },
      })),
    },
  }],
  frameworkUpdates: {
    entityBatchUpdate: {
      mutations: comments.map((c) => ({
        payload: { commentEntityPayload: { properties: { commentId: c.id, content: { content: c.text } }, author: { displayName: c.author, isCreator: c.creator } } },
      })),
    },
  },
});

const RECIPE_COMMENT = '<재료>\n고추장 2스푼, 설탕 1스푼\nhttps://example.test/shop\n#집밥';

test('commentsToken picks the main comments section, not other panels', () => {
  assert.equal(commentsToken(watchPage), token('comments-section'));
  assert.equal(commentsToken({ contents: {} }), null);
});

test('only a comment the creator both wrote and pinned is used', () => {
  const viewerPinned = commentsPage([
    { id: 'a', text: '맛있겠다', author: '@viewer', creator: false, pinned: true },
    { id: 'b', text: RECIPE_COMMENT, author: '@cook', creator: true, pinned: false },
  ]);
  assert.equal(pinnedCreatorComment(viewerPinned), null);
  const creatorPinned = commentsPage([
    { id: 'a', text: '맛있겠다', author: '@viewer', creator: false },
    { id: 'b', text: `  ${RECIPE_COMMENT}  `, author: '@cook', creator: true, pinned: true },
  ]);
  assert.deepEqual(pinnedCreatorComment(creatorPinned), { text: RECIPE_COMMENT, author: '@cook' });
});

// Fake YouTube for the two next calls; the player is only called by fetchTranscript.
const youtubeNext = ({ page = watchPage, comments, status = 200, fail } = {}) => async (url, init) => {
  if (url.includes('/player')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        playabilityStatus: { status: 'OK' },
        videoDetails: { title: 't', author: 'a', lengthSeconds: '10', shortDescription: '' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'ko', kind: 'asr', baseUrl: 'https://example.test/caption' }] } },
      }),
    };
  }
  if (url.includes('example.test/caption')) return { ok: true, status: 200, text: async () => '<transcript><text start="1" dur="2">계란</text></transcript>' };
  if (fail) throw new TypeError('fetch failed');
  const body = JSON.parse(init.body);
  return { ok: status === 200, status, json: async () => (body.continuation ? comments : page) };
};
const recipeComments = commentsPage([{ id: 'b', text: RECIPE_COMMENT, author: '@cook', creator: true, pinned: true }]);

test('fetchPinnedComment returns the comment, or null with a reason, and never throws', async () => {
  assert.equal((await fetchPinnedComment('Smpl0Gochu1', { fetchImpl: youtubeNext({ comments: recipeComments }) })).comment.text, RECIPE_COMMENT);
  const cases = [
    [{ comments: commentsPage([]) }, /no pinned comment/],
    [{ page: { contents: {} } }, /no comments section/],
    [{ status: 403 }, /HTTP 403/],
    [{ fail: true }, /fetch failed/],
  ];
  for (const [yt, note] of cases) {
    const r = await fetchPinnedComment('Smpl0Gochu1', { fetchImpl: youtubeNext(yt) });
    assert.equal(r.comment, null);
    assert.match(r.note, note);
  }
});

test('fetchPinnedComment takes any YouTube link, but sends YouTube only the video ID', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push(JSON.parse(init.body).videoId);
    return youtubeNext({ comments: recipeComments })(url, init);
  };
  for (const input of ['https://www.youtube.com/shorts/Smpl0Gochu1', 'https://youtu.be/Smpl0Gochu1?si=x', ' Smpl0Gochu1 ']) {
    assert.equal((await fetchPinnedComment(input, { fetchImpl })).comment.text, RECIPE_COMMENT, input);
  }
  assert.deepEqual(sent.filter(Boolean), ['Smpl0Gochu1', 'Smpl0Gochu1', 'Smpl0Gochu1']);
  const bad = await fetchPinnedComment('https://www.instagram.com/reel/abc/', { fetchImpl: () => assert.fail('fetched') });
  assert.deepEqual(bad, { comment: null, note: 'not a YouTube video URL or ID: https://www.instagram.com/reel/abc/' });
});

test('loadSource adds the pinned comment, and a comment failure keeps the captions', async () => {
  const ok = await loadSource({ url: 'https://www.youtube.com/shorts/Smpl0Gochu1', fetchImpl: youtubeNext({ comments: recipeComments }) });
  assert.equal(ok.video.pinnedComment, RECIPE_COMMENT);
  assert.equal(ok.segments.length, 1);
  const failed = await loadSource({ url: 'https://www.youtube.com/shorts/Smpl0Gochu1', fetchImpl: youtubeNext({ fail: true }) });
  assert.equal(failed.video.pinnedComment, null);
  assert.equal(failed.segments.length, 1);
  assert.match(failed.commentNote, /fetch failed/);
});

test('comment lines become C01.. evidence, labeled in the prompt, skipping links and hashtags', () => {
  const segs = commentSegments(RECIPE_COMMENT);
  assert.deepEqual(segs.map((s) => [s.id, s.kind, s.text]), [['C01', 'comment', '<재료>'], ['C02', 'comment', '고추장 2스푼, 설탕 1스푼']]);
  assert.equal(renderForPrompt(segs), '[C01 고정 댓글] <재료>\n[C02 고정 댓글] 고추장 2스푼, 설탕 1스푼');
  assert.deepEqual(commentSegments(null), []);
});

test('team IDs number each source separately, comments as comment-N', () => {
  const map = teamIdMap([
    { id: 'S01', kind: 'speech' },
    { id: 'D01', kind: 'description' },
    { id: 'C01', kind: 'comment' },
    { id: 'S02', kind: 'speech' },
    { id: 'C02', kind: 'comment' },
  ]);
  assert.deepEqual([...map.values()], ['asr-0', 'desc-0', 'comment-0', 'asr-1', 'comment-1']);
});

test('a saved transcript with a pinned comment flows into evidence and the team bundle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinned-'));
  try {
    const transcript = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.transcript.json'), 'utf8'));
    transcript.video.pinnedComment = RECIPE_COMMENT;
    const file = join(dir, 't.json');
    writeFileSync(file, JSON.stringify(transcript));
    const result = await runPipeline({ url: 'https://www.youtube.com/shorts/Smpl0Gochu1', transcriptFile: file, llmOutput: structuredClone(llmFixture) });
    assert.deepEqual(result.evidence.filter((s) => s.kind === 'comment').map((s) => s.id), ['C01', 'C02']);
    const bundle = toEvidenceBundle(result);
    assert.deepEqual(bundle.segments.filter((s) => s.type === 'comment').map((s) => s.id), ['comment-0', 'comment-1']);
    assert.deepEqual(bundle.run.stages.pinned_comment, { tool: 'youtube-next', version: 'WEB' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without a pinned comment the bundle has no comment stage', async () => {
  const result = await runPipeline({
    url: 'https://www.youtube.com/shorts/Smpl0Gochu1',
    transcriptFile: fixture('sample-gochujang-bowl.transcript.json'),
    llmOutput: structuredClone(llmFixture),
  });
  assert.equal(toEvidenceBundle(result).run.stages.pinned_comment, undefined);
});
