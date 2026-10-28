import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../server/database.mjs';
import { readAgentConfig } from '../server/agent-config.mjs';
import { createAgentToolRegistry } from '../server/agent-tools.mjs';
import { chatWithAgent } from '../server/agent-orchestrator.mjs';
import { createAgentProvider } from '../server/agent-provider.mjs';

async function fixture() {
  const db = await openDatabase({ directory: 'memory://', url: '' });
  const userId = randomUUID();
  const subjectId = randomUUID();
  await db.query("INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'Orquestração','orch@example.test','hash',now())", [userId]);
  await db.query("INSERT INTO subjects(id,user_id,name,color,is_general,updated_at) VALUES($1,$2,'Python','purple',true,now())", [subjectId, userId]);
  return { db, user: { id: userId, name: 'Orquestração', email: 'orch@example.test', timezone: 'America/Sao_Paulo' }, subjectId };
}

function config() {
  return { ...readAgentConfig({ LLM_PROVIDER: 'google-gemini', LLM_MODEL: 'mock', LLM_TIMEOUT_MS: '1000' }), maxIterations: 3, maxHistory: 10 };
}

test('orchestrator preserva thoughtSignature ao retomar conversa Gemini apos Tool', async () => {
  const { db, user } = await fixture();
  const providerConfig = { ...config(), apiKey: 'gemini-test-key' };
  const tools = createAgentToolRegistry({
    readSnapshot: async () => ({ data: { subjects: [], tasks: [], sessions: [] } }),
    analytics: async () => ({ days: 7, start: '2026-10-21', end: '2026-10-27', previousStart: '2026-10-14', previousEnd: '2026-10-20', minutes: 0, previousMinutes: 105, activeDays: 0, sessions: 0, previousSessions: 2, averageSession: 0, daily: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(21 + index).padStart(2, '0')}`, minutes: 0 })), previousDaily: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(14 + index).padStart(2, '0')}`, minutes: index === 0 ? 105 : 0 })), subjects: [] }),
  });
  const finalContent = JSON.stringify({ type: 'analysis', analysis: 'Comparacao pronta.', metrics: { minutes: 0, previousMinutes: 105 } });
  const firstRequests = [];
  const firstResponses = [
    { candidates: [{ content: { parts: [{ functionCall: { id: 'trend-call-1', name: 'get_study_trends', args: {} }, thoughtSignature: 'sig-trend-1' }] } }] },
    { candidates: [{ content: { parts: [{ text: finalContent }] } }] },
  ];
  const firstProvider = createAgentProvider(providerConfig, { async post(url, headers, body) { firstRequests.push(body); return { status: 200, body: firstResponses.shift() }; } });
  const first = await chatWithAgent({ db, user, message: 'Como esta meu desempenho?', config: providerConfig, provider: firstProvider, tools });
  assert.equal(first.response.type, 'analysis');
  const persistedCall = (await db.query('SELECT content FROM ai_messages WHERE conversation_id=$1 AND role=$2 ORDER BY created_at,id', [first.conversationId, 'ASSISTANT'])).rows.find(row => JSON.parse(row.content).toolCalls);
  assert.equal(JSON.parse(persistedCall.content).toolCalls[0].thoughtSignature, 'sig-trend-1');

  const secondRequests = [];
  const secondProvider = createAgentProvider(providerConfig, { async post(url, headers, body) {
    secondRequests.push(body);
    const replayed = body.contents.find(message => message.role === 'model' && message.parts.some(part => part.functionCall));
    assert.ok(replayed);
    assert.equal(replayed.parts.find(part => part.functionCall)?.thoughtSignature, 'sig-trend-1');
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: finalContent }] } }] } };
  } });
  const second = await chatWithAgent({ db, user, conversationId: first.conversationId, message: 'faca uma comparacao entre as minhas duas ultimas semanas de estudo', config: providerConfig, provider: secondProvider, tools });
  assert.equal(second.response.type, 'analysis');
  assert.equal(secondRequests.length, 1);
  assert.equal(firstRequests.length, 2);
});

