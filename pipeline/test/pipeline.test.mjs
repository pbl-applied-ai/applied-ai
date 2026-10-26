import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeCaptionText, fetchTranscript, parseCaptionXml, parseVideoId, watchUrl } from '../src/youtube.mjs';
import { descriptionSegments, normalizeSegments, renderForPrompt } from '../src/segments.mjs';
import { parseAmount } from '../src/ingredients.mjs';
import { resolveRecipe } from '../src/resolve.mjs';
import { extractRecipe, resolveProvider } from '../src/llm.mjs';
import { runPipeline } from '../src/pipeline.mjs';
import { PROMPT_VERSION, RECIPE_SCHEMA } from '../src/schema.mjs';
import { teamIdMap, toEvidenceBundle, toTeamRecipe } from '../src/team-schema.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const llmFixture = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.llm.json'), 'utf8'));

test('parseVideoId handles every YouTube URL shape', () => {
  const id = 'Smpl0Gochu1';
  for (const u of [
    id,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/shorts/${id}?feature=share`,
    `https://www.youtube.com/watch?v=${id}&t=10s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) assert.equal(parseVideoId(u), id, u);
  assert.equal(parseVideoId('https://www.instagram.com/reel/abc/'), null);
  assert.equal(parseVideoId('not a url'), null);
});

test('watchUrl builds a seekable link (Shorts URLs cannot seek)', () => {
  assert.equal(watchUrl('Smpl0Gochu1', 16.24), 'https://www.youtube.com/watch?v=Smpl0Gochu1&t=16s');
});

test('caption XML parsing decodes double-encoded entities and speaker markers', () => {
  const xml = '<transcript><text start="1.5" dur="2">We&amp;#39;re &amp;amp; ok</text><text start="3" dur="1">&gt;&gt; 계란</text><text start="4">  </text></transcript>';
  assert.deepEqual(parseCaptionXml(xml), [
    { startMs: 1500, durMs: 2000, text: "We're & ok" },
    { startMs: 3000, durMs: 1000, text: '계란' },
  ]);
  assert.equal(decodeCaptionText('a&#39;b'), "a'b");
});

test('srv3 caption format is also parsed', () => {
  assert.deepEqual(parseCaptionXml('<timedtext><body><p t="2120" d="4720">수 있는</p></body></timedtext>'), [
    { startMs: 2120, durMs: 4720, text: '수 있는' },
  ]);
});

test('sample fixture normalizes into stable S01..S21 IDs', () => {
  const t = JSON.parse(readFileSync(fixture('sample-gochujang-bowl.transcript.json'), 'utf8'));
  const segs = normalizeSegments(t.segments);
  assert.equal(segs.length, 21);
  assert.equal(segs[0].id, 'S01');
  assert.equal(segs[20].id, 'S21');
  assert.equal(segs[9].startMs, 16240);
  assert.match(renderForPrompt(segs.slice(9, 10)), /^\[S10 00:16\] /);
});

test('descriptionSegments keeps one line per unit and skips links and hashtags', () => {
  const d = descriptionSegments('재료\n목살 200g\n\nhttps://example.com/x\n#요리 #레시피\n고추장 2스푼');
  assert.deepEqual(d.map((s) => [s.id, s.kind, s.text]), [
    ['D01', 'description', '재료'],
    ['D02', 'description', '목살 200g'],
    ['D03', 'description', '고추장 2스푼'],
  ]);
  assert.equal(renderForPrompt(d.slice(1, 2)), '[D02 설명] 목살 200g');
});

test('parseAmount reads verbatim amounts without converting units', () => {
  const p = (q, q2, unit, qualitative = false) => ({ quantity: q, quantity2: q2, unit, qualitative });
  assert.deepEqual(parseAmount('2스푼'), p(2, null, '스푼'));
  assert.deepEqual(parseAmount('1~2큰술'), p(1, 2, '큰술'));
  assert.deepEqual(parseAmount('한 줌'), p(1, null, '줌'));
  assert.deepEqual(parseAmount('두 스푼'), p(2, null, '스푼'));
  assert.deepEqual(parseAmount('반 개'), p(0.5, null, '개'));
  assert.deepEqual(parseAmount('한 개 반'), p(1.5, null, '개'));
  assert.deepEqual(parseAmount('½ tsp'), p(0.5, null, 'tsp'));
  assert.deepEqual(parseAmount('200g'), p(200, null, 'g'));
  assert.deepEqual(parseAmount('하나'), p(1, null, null));
  assert.deepEqual(parseAmount('약간'), p(null, null, null, true));
  assert.deepEqual(parseAmount('살짝만'), p(null, null, null));
  assert.deepEqual(parseAmount(null), p(null, null, null));
});

test('reference output resolves to the expected times, amounts and summary', async () => {
  const result = await runPipeline({ transcriptFile: fixture('sample-gochujang-bowl.transcript.json'), llmOutput: llmFixture, url: 'https://www.youtube.com/shorts/Smpl0Gochu1' });
  const r = result.recipe;
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.steps.map((s) => s.start_ms), [4440, 9080, 10920, 16240, 18359, 21840, 26480, 31920, 34000]);
  assert.ok(r.steps.every((s) => s.timing === 'ok'));
  assert.equal(r.steps[3].end_ms, 18359, 'a step ends where the next one starts');
  assert.equal(r.steps[3].watch_url, 'https://www.youtube.com/watch?v=Smpl0Gochu1&t=16s');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.summary, {
    ingredients: 13, amounts_confirmed: 2, amounts_needs_review: 0, amounts_conflict: 0, steps: 9, steps_timed: 9,
  });
  const egg = r.ingredients[2];
  assert.equal(egg.id, 'ing_03');
  assert.equal(egg.amount_status, 'confirmed');
  assert.equal(egg.amount_text, '하나');
  const [amount] = egg.amounts;
  assert.deepEqual([amount.verbatim, amount.needs_review, amount.parsed.quantity, amount.sources], [true, false, 1, ['speech']]);
  assert.deepEqual(amount.evidence.map((e) => [e.segment_id, e.kind, e.start_ms]), [['S07', 'speech', 12759]]);
  assert.equal(r.ingredients[3].amount_status, 'not_in_video');
  assert.equal(r.tips[0].start_ms, 13599);
  assert.equal(result.meta.prompt_version, PROMPT_VERSION);
});

