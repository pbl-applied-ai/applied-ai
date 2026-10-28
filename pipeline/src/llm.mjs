import { isTransientStatus, PipelineError } from './errors.mjs';
import { RECIPE_SCHEMA, SYSTEM_PROMPT } from './schema.mjs';

const DEFAULT_MODELS = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-5',
};

const configError = (message) => new PipelineError(message, { stage: 'structure', errorCode: 'internal', reason: 'llm_config' });
const transient = (message, cause) => new PipelineError(message, { stage: 'structure', errorCode: 'retryable', reason: 'llm_transient', retry: true, cause });
const cutOff = (message) => new PipelineError(message, { stage: 'structure', errorCode: 'internal', reason: 'llm_cut_off' });

// 429 and 5xx are worth retrying; any other 4xx (bad key, unknown model, bad request) is our setup.
function httpError(label, res, body) {
  const message = `${label} ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`;
  return isTransientStatus(res.status) ? transient(message) : configError(message);
}

export function resolveProvider(env = process.env) {
  const explicit = env.LLM_PROVIDER?.toLowerCase();
  const provider = explicit || (env.OPENAI_API_KEY ? 'openai' : env.ANTHROPIC_API_KEY ? 'anthropic' : null);
  if (!provider) throw configError('Set OPENAI_API_KEY or ANTHROPIC_API_KEY (optionally LLM_PROVIDER and LLM_MODEL).');
  if (!DEFAULT_MODELS[provider]) throw configError(`Unsupported LLM_PROVIDER "${provider}" (use openai or anthropic).`);
  const apiKey = provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) throw configError(`LLM_PROVIDER is ${provider} but its API key is not set.`);
  return { provider, apiKey, model: env.LLM_MODEL || DEFAULT_MODELS[provider] };
}

const DEFAULT_TIMEOUT_MS = 120_000;

// Each request gets its own deadline so a stalled connection fails instead of hanging the run.
async function post(label, fetchImpl, url, init, timeoutMs) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw transient(`${label} request timed out after ${timeoutMs / 1000}s.`, err);
    throw transient(`${label} request failed: ${err?.message ?? err}`, err);
  }
}

// Gateways and proxies answer some failures with an HTML page instead of JSON.
async function readJson(label, res) {
  try {
    return await res.json();
  } catch {
    const type = res.headers?.get?.('content-type') ?? 'unknown content type';
    throw transient(`${label} ${res.status}: response is not JSON (${type}).`);
  }
}

async function callOpenAI({ apiKey, model }, userPrompt, fetchImpl, timeoutMs) {
  const request = (withTemperature) =>
    post('OpenAI', fetchImpl, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        ...(withTemperature ? { temperature: 0 } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'recipe', strict: true, schema: RECIPE_SCHEMA } },
      }),
    }, timeoutMs);
  let res = await request(true);
  let body = await readJson('OpenAI', res);
  // Reasoning models only accept the default temperature.
  if (res.status === 400 && body.error?.param === 'temperature') {
    res = await request(false);
    body = await readJson('OpenAI', res);
  }
  if (!res.ok) throw httpError('OpenAI', res, body);
  const choice = body.choices?.[0];
  const msg = choice?.message;
  if (msg?.refusal) throw new PipelineError(`OpenAI refused: ${msg.refusal}`, { stage: 'structure', errorCode: 'internal', reason: 'llm_refused' });
  if (choice?.finish_reason === 'length') throw cutOff('OpenAI response was cut off (finish_reason "length"); the recipe JSON is incomplete.');
  let data;
  try {
    data = JSON.parse(msg?.content);
  } catch (err) {
    throw transient('OpenAI response content is not valid JSON.', err);
  }
  return { data, usage: body.usage };
}

async function callAnthropic({ apiKey, model }, userPrompt, fetchImpl, timeoutMs) {
  const res = await post('Anthropic', fetchImpl, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [{ name: 'save_recipe', description: 'Save the extracted recipe.', input_schema: RECIPE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'save_recipe' },
      messages: [{ role: 'user', content: userPrompt }],
    }),
  }, timeoutMs);
  const body = await readJson('Anthropic', res);
  if (!res.ok) throw httpError('Anthropic', res, body);
  if (body.stop_reason === 'max_tokens') throw cutOff('Anthropic response was cut off (stop_reason "max_tokens"); the recipe JSON is incomplete.');
  const tool = body.content?.find((c) => c.type === 'tool_use');
  if (!tool) throw transient('Anthropic response contained no tool_use block.');
  return { data: tool.input, usage: body.usage };
}

export async function extractRecipe(config, userPrompt, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const call = config.provider === 'openai' ? callOpenAI : callAnthropic;
  return call(config, userPrompt, fetchImpl, timeoutMs);
}