test('orchestrator persiste conversa e resposta text', async () => {
  const { db, user } = await fixture();
  const provider = { async complete(request) { assert.equal(request.tools.length, 8); return { model: 'mock', content: JSON.stringify({ type: 'text', content: 'Olá, estudante.' }) }; } };
  const result = await chatWithAgent({ db, user, message: 'Olá', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) });
  assert.equal(result.response.type, 'text');
  assert.equal(result.response.content, 'Olá, estudante.');
  assert.equal((await db.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at,id', [result.conversationId])).rows.length, 2);
});

test('orchestrator executa create_task, audita e valida action', async () => {
  const { db, user, subjectId } = await fixture();
  let calls = 0;
  const provider = { async complete() { calls += 1; if (calls === 1) return { model: 'mock', content: null, toolCalls: [{ id: 'create-1', name: 'create_task', arguments: { subjectId, title: 'Estudar funções' } }] }; return { model: 'mock', content: JSON.stringify({ type: 'action', action: 'create_task', result: { ok: true } }) }; } };
  const result = await chatWithAgent({ db, user, message: 'Crie uma tarefa para estudar funções', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) });
  const task = (await db.query('SELECT title,created_by,agent_execution_id FROM academic_tasks WHERE user_id=$1', [user.id])).rows[0];
  const execution = (await db.query('SELECT status,tool_name,input_json,output_json,provider FROM ai_tool_executions WHERE user_id=$1', [user.id])).rows[0];
  assert.equal(result.response.type, 'action');
  assert.equal(task.created_by, 'AGENT');
  assert.ok(task.agent_execution_id);
  assert.equal(execution.status, 'SUCCESS');
  assert.equal(execution.tool_name, 'create_task');
  assert.equal(execution.provider, 'google-gemini');
  assert.doesNotMatch(JSON.stringify(execution.input_json), /password|api_key|token/i);
});

test('orchestrator não tenta quarta iteração', async () => {
  const { db, user } = await fixture();
  let calls = 0;
  const provider = { async complete() { calls += 1; return { model: 'mock', content: null, toolCalls: [{ id: `list-${calls}`, name: 'list_tasks', arguments: {} }] }; } };
  await assert.rejects(() => chatWithAgent({ db, user, message: 'Liste tarefas', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) }), error => error.code === 'iteration-limit');
  assert.equal(calls, 3);
});

test('orchestrator rejeita resposta estruturada incompatível após Tool', async () => {
  const { db, user } = await fixture();
  let calls = 0;
  const provider = { async complete() { calls += 1; return calls === 1 ? { model: 'mock', content: null, toolCalls: [{ id: 'read-1', name: 'list_tasks', arguments: {} }] } : { model: 'mock', content: JSON.stringify({ type: 'unknown', value: 'não' }) }; } };
  await assert.rejects(() => chatWithAgent({ db, user, message: 'Quais tarefas?', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) }), error => error.code === 'invalid-structured-output');
});

test('conversationId de outra conta é isolado', async () => {
  const first = await fixture();
  const provider = { async complete() { return { model: 'mock', content: JSON.stringify({ type: 'text', content: 'ok' }) }; } };
  const own = await chatWithAgent({ db: first.db, user: first.user, message: 'Oi', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) });
  const secondUser = { ...first.user, id: randomUUID() };
  await assert.rejects(() => chatWithAgent({ db: first.db, user: secondUser, message: 'Acesso', conversationId: own.conversationId, config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) }), error => error.status === 404);
});

test('orchestrator audita Tool Groq sem alterar o registry', async () => {
  const { db, user, subjectId } = await fixture();
  let calls = 0;
  const provider = { async complete() { calls += 1; return calls === 1 ? { model: 'openai/gpt-oss-20b', content: null, toolCalls: [{ id: 'groq-create-1', name: 'create_task', arguments: { subjectId, title: 'Revisar Groq' } }] } : { model: 'openai/gpt-oss-20b', content: JSON.stringify({ type: 'action', action: 'create_task', result: { ok: true } }) }; } };
  const groqConfig = { ...readAgentConfig({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'server-only', GROQ_MODEL: 'openai/gpt-oss-20b', GROQ_TIMEOUT_MS: '1000' }), maxIterations: 3, maxHistory: 10 };
  await chatWithAgent({ db, user, message: 'Crie uma tarefa', config: groqConfig, provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) });
  const execution = (await db.query('SELECT provider,model,tool_name,status FROM ai_tool_executions WHERE user_id=$1', [user.id])).rows[0];
  assert.deepEqual(execution, { provider: 'groq', model: 'openai/gpt-oss-20b', tool_name: 'create_task', status: 'SUCCESS' });
});