const tinySegments = () =>
  normalizeSegments([
    { startMs: 0, durMs: 1000, text: '고추장 2스푼 넣고' },
    { startMs: 5000, durMs: 1000, text: '설탕 넣어요' },
    { startMs: 9000, durMs: 1000, text: '볶아 주세요' },
  ]);

const draft = (overrides) => ({
  not_a_recipe: false, title: 't', servings: null, servings_evidence: [], ingredients: [], steps: [], tips: [], ...overrides,
});

const ing = (name, amount, amountEvidence, evidence = amountEvidence) => ({
  name, preparation: null, amounts: amount ? [{ text: amount, evidence: amountEvidence }] : [], evidence, is_group_header: false,
});

const withDescription = () => [
  ...normalizeSegments([
    { startMs: 0, durMs: 1000, text: '국간장 한 스푼 정도 넣고' },
    { startMs: 5000, durMs: 1000, text: '식초 약간 넣어 마무리' },
  ]),
  ...descriptionSegments('국간장 1, 식초 2, 설탕 1.5'),
];

const sources = (...amounts) => amounts.map(([text, evidence]) => ({ text, evidence }));

test('hallucinated evidence IDs are dropped and out-of-order steps are flagged', () => {
  const r = resolveRecipe(
    draft({
      steps: [
        { text: 'one', is_group_header: false, evidence: ['S03'] },
        { text: 'two', is_group_header: false, evidence: ['S01', 'S99'] },
        { text: 'three', is_group_header: false, evidence: ['S77'] },
      ],
    }),
    tinySegments(),
  );
  assert.deepEqual(r.steps.map((s) => [s.start_ms, s.timing]), [[9000, 'ok'], [0, 'out_of_order'], [null, 'missing']]);
  assert.deepEqual(r.steps[1].evidence.map((e) => e.segment_id), ['S01']);
  assert.equal(r.warnings.length, 3);
});

