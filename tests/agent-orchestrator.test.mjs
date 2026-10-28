import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../server/database.mjs';
import { readAgentConfig } from '../server/agent-config.mjs';
import { createAgentToolRegistry } from '../server/agent-tools.mjs';
import { chatWithAgent } from '../server/agent-orchestrator.mjs';
import { createAgentProvider } from '../server/agent-provider.mjs';
import { normalizeTemporalRequest, shiftDate, temporalPeriodDates } from '../server/temporal.mjs';

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

test('orchestrator entrega grafico semanal validado se o provider falha apos a consulta', async () => {
  const { db, user } = await fixture();
  let calls = 0;
  const provider = { async complete() {
    calls += 1;
    if (calls === 1) return { model: 'mock', content: null, toolCalls: [{ id: 'trend-4-weeks', name: 'get_study_trends', arguments: {} }] };
    throw Object.assign(new Error('provider falhou apos consulta'), { code: 'provider-timeout' });
  } };
  const tools = createAgentToolRegistry({
    readSnapshot: async () => ({ data: { subjects: [], tasks: [], sessions: [
      { id: '1', subjectId: '', date: '2026-10-06', minutes: 10 },
      { id: '2', subjectId: '', date: '2026-10-13', minutes: 20 },
      { id: '3', subjectId: '', date: '2026-10-20', minutes: 30 },
      { id: '4', subjectId: '', date: '2026-10-27', minutes: 40 },
    ] } }),
  });
  const result = await chatWithAgent({ db, user, message: 'Compare meu desempenho nas ultimas 4 semanas', config: config(), provider, tools });
  assert.equal(result.response.type, 'analysis');
  assert.equal(result.response.chart.data.length, 4);
  assert.deepEqual(result.response.chart.data.map(point => point.minutes), [10, 20, 30, 40]);
  assert.equal(result.response.chart.data[0].period, '2026-10-05 a 2026-10-11');
  assert.equal(result.metadata.textFallback, true);
});

test('frase original encaminha dois meses ate consulta, agregacao e grafico', async () => {
  const { db, user } = await fixture();
  const message = 'fa\u00e7a um grafico comparativo das ultimas 2 meses';
  const expectedTemporal = normalizeTemporalRequest(message);
  const expectedRange = temporalPeriodDates(expectedTemporal);
  let snapshotUser;
  const tools = createAgentToolRegistry({
    readSnapshot: async (currentDb, currentUser) => {
      snapshotUser = currentUser;
      return { data: { subjects: [], tasks: [], sessions: [
        { id: 'month-previous', subjectId: '', date: expectedRange.start, minutes: 23 },
        { id: 'month-current', subjectId: '', date: expectedRange.end, minutes: 41 },
      ] } };
    },
  });
  let providerCalls = 0;
  const provider = { async complete(request) {
    providerCalls += 1;
    assert.match(request.messages.at(-1).content, /2026|periods|study_minutes/);
    return { model: 'mock', content: JSON.stringify({ type: 'analysis', analysis: 'A consulta foi de 7 dias.', metrics: { days: 7 } }) };
  } };

  const result = await chatWithAgent({ db, user, message, config: config(), provider, tools });
  const execution = (await db.query("SELECT input_json,output_json FROM ai_tool_executions WHERE conversation_id=$1 AND tool_name='get_study_trends'", [result.conversationId])).rows[0];
  const args = typeof execution.input_json === 'string' ? JSON.parse(execution.input_json) : execution.input_json;
  const toolOutput = typeof execution.output_json === 'string' ? JSON.parse(execution.output_json) : execution.output_json;

  assert.equal(snapshotUser, user);
  assert.equal(providerCalls, 1);
  assert.equal(args.temporal.unit, 'month');
  assert.equal(args.temporal.count, 2);
  assert.deepEqual({ start: toolOutput.start, end: toolOutput.end }, expectedRange);
  assert.deepEqual(toolOutput.periods.map(period => period.label), [expectedRange.start.slice(0, 7), expectedRange.end.slice(0, 7)]);
  assert.deepEqual(toolOutput.periods.map(period => period.minutes), [23, 41]);
  assert.equal(toolOutput.recordStart, expectedRange.start);
  assert.equal(toolOutput.recordEnd, expectedRange.end);
  assert.equal(result.response.type, 'analysis');
  assert.equal(result.response.metrics.unit, 'month');
  assert.equal(result.response.metrics.count, 2);
  assert.match(result.response.analysis, /64 minutos/);
  assert.equal(result.response.chart.title, 'Minutos estudados por mes');
  assert.deepEqual(result.response.chart.data.map(point => point.minutes), toolOutput.periods.map(period => period.minutes));
  assert.deepEqual(result.response.chart.data.map(point => point.complete), toolOutput.periods.map(period => period.complete));
  assert.equal(result.response.chart.data[1].complete, false);
  assert.deepEqual(result.response.chart.data.map(point => point.period), toolOutput.periods.map(period => period.label));
});

