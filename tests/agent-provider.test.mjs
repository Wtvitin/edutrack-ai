import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAgentConfig } from '../server/agent-config.mjs';
import { AgentProviderError, createAgentProvider } from '../server/agent-provider.mjs';

function config(overrides = {}) {
  return { ...readAgentConfig({ LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'test-key', LLM_MODEL: 'primary', LLM_FALLBACK_MODEL: 'fallback', LLM_TIMEOUT_MS: '1000' }), ...overrides };
}

test('OpenRouter envia Tools e interpreta resposta final', async () => {
  const requests = [];
  const transport = { async post(url, headers, body) { requests.push({ url, headers, body }); return { status: 200, body: { choices: [{ message: { content: 'Olá estudante' } }], usage: { prompt_tokens: 2 } } }; } };
  const provider = createAgentProvider(config(), transport);
  const result = await provider.complete({ model: 'primary', messages: [{ role: 'user', content: 'Olá' }], tools: [{ name: 'list_tasks', description: 'lista', parameters: { type: 'object' } }] });
  assert.equal(result.content, 'Olá estudante');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.tools[0].function.name, 'list_tasks');
  assert.equal(requests[0].headers.Authorization, 'Bearer test-key');
});

test('OpenRouter interpreta Tool Call e faz retry transitório', async () => {
  let attempts = 0;
  const transport = { async post() { attempts += 1; if (attempts === 1) return { status: 503, body: {} }; return { status: 200, body: { choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', function: { name: 'get_task', arguments: '{"taskId":"11111111-1111-4111-8111-111111111111"}' } }] } }] } }; } };
  const provider = createAgentProvider(config({ fallbackModel: undefined }), transport);
  const result = await provider.complete({ model: 'primary', messages: [{ role: 'user', content: 'tarefa' }] });
  assert.equal(attempts, 2);
  assert.deepEqual(result.toolCalls, [{ id: 'call-1', name: 'get_task', arguments: { taskId: '11111111-1111-4111-8111-111111111111' } }]);
});

test('OpenRouter preserva argumentos JSON malformados para rejeição server-side', async () => {
  const transport = { async post() { return { status: 200, body: { choices: [{ message: { content: null, tool_calls: [{ id: 'bad-1', function: { name: 'get_task', arguments: '{invalid' } }] } }] } }; } };
  const provider = createAgentProvider(config(), transport);
  const result = await provider.complete({ model: 'primary', messages: [{ role: 'user', content: 'tarefa' }] });
  assert.equal(result.toolCalls[0].arguments, null);
});

test('OpenRouter usa fallback após duas falhas do modelo primário', async () => {
  const models = [];
  const transport = { async post(url, headers, body) { models.push(body.model); if (body.model === 'primary') return { status: 503, body: {} }; return { status: 200, body: { choices: [{ message: { content: 'fallback ok' } }] } }; } };
  const provider = createAgentProvider(config(), transport);
  const result = await provider.complete({ model: 'primary', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(result.content, 'fallback ok');
  assert.deepEqual(models, ['primary', 'primary', 'fallback']);
});

test('Provider sem chave falha sem chamada externa', async () => {
  let called = false;
  const provider = createAgentProvider(config({ apiKey: undefined }), { async post() { called = true; return { status: 200, body: {} }; } });
  await assert.rejects(() => provider.complete({ model: 'primary', messages: [] }), error => error instanceof AgentProviderError && error.code === 'provider-not-configured');
  assert.equal(called, false);
});

test('Gemini sem chave falha sem acessar a rede ou OpenRouter', async () => {
  let called = false;
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: undefined }), { async post() { called = true; return { status: 200, body: {} }; } });
  await assert.rejects(() => provider.complete({ model: 'gemini-2.5-flash', messages: [] }), error => error instanceof AgentProviderError && error.code === 'provider-not-configured');
  assert.equal(called, false);
});

test('Gemini traduz resposta de function call', async () => {
  const transport = { async post(url, headers, body) { assert.match(url, /generateContent$/); assert.equal(headers['x-goog-api-key'], 'gemini-key'); assert.doesNotMatch(url, /gemini-key/); assert.equal(body.tools[0].functionDeclarations[0].name, 'get_task'); assert.equal(body.systemInstruction.parts[0].text, 'System prompt'); return { status: 200, body: { candidates: [{ content: { parts: [{ functionCall: { name: 'get_task', args: { taskId: '11111111-1111-4111-8111-111111111111' } } }] } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'gemini-key', baseUrl: 'https://gemini.test/models' }), transport);
  const result = await provider.complete({ model: 'gemini-model', messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'tarefa' }], tools: [{ name: 'get_task', description: 'tarefa', parameters: { type: 'object' } }] });
  assert.equal(result.toolCalls[0].name, 'get_task');
});

test('Gemini adapta schema JSON das Tools ao formato aceito pelo endpoint', async () => {
  let request;
  const transport = { async post(url, headers, body) { request = body; return { status: 200, body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'gemini-key', baseUrl: 'https://gemini.test/models' }), transport);
  await provider.complete({ model: 'gemini-model', messages: [{ role: 'user', content: 'tarefa' }], tools: [{ name: 'create_task', description: 'cria', parameters: { type: 'object', additionalProperties: false, properties: { dueDate: { type: ['string', 'null'] } } } }] });
  assert.equal(request.tools[0].functionDeclarations[0].parameters.additionalProperties, undefined);
  assert.deepEqual(request.tools[0].functionDeclarations[0].parameters.properties.dueDate, { type: 'string', nullable: true });
});

test('Gemini envia Structured Output sem usar OpenRouter', async () => {
  const requests = [];
  const transport = { async post(url, headers, body) { requests.push({ url, headers, body }); return { status: 200, body: { candidates: [{ content: { parts: [{ text: '{type:text,content:ok}' }] } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'gemini-key', baseUrl: 'https://gemini.test/models' }), transport);
  await provider.complete({ model: 'gemini-model', messages: [{ role: 'user', content: 'oi' }], responseFormat: { name: 'agent_response', schema: { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] } } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(requests[0].body.generationConfig.responseJsonSchema, { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] });
  assert.doesNotMatch(requests[0].url, /openrouter/);
});

test('Gemini mantém objetos abertos no campo JSON Schema correto sem remover limites suportados', async () => {
  let request;
  const transport = { async post(url, headers, body) { request = body; return { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"type":"analysis"}' }] } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'gemini-key', baseUrl: 'https://gemini.test/models' }), transport);
  await provider.complete({ model: 'gemini-model', messages: [{ role: 'user', content: 'oi' }], responseFormat: { name: 'agent_analysis_response_v1', schema: { type: 'object', additionalProperties: false, properties: { metadata: { type: 'object', additionalProperties: true }, count: { type: 'integer', minimum: 1, maximum: 500 }, items: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } } } } } });
  assert.equal(request.generationConfig.responseSchema, undefined);
  assert.equal(request.generationConfig.responseJsonSchema.additionalProperties, false);
  assert.equal(request.generationConfig.responseJsonSchema.properties.metadata.additionalProperties, true);
  assert.deepEqual(request.generationConfig.responseJsonSchema.properties.count, { type: 'integer', minimum: 1, maximum: 500 });
  assert.deepEqual(request.generationConfig.responseJsonSchema.properties.items, { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } });
});

test('falha Gemini não chama fallback OpenRouter', async () => {
  let calls = 0;
  const transport = { async post() { calls += 1; return { status: 503, body: {} }; } };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'gemini-key', fallbackModel: 'openrouter/free' }), transport);
  await assert.rejects(() => provider.complete({ model: 'gemini-model', messages: [{ role: 'user', content: 'oi' }] }), error => {
    assert.ok(error instanceof AgentProviderError);
    assert.equal(error.code, 'provider-http-error');
    assert.equal(error.providerStatus, 503);
    return true;
  });
  assert.equal(calls, 2);
});

test('Groq envia system prompt, Tools e interpreta Tool Call sem chamar Gemini', async () => {
  const requests = [];
  const transport = { async post(url, headers, body, timeoutMs) {
    requests.push({ url, headers, body, timeoutMs });
    return { status: 200, body: { choices: [{ message: { content: null, tool_calls: [{ id: 'groq-call-1', function: { name: 'get_task', arguments: { taskId: '11111111-1111-4111-8111-111111111111' } } }] } }] } };
  } };
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b', fallbackModel: undefined }), transport);
  const result = await provider.complete({ model: 'openai/gpt-oss-20b', messages: [{ role: 'system', content: 'System prompt' }, { role: 'user', content: 'Minha tarefa' }, { role: 'assistant', content: null, tool_calls: [{ id: 'prior-call', name: 'get_task', arguments: { taskId: '11111111-1111-4111-8111-111111111111' } }] }, { role: 'tool', name: 'get_task', tool_call_id: 'prior-call', content: JSON.stringify({ id: '11111111-1111-4111-8111-111111111111' }) }], tools: [{ name: 'get_task', description: 'consulta', parameters: { type: 'object' } }] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://groq.test/openai/v1/chat/completions');
  assert.equal(requests[0].headers.Authorization, 'Bearer groq-key');
  assert.equal(requests[0].body.messages[0].role, 'system');
  assert.deepEqual(requests[0].body.messages[2].tool_calls, [{ id: 'prior-call', type: 'function', function: { name: 'get_task', arguments: JSON.stringify({ taskId: '11111111-1111-4111-8111-111111111111' }) } }]);
  assert.equal(requests[0].body.messages[3].tool_call_id, 'prior-call');
  assert.equal(requests[0].body.tools[0].function.name, 'get_task');
  assert.equal(requests[0].timeoutMs, 1000);
  assert.doesNotMatch(requests[0].url + JSON.stringify(requests[0].body), /groq-key|gemini/i);
  assert.deepEqual(result.toolCalls, [{ id: 'groq-call-1', name: 'get_task', arguments: { taskId: '11111111-1111-4111-8111-111111111111' } }]);
});

test('Groq aceita filtro opcional nullable em list_tasks', async () => {
  let request;
  const transport = { async post(url, headers, body) { request = body; return { status: 200, body: { choices: [{ message: { content: 'ok' } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b' }), transport);
  await provider.complete({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'tarefas' }], tools: [{ name: 'list_tasks', description: 'lista', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] } } } }] });
  assert.deepEqual(request.tools[0].function.parameters.properties.status.type, ['string', 'null']);
  assert.ok(request.tools[0].function.parameters.properties.status.enum.includes(null));
});

test('Groq envia Structured Output em requisição sem Tools', async () => {
  let request;
  const transport = { async post(url, headers, body) { request = { url, headers, body }; return { status: 200, body: { choices: [{ message: { content: JSON.stringify({ type: 'text', content: 'ok' }) } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b' }), transport);
  const schema = { type: 'object', additionalProperties: false, required: ['type', 'content'], properties: { type: { const: 'text' }, content: { type: 'string' } } };
  await provider.complete({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'oi' }], responseFormat: { name: 'agent_text_response_v1', schema } });
  assert.equal(request.body.tools, undefined);
  assert.deepEqual(request.body.response_format, { type: 'json_object' });
  assert.match(request.body.messages[0].content, /agent_text_response_v1/);
  assert.match(request.body.messages[0].content, /JSON válido/);
});

test('Groq repete somente falha transitória e não usa fallback', async () => {
  let attempts = 0;
  const transport = { async post() { attempts += 1; return attempts === 1 ? { status: 429, body: { error: { message: 'rate limit' } } } : { status: 200, body: { choices: [{ message: { content: 'ok' } }] } }; } };
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b', fallbackModel: 'gemini-2.5-flash' }), transport);
  const result = await provider.complete({ messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(result.content, 'ok');
  assert.equal(attempts, 2);
});

test('Groq não repete erro de autorização nem chama outro provider', async () => {
  let attempts = 0;
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b' }), { async post() { attempts += 1; return { status: 401, body: { error: { message: 'invalid key', code: 'invalid_api_key' } } }; } });
  await assert.rejects(() => provider.complete({ messages: [{ role: 'user', content: 'oi' }] }), error => error.code === 'provider-http-error' && error.providerStatus === 401);
  assert.equal(attempts, 1);
});

test('Groq rejeita resposta inválida pelo contrato comum do provider', async () => {
  let attempts = 0;
  const provider = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', baseUrl: 'https://groq.test/openai/v1', model: 'openai/gpt-oss-20b' }), { async post() { attempts += 1; return { status: 200, body: { choices: [] } }; } });
  await assert.rejects(() => provider.complete({ messages: [{ role: 'user', content: 'oi' }] }), error => error.code === 'provider-empty-response');
  assert.equal(attempts, 2);
});

test('provider inválido falha sem acessar a rede', async () => {
  let attempts = 0;
  const provider = createAgentProvider(config({ provider: 'invalid-provider', apiKey: 'unused' }), { async post() { attempts += 1; return { status: 200, body: {} }; } });
  await assert.rejects(() => provider.complete({ messages: [] }), error => error.code === 'provider-not-supported');
  assert.equal(attempts, 0);
});

test('Groq sem chave, modelo ou resposta em timeout falha de forma controlada', async () => {
  let calls = 0;
  const noKey = createAgentProvider(config({ provider: 'groq', apiKey: undefined, model: 'openai/gpt-oss-20b' }), { async post() { calls += 1; return { status: 200, body: {} }; } });
  await assert.rejects(() => noKey.complete({ messages: [] }), error => error.code === 'provider-not-configured');
  const noModel = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', model: '' }), { async post() { calls += 1; return { status: 200, body: {} }; } });
  await assert.rejects(() => noModel.complete({ messages: [] }), error => error.code === 'model-not-configured');
  const timeout = createAgentProvider(config({ provider: 'groq', apiKey: 'groq-key', model: 'openai/gpt-oss-20b' }), { async post() { calls += 1; throw new AgentProviderError('Tempo excedido.', 504, 'provider-timeout', true); } });
  await assert.rejects(() => timeout.complete({ messages: [] }), error => error.code === 'provider-timeout');
  assert.equal(calls, 2);
});

test('Gemini omits parameters for tools that take no arguments', async () => {
  const transport = {
    async post(_url, _headers, body) {
      const [noArgs, withArgs] = body.tools[0].functionDeclarations;
      assert.deepEqual(noArgs, { name: 'get_general_dashboard', description: 'Get the dashboard' });
      assert.deepEqual(withArgs.parameters.properties, { taskId: { type: 'string' } });
      return { status: 200, body: { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } };
    },
  };
  const provider = createAgentProvider(config({ provider: 'google-gemini', apiKey: 'test-key' }), transport);
  await provider.complete({
    messages: [{ role: 'user', content: 'Mostre meu painel' }],
    tools: [
      { name: 'get_general_dashboard', description: 'Get the dashboard', parameters: { type: 'object', required: [], properties: {} } },
      { name: 'get_task', parameters: { type: 'object', properties: { taskId: { type: 'string' } } } },
    ],
  });
});