test('an amount without valid evidence becomes not_in_video', () => {
  const r = resolveRecipe(draft({ ingredients: [ing('설탕', '1큰술', ['S99'], ['S02'])] }), tinySegments());
  const sugar = r.ingredients[0];
  assert.equal(sugar.amount_text, null);
  assert.equal(sugar.amount_status, 'not_in_video');
  assert.deepEqual(sugar.amounts, []);
  assert.equal(r.summary.amounts_confirmed, 0);
  assert.ok(r.warnings.some((w) => /no valid evidence/.test(w)));
});

test('an amount missing from its cited text needs review', () => {
  const r = resolveRecipe(draft({ ingredients: [ing('고추장', '2스푼', ['S01']), ing('설탕', '1스푼', ['S02'])] }), tinySegments());
  assert.equal(r.ingredients[0].amount_status, 'confirmed');
  assert.equal(r.ingredients[1].amounts[0].verbatim, false);
  assert.equal(r.ingredients[1].amount_status, 'needs_review');
  assert.equal(r.summary.amounts_needs_review, 1);
  assert.ok(r.warnings.some((w) => /does not appear verbatim/.test(w)));
});

test('speech and description amounts are both kept and compared', () => {
  const r = resolveRecipe(
    draft({
      ingredients: [
        { ...ing('국간장', null, [], ['S01', 'D01']), amounts: sources(['한 스푼 정도', ['S01']], ['1', ['D01']]) },
        { ...ing('식초', null, [], ['S02', 'D01']), amounts: sources(['약간', ['S02']], ['2', ['D01']]) },
        { ...ing('설탕', null, [], ['D01']), amounts: sources(['1.5', ['D01']]) },
      ],
    }),
    withDescription(),
  );
  const [soy, vinegar, sugar] = r.ingredients;
  assert.equal(soy.amount_status, 'confirmed', 'a bare "1" agrees with "한 스푼 정도"');
  assert.equal(soy.amount_text, '한 스푼 정도');
  assert.deepEqual(soy.amounts.map((a) => [a.text, a.sources, a.needs_review]), [['한 스푼 정도', ['speech'], false], ['1', ['description'], true]]);
  assert.equal(vinegar.amount_status, 'conflict');
  assert.equal(sugar.amount_status, 'needs_review', 'a bare number alone is not a confirmed amount');
  assert.deepEqual(
    [r.summary.amounts_confirmed, r.summary.amounts_needs_review, r.summary.amounts_conflict],
    [1, 1, 1],
  );
  assert.ok(r.warnings.some((w) => /different amounts \(약간 \/ 2\)/.test(w)));
});

test('matching amounts with compatible units do not conflict', () => {
  const segs = [
    ...normalizeSegments([{ startMs: 0, durMs: 1000, text: '계란 여섯 개 물 한 컵' }]),
    ...descriptionSegments('계란 6개, 물 1컵(200ml)'),
  ];
  const r = resolveRecipe(
    draft({
      ingredients: [
        { ...ing('계란', null, [], ['S01']), amounts: sources(['여섯 개', ['S01']], ['6개', ['D01']]) },
        { ...ing('물', null, [], ['S01']), amounts: sources(['한 컵', ['S01']], ['1컵(200ml)', ['D01']]) },
      ],
    }),
    segs,
  );
  assert.deepEqual(r.ingredients.map((i) => i.amount_status), ['confirmed', 'confirmed']);
});

test('adjacent ingredients offered as alternatives are merged into one item', () => {
  const segs = normalizeSegments([{ startMs: 0, durMs: 1000, text: '다진쪽파나 다진대파를 뿌리고 참깨' }]);
  const pa = (name) => ({ ...ing(name, null, [], ['S01']), preparation: '다진' });
  const r = resolveRecipe(draft({ ingredients: [pa('쪽파'), pa('대파'), ing('참깨', null, [], ['S01'])] }), segs);
  assert.deepEqual(r.ingredients.map((i) => [i.id, i.name]), [['ing_01', '쪽파 또는 대파'], ['ing_02', '참깨']]);
  assert.equal(r.summary.ingredients, 2);
});