test('duas requisicoes com periodos distintos mantem cada consulta independente', async () => {
  const { db, user } = await fixture();
  const provider = { async complete() { return { model: 'mock', content: JSON.stringify({ type: 'analysis', analysis: 'Resumo.', metrics: {} }) }; } };
  const firstTemporal = normalizeTemporalRequest('Compare meu desempenho nos ultimos 2 meses');
  const tools = createAgentToolRegistry({ readSnapshot: async () => ({ data: { subjects: [], tasks: [], sessions: [{ id: 'current', subjectId: '', date: firstTemporal.today, minutes: 12 }] } }) });
  const first = await chatWithAgent({ db, user, message: 'Compare meu desempenho nos ultimos 2 meses', config: config(), provider, tools });
  const second = await chatWithAgent({ db, user, conversationId: first.conversationId, message: 'Compare meu desempenho nas ultimas 4 semanas', config: config(), provider, tools });
  const rows = (await db.query("SELECT input_json FROM ai_tool_executions WHERE conversation_id=$1 AND tool_name='get_study_trends' ORDER BY created_at,id", [first.conversationId])).rows;
  const args = rows.map(row => typeof row.input_json === 'string' ? JSON.parse(row.input_json) : row.input_json);
  assert.deepEqual(args.map(item => [item.temporal.unit, item.temporal.count]), [['month', 2], ['week', 4]]);
  assert.equal(first.response.chart.data.length, 2);
  assert.equal(second.response.chart.data.length, 4);
});

test('consulta mensal com somente sete dias registrados mantem meses e nao afirma janela de sete dias', async () => {
  const { db, user } = await fixture();
  const message = 'fa\u00e7a um grafico comparativo das ultimas 2 meses';
  const temporal = normalizeTemporalRequest(message);
  const range = temporalPeriodDates(temporal);
  const sessions = Array.from({ length: 7 }, (_, index) => ({ id: String(index + 1), subjectId: '', date: shiftDate(range.end, index - 6), minutes: 5 }));
  const tools = createAgentToolRegistry({ readSnapshot: async () => ({ data: { subjects: [], tasks: [], sessions } }) });
  const provider = { async complete() { return { model: 'mock', content: 'Dados do painel dos ultimos 7 dias.' }; } };
  const result = await chatWithAgent({ db, user, message, config: config(), provider, tools });
  assert.deepEqual([result.response.metrics.unit, result.response.metrics.count], ['month', 2]);
  assert.deepEqual(result.response.chart.data.map(point => point.period), [range.start.slice(0, 7), range.end.slice(0, 7)]);
  assert.deepEqual(result.response.chart.data.map(point => point.minutes), [0, 35]);
  assert.match(result.response.analysis, new RegExp(shiftDate(range.end, -6)));
  assert.match(result.response.analysis, new RegExp(range.end));
  assert.doesNotMatch(result.response.analysis, /7 dias/);
});

test('falha da consulta temporal nao e convertida em grafico deterministico', async () => {
  const { db, user } = await fixture();
  const message = 'fa\u00e7a um grafico comparativo das ultimas 2 meses';
  const tools = createAgentToolRegistry({ readSnapshot: async () => { throw Object.assign(new Error('consulta indisponivel'), { code: 'db-unavailable' }); } });
  const provider = { async complete() { return { model: 'mock', content: JSON.stringify({ type: 'analysis', analysis: 'sem consulta', metrics: {} }) }; } };
  await assert.rejects(() => chatWithAgent({ db, user, message, config: config(), provider, tools }), error => error.code === 'study-trends-unavailable');
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
  await assert.rejects(() => chatWithAgent({ db, user, message: 'Quais tarefas?', config: config(), provider, tools: createAgentToolRegistry({ analytics: async () => ({}) }) }), error => error.code === 'schema-validation-failed');
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
