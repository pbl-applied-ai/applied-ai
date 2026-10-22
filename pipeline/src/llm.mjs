import { RECIPE_SCHEMA, SYSTEM_PROMPT } from './schema.mjs';

const DEFAULT_MODELS = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-5',
};

export function resolveProvider(env = process.env) {
  const explicit = env.LLM_PROVIDER?.toLowerCase();
  const provider = explicit || (env.OPENAI_API_KEY ? 'openai' : env.ANTHROPIC_API_KEY ? 'anthropic' : null);
  if (!provider) throw new Error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY (optionally LLM_PROVIDER and LLM_MODEL).');
  if (!DEFAULT_MODELS[provider]) throw new Error(`Unsupported LLM_PROVIDER "${provider}" (use openai or anthropic).`);
  const apiKey = provider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(`LLM_PROVIDER is ${provider} but its API key is not set.`);
  return { provider, apiKey, model: env.LLM_MODEL || DEFAULT_MODELS[provider] };
}

async function callOpenAI({ apiKey, model }, userPrompt, fetchImpl) {
  const request = (withTemperature) =>
    fetchImpl('https://api.openai.com/v1/chat/completions', {
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
    });
  let res = await request(true);
  let body = await res.json();
  // Reasoning models only accept the default temperature.
  if (res.status === 400 && body.error?.param === 'temperature') {
    res = await request(false);
    body = await res.json();
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  const msg = body.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`OpenAI refused: ${msg.refusal}`);
  return { data: JSON.parse(msg.content), usage: body.usage };
}

async function callAnthropic({ apiKey, model }, userPrompt, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
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
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  const tool = body.content?.find((c) => c.type === 'tool_use');
  if (!tool) throw new Error('Anthropic response contained no tool_use block.');
  return { data: tool.input, usage: body.usage };
}

export async function extractRecipe(config, userPrompt, { fetchImpl = fetch } = {}) {
  const call = config.provider === 'openai' ? callOpenAI : callAnthropic;
  return call(config, userPrompt, fetchImpl);
}