test('a step that only resembles a tip is kept with a warning', () => {
  const r = resolveRecipe(
    draft({
      steps: [
        { text: '고추장을 넣는다.', is_group_header: false, evidence: ['S01'] },
        { text: '설탕은 넣어야 맛있다.', is_group_header: false, evidence: ['S02'] },
        { text: '볶는다.', is_group_header: false, evidence: ['S03'] },
      ],
      tips: [{ text: '설탕을 넣어야 맛있다.', evidence: ['S02'] }],
    }),
    tinySegments(),
  );
  assert.deepEqual(r.steps.map((s) => s.text), ['고추장을 넣는다.', '설탕은 넣어야 맛있다.', '볶는다.']);
  assert.deepEqual(r.warnings, ['step 2 ("설탕은 넣어야 맛있다.") resembles tip "설탕을 넣어야 맛있다." (similarity 0.75), kept']);
});

const tipSegments = () => [
  ...normalizeSegments([
    { startMs: 0, durMs: 1000, text: '감자를 채 썰어요' },
    { startMs: 5000, durMs: 1000, text: '전분을 빼야 바삭해요' },
  ]),
  ...descriptionSegments('양파는 미리 찬물에 담가 두세요'),
];

test('a step identical to a tip with the same evidence is dropped and the drop is warned', () => {
  const r = resolveRecipe(
    draft({
      steps: [
        { text: '감자를 채 썬다.', is_group_header: false, evidence: ['S01'] },
        { text: '양파는 미리 찬물에 담가 둔다.', is_group_header: false, evidence: ['D01'] },
      ],
      tips: [{ text: '양파는 미리 찬물에 담가 둔다.', evidence: ['D01'] }],
    }),
    tipSegments(),
  );
  assert.deepEqual(r.steps.map((s) => [s.id, s.text]), [['step_01', '감자를 채 썬다.']]);
  assert.deepEqual(r.warnings, [
    'step 2 ("양파는 미리 찬물에 담가 둔다.") duplicates tip "양파는 미리 찬물에 담가 둔다." (similarity 1.00, same evidence D01), dropped',
  ]);
});

test('a real step that resembles a tip but cites different evidence is kept', () => {
  const r = resolveRecipe(
    draft({
      steps: [{ text: '감자는 전분을 빼고 바삭하게 볶는다.', is_group_header: false, evidence: ['S01', 'S02'] }],
      tips: [{ text: '감자는 전분을 빼야 바삭하다.', evidence: ['S02'] }],
    }),
    tipSegments(),
  );
  assert.deepEqual(r.steps.map((s) => s.text), ['감자는 전분을 빼고 바삭하게 볶는다.']);
  assert.deepEqual(r.warnings, ['step 1 ("감자는 전분을 빼고 바삭하게 볶는다.") resembles tip "감자는 전분을 빼야 바삭하다." (similarity 0.64), kept']);
});

test('a near-identical step is kept when its evidence differs from the tip', () => {
  const r = resolveRecipe(
    draft({
      steps: [{ text: '양파는 미리 찬물에 담가 둔다.', is_group_header: false, evidence: ['S02', 'D01'] }],
      tips: [{ text: '양파는 미리 찬물에 담가 둔다.', evidence: ['D01'] }],
    }),
    tipSegments(),
  );
  assert.equal(r.steps.length, 1);
  assert.ok(r.warnings.some((w) => /resembles tip .* \(similarity 1\.00\), kept/.test(w)));
});

test('an ingredient name contained in another with shared evidence is warned as a duplicate', () => {
  const segs = normalizeSegments([
    { startMs: 0, durMs: 1000, text: '마늘을 굽고 참치 한 스푼' },
    { startMs: 5000, durMs: 1000, text: '다진마늘 넣어요' },
  ]);
  const r = resolveRecipe(
    draft({ ingredients: [ing('마늘', null, [], ['S01']), ing('참치', null, [], ['S01']), ing('참치액', null, [], ['S01']), ing('다진마늘', null, [], ['S02'])] }),
    segs,
  );
  assert.equal(r.ingredients.length, 4, 'duplicates are only warned, never removed');
  assert.deepEqual(r.warnings.filter((w) => /possible duplicate/.test(w)), [
    'ingredients "참치" and "참치액" cite the same evidence, possible duplicate',
  ]);
});

test('equipment-only items are dropped but food named after equipment stays', () => {
  const r = resolveRecipe(
    draft({ ingredients: ['뚝배기', '뚝배기 뚜껑', '팬케이크 가루', '고추장'].map((n) => ing(n, null, [], ['S01'])) }),
    tinySegments(),
  );
  assert.deepEqual(r.ingredients.map((i) => [i.id, i.name]), [['ing_01', '팬케이크 가루'], ['ing_02', '고추장']]);
  assert.equal(r.warnings.filter((w) => /is equipment/.test(w)).length, 2);
});

test('a literal "null" string from the model is treated as no value', () => {
  const r = resolveRecipe(draft({ ingredients: [{ ...ing('설탕', 'null', []), preparation: 'null' }] }), tinySegments());
  assert.equal(r.ingredients[0].preparation, null);
  assert.equal(r.ingredients[0].amount_status, 'not_in_video');
  assert.deepEqual(r.warnings, []);
});

test('status distinguishes not_a_recipe and insufficient', () => {
  assert.equal(resolveRecipe(draft({ not_a_recipe: true }), tinySegments()).status, 'not_a_recipe');
  assert.equal(resolveRecipe(draft({}), tinySegments()).status, 'insufficient');
  assert.equal(resolveRecipe(draft({ servings: '2인분', servings_evidence: ['S99'] }), tinySegments()).servings_text, null);
});

test('schema is valid for OpenAI strict mode (every property required, no extras)', () => {
  const check = (s) => {
    if (s.type === 'object' || (Array.isArray(s.type) && s.type.includes('object'))) {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(check);
    }
    if (s.items) check(s.items);
  };
  check(RECIPE_SCHEMA);
});

test('resolveProvider picks the provider from whichever key is set', () => {
  assert.deepEqual(resolveProvider({ OPENAI_API_KEY: 'k' }), { provider: 'openai', apiKey: 'k', model: 'gpt-4.1' });
  assert.equal(resolveProvider({ ANTHROPIC_API_KEY: 'k', LLM_MODEL: 'm' }).model, 'm');
  assert.throws(() => resolveProvider({}), /OPENAI_API_KEY or ANTHROPIC_API_KEY/);
  assert.throws(() => resolveProvider({ LLM_PROVIDER: 'anthropic', OPENAI_API_KEY: 'k' }), /not set/);
});

function mockFetch(responseBody, capture) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    capture.body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => responseBody };
  };
}

test('OpenAI request uses strict json_schema and parses content', async () => {
  const cap = {};
  const fetchImpl = mockFetch({ choices: [{ message: { content: JSON.stringify(llmFixture) } }], usage: { total_tokens: 1 } }, cap);
  const out = await extractRecipe({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' }, 'prompt', { fetchImpl });
  assert.equal(cap.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(cap.init.headers.authorization, 'Bearer sk-test');
  assert.equal(cap.body.response_format.json_schema.strict, true);
  assert.equal(out.data.title, '고추장 목살덮밥');
});

test('OpenAI retries without temperature when a reasoning model rejects it', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    return 'temperature' in body
      ? { ok: false, status: 400, json: async () => ({ error: { param: 'temperature', message: 'unsupported' } }) }
      : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(llmFixture) } }] }) };
  };
  const out = await extractRecipe({ provider: 'openai', apiKey: 'k', model: 'gpt-5.5' }, 'prompt', { fetchImpl });
  assert.equal(bodies.length, 2);
  assert.equal('temperature' in bodies[1], false);
  assert.equal(out.data.steps.length, llmFixture.steps.length);
});

test('Anthropic request forces the save_recipe tool and reads its input', async () => {
  const cap = {};
  const fetchImpl = mockFetch({ content: [{ type: 'tool_use', name: 'save_recipe', input: llmFixture }], usage: {} }, cap);
  const out = await extractRecipe({ provider: 'anthropic', apiKey: 'ak', model: 'm' }, 'prompt', { fetchImpl });
  assert.equal(cap.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(cap.init.headers['x-api-key'], 'ak');
  assert.deepEqual(cap.body.tool_choice, { type: 'tool', name: 'save_recipe' });
  assert.equal(out.data.steps.length, llmFixture.steps.length);
});

const openai = { provider: 'openai', apiKey: 'k', model: 'm' };
const anthropic = { provider: 'anthropic', apiKey: 'k', model: 'm' };

test('a stalled LLM request fails with a timeout error', async () => {
  // A real stalled request holds an open socket; the held timer stands in for it, since AbortSignal.timeout alone
  // does not keep the event loop alive and Node 22 would end the test before the abort fires.
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      const socket = setTimeout(() => {}, 10_000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(socket);
        reject(init.signal.reason);
      });
    });
  await assert.rejects(extractRecipe(openai, 'prompt', { fetchImpl, timeoutMs: 20 }), /OpenAI request timed out after 0\.02s/);
  await assert.rejects(extractRecipe(anthropic, 'prompt', { fetchImpl, timeoutMs: 20 }), /Anthropic request timed out after 0\.02s/);
});

test('an HTML error page from the API is reported with its status', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 502,
    headers: { get: () => 'text/html' },
    json: async () => JSON.parse('<html>Bad Gateway</html>'),
  });
  await assert.rejects(extractRecipe(openai, 'prompt', { fetchImpl }), /OpenAI 502: response is not JSON \(text\/html\)/);
  await assert.rejects(extractRecipe(anthropic, 'prompt', { fetchImpl }), /Anthropic 502: response is not JSON \(text\/html\)/);
});

test('a response cut off at the token limit is an error, not a partial recipe', async () => {
  const openaiCut = async () => ({
    ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"not_a_recipe": false, "ti' } }] }),
  });
  await assert.rejects(extractRecipe(openai, 'prompt', { fetchImpl: openaiCut }), /cut off \(finish_reason "length"\)/);
  const anthropicCut = async () => ({
    ok: true, status: 200, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', name: 'save_recipe', input: {} }] }),
  });
  await assert.rejects(extractRecipe(anthropic, 'prompt', { fetchImpl: anthropicCut }), /cut off \(stop_reason "max_tokens"\)/);
});

// Player responses for both clients point at one caption URL; captionStatus[i] is the caption reply for the i-th client.
const youtubeFetch = (captionStatus) => {
  let caption = 0;
  return async (url) => {
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
    const status = captionStatus[caption++];
    return { ok: status === 200, status, text: async () => (status === 200 ? '<transcript><text start="1" dur="2">계란</text></transcript>' : 'Forbidden') };
  };
};

test('a failed caption download falls through to the next client', async () => {
  const t = await fetchTranscript('Smpl0Gochu1', { fetchImpl: youtubeFetch([403, 200]) });
  assert.equal(t.caption.client, 'IOS');
  assert.deepEqual(t.segments, [{ startMs: 1000, durMs: 2000, text: '계란' }]);
});

test('caption HTTP errors are reported when every client fails', async () => {
  await assert.rejects(
    fetchTranscript('Smpl0Gochu1', { fetchImpl: youtubeFetch([403, 429]) }),
    /ANDROID: track ko caption HTTP 403; IOS: track ko caption HTTP 429/,
  );
});

const sampleRun = () =>
  runPipeline({
    url: 'https://www.youtube.com/shorts/Smpl0Gochu1',
    transcriptFile: fixture('sample-gochujang-bowl.transcript.json'),
    llmOutput: structuredClone(llmFixture),
  });

test('team schema export matches the committed example (examples/example-002-pipeline-output)', async () => {
  const result = await sampleRun();
  const example = (name) => JSON.parse(readFileSync(new URL(`../../examples/example-002-pipeline-output/${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(toEvidenceBundle(result, { runId: 'example-run-002', createdAt: '2026-10-22T00:00:00Z' }), example('bundle.json'));
  assert.deepEqual(toTeamRecipe(result), example('recipe.json'));
});

test('team IDs number speech and description segments separately', () => {
  const map = teamIdMap([
    { id: 'S01', kind: 'speech' },
    { id: 'S02', kind: 'speech' },
    { id: 'D01', kind: 'description' },
  ]);
  assert.deepEqual([...map.values()], ['asr-0', 'asr-1', 'desc-0']);
});

test('team recipe keeps only confirmed amounts and is null without a recipe', async () => {
  const result = await sampleRun();
  const garlic = result.recipe.ingredients.find((i) => i.name === '마늘');
  garlic.amount_status = 'needs_review';
  garlic.amount_text = '두 쪽';
  const ing = toTeamRecipe(result).ingredients.find((i) => i.name === '마늘');
  assert.equal(ing.amount_raw, null);
  assert.equal(ing.amount_status, 'unconfirmed');

  const warnings = [];
  result.recipe.status = 'not_a_recipe';
  assert.equal(toTeamRecipe(result, warnings), null);
  assert.match(warnings[0], /status is not_a_recipe, recipe\.json skipped/);
});

test('team recipe is skipped with a warning when ingredients exist but steps do not', async () => {
  const result = await sampleRun();
  result.recipe.steps = [];
  const warnings = [];
  assert.equal(toTeamRecipe(result, warnings), null);
  assert.match(warnings[0], /\d+ ingredients and 0 steps/);
});

test('team recipe is skipped with a warning when the title is empty', async () => {
  const result = await sampleRun();
  result.recipe.title = '  ';
  const warnings = [];
  assert.equal(toTeamRecipe(result, warnings), null);
  assert.match(warnings[0], /no title, recipe\.json skipped/);
});

test('re-exporting to the same folder removes a recipe.json the new run cannot make', () => {
  const dir = mkdtempSync(join(tmpdir(), 'team-out-'));
  const cli = (llm) =>
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../src/cli.mjs', import.meta.url)),
      '--transcript', fileURLToPath(fixture('sample-gochujang-bowl.transcript.json')),
      '--llm-output', llm,
      '--team-out', dir,
    ], { stdio: 'pipe' });
  try {
    cli(fileURLToPath(fixture('sample-gochujang-bowl.llm.json')));
    assert.ok(existsSync(join(dir, 'recipe.json')));
    const noSteps = join(dir, 'no-steps.llm.json');
    writeFileSync(noSteps, JSON.stringify({ ...llmFixture, steps: [] }));
    cli(noSteps);
    assert.ok(existsSync(join(dir, 'bundle.json')));
    assert.equal(existsSync(join(dir, 'recipe.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('team bundle builds the Shorts URL from the video ID, whatever the CLI was given', async () => {
  const result = await sampleRun();
  const { videoId } = result.source;
  for (const input of [videoId, `https://www.youtube.com/watch?v=${videoId}`, `https://youtu.be/${videoId}?si=x`]) {
    result.source.source_url = input;
    assert.equal(toEvidenceBundle(result).source.url, `https://www.youtube.com/shorts/${videoId}`);
  }
});

test('a confirmed team ingredient leaves out the evidence of amounts still needing review', async () => {
  const result = await sampleRun();
  const ing = result.recipe.ingredients.find((i) => i.amount_status === 'confirmed');
  const cited = new Set([...ing.evidence, ...ing.amounts.flatMap((a) => a.evidence)].map((r) => r.segment_id));
  const other = result.evidence.find((s) => !cited.has(s.id));
  ing.amounts.push({ ...ing.amounts[0], text: '1', needs_review: true, evidence: [{ segment_id: other.id }] });
  const team = toTeamRecipe(result).ingredients.find((i) => i.name === ing.name);
  assert.equal(team.amount_status, 'confirmed');
  assert.equal(team.evidence.includes(teamIdMap(result.evidence).get(other.id)), false);
});

test('team bundle keeps caption settings and leaves the model out', async () => {
  const bundle = toEvidenceBundle(await sampleRun());
  assert.deepEqual(Object.keys(bundle.run.stages), ['captions']);
  assert.deepEqual(Object.keys(bundle.run.stages.captions.config), ['language', 'auto_generated']);
});
