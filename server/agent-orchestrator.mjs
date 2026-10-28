import { randomUUID } from 'node:crypto';
import { readAgentConfig, buildSystemPrompt, AgentError } from './agent-config.mjs';
import { actionResponseSchema, agentChatInputSchema, analysisResponseSchema, chartSpecificationSchema, responseJsonSchemas, structuredResponseSchema, textResponseSchema, toolCallSchema } from './agent-schemas.mjs';
import { createAgentProvider } from './agent-provider.mjs';
import { createAgentToolRegistry } from './agent-tools.mjs';
import { normalizeTemporalRequest } from './temporal.mjs';

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => /password|token|secret|api[_-]?key|authorization|cookie|sql/i.test(key) ? [key, '[REDACTED]'] : [key, redact(child)]));
}

function boundedJson(value, maximum) {
  const serialized = JSON.stringify(redact(value));
  return serialized.length > maximum ? JSON.stringify({ truncated: true }) : serialized;
}

function parseStoredMessage(row) {
  if (row.role === 'ASSISTANT') {
    try {
      const value = JSON.parse(row.content);
      if (value && typeof value === 'object' && Array.isArray(value.toolCalls)) return { role: 'assistant', content: value.content || null, tool_calls: value.toolCalls };
    } catch {}
    return { role: 'assistant', content: row.content };
  }
  if (row.role === 'TOOL') {
    try {
      const value = JSON.parse(row.content);
      return { role: 'tool', name: value.name || 'tool', tool_call_id: value.toolCallId, content: JSON.stringify(value.result ?? value) };
    } catch {
      return { role: 'tool', content: row.content };
    }
  }
  return { role: row.role.toLowerCase(), content: row.content };
}

async function loadConversation(db, conversationId, userId, limit) {
  const conversation = (await db.query('SELECT id,user_id FROM ai_conversations WHERE id=$1 AND user_id=$2', [conversationId, userId])).rows[0];
  if (!conversation) throw new AgentError('Conversa não encontrada.', 404, 'conversation-not-found');
  const rows = (await db.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at ASC,id ASC LIMIT $2', [conversationId, limit])).rows;
  return { conversation, messages: rows.map(parseStoredMessage) };
}

async function createConversation(db, userId, title) {
  const id = randomUUID();
  await db.query('INSERT INTO ai_conversations(id,user_id,title,updated_at) VALUES($1,$2,$3,now())', [id, userId, title.slice(0, 120)]);
  return id;
}

async function persistMessage(db, conversationId, role, content) {
  await db.query('INSERT INTO ai_messages(conversation_id,role,content) VALUES($1,$2,$3)', [conversationId, role, content]);
}

function expectedResponse(type) {
  if (type === 'action') return { name: 'agent_action_response_v1', strict: true, schema: responseJsonSchemas.action };
  if (type === 'analysis') return { name: 'agent_analysis_response_v1', strict: true, schema: responseJsonSchemas.analysis };
  return { name: 'agent_text_response_v1', strict: true, schema: responseJsonSchemas.text };
}

function jsonCandidate(content) {
  const raw = content.trim();
  const text = raw.startsWith('```') ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : raw;
  try { return { value: JSON.parse(text), explanation: '' }; } catch {}
  const fenceStart = text.indexOf('```');
  if (fenceStart < 0) return null;
  const codeStart = text.indexOf('\n', fenceStart);
  const fenceEnd = codeStart >= 0 ? text.indexOf('```', codeStart + 1) : -1;
  if (codeStart < 0 || fenceEnd < 0) return null;
  try { return { value: JSON.parse(text.slice(codeStart + 1, fenceEnd).trim()), explanation: `${text.slice(0, fenceStart)}${text.slice(fenceEnd + 3)}`.trim() }; } catch { return null; }
}

function normalizeResponseValue(content) {
  const candidate = jsonCandidate(content);
  if (!candidate) return null;
  let value = candidate.value;
  if (value && typeof value === 'object' && value.response && typeof value.response === 'object') value = value.response;
  if (value && typeof value === 'object' && value.type === 'analysis' && typeof value.analysis === 'string') {
    const embedded = jsonCandidate(value.analysis);
    if (embedded?.value && typeof embedded.value === 'object' && embedded.value.data && embedded.value.series) {
      value = { ...value, analysis: embedded.explanation || 'Analise visual gerada a partir dos seus dados.', chart: embedded.value };
    }
  }
  if (value && typeof value === 'object' && value.chart && !value.type) value = { type: 'analysis', analysis: candidate.explanation || 'Analise visual gerada a partir dos seus dados.', metrics: {}, chart: value.chart };
  if (value && typeof value === 'object' && ['line', 'bar', 'area', 'comparison'].includes(value.type) && value.data && value.series) value = { type: 'analysis', analysis: candidate.explanation || 'Analise visual gerada a partir dos seus dados.', metrics: {}, chart: value };
  if (candidate.explanation && value && value.type === 'analysis' && !value.analysis) value.analysis = candidate.explanation;
  return value;
}

export function parseResponse(content, expectedType, executedTools = new Set()) {
  if (typeof content !== 'string' || !content.trim()) throw new AgentError('O Agent retornou uma resposta vazia.', 503, 'empty-response');
  const candidate = normalizeResponseValue(content);
  if (!candidate) {
    if (expectedType) throw new AgentError('O Agent retornou JSON estruturado malformado.', 503, 'malformed-json');
    const parsedText = textResponseSchema.safeParse({ type: 'text', content: content.trim() });
    if (!parsedText.success) throw new AgentError('O Agent retornou uma resposta inválida.', 503, 'invalid-structured-output');
    return parsedText.data;
  }
  if (candidate.chart && !chartSpecificationSchema.safeParse(candidate.chart).success) throw new AgentError('A especificacao do grafico e invalida.', 503, 'invalid-chart-specification');
  const parsed = structuredResponseSchema.safeParse(candidate);
  if (!parsed.success) throw new AgentError('A resposta estruturada nao passou na validacao do schema.', 503, 'schema-validation-failed', parsed.error);
  if (expectedType && parsed.data.type !== expectedType) throw new AgentError(`O Agent retornou tipo '${parsed.data.type}', mas a etapa esperava '${expectedType}'.`, 503, 'unexpected-response-type');
  if (parsed.data.type === 'analysis') {
    const checked = analysisResponseSchema.safeParse(parsed.data);
    if (!checked.success) throw new AgentError('A analise retornada pelo Agent possui estrutura invalida.', 503, 'invalid-analysis', checked.error);
    if (checked.data.chart && !executedTools.has(checked.data.chart.source.tool)) throw new AgentError('O gráfico não corresponde a uma fonte autorizada.', 503, 'invalid-chart-source');
  }
  if (parsed.data.type === 'action') {
    const checked = actionResponseSchema.safeParse(parsed.data);
    if (!checked.success || !executedTools.has(checked.data.action)) throw new AgentError('A ação retornada pelo Agent não corresponde a uma Tool executada.', 503, 'invalid-action');
  }
  return parsed.data;
}

function toolContent(name, toolCallId, result) {
  return JSON.stringify({ name, toolCallId, result: redact(result) });
}

function errorContent(error) {
  return { error: error?.publicMessage || 'A Tool não pôde ser executada.', code: error?.code || 'tool-error' };
}

function completeAnalysisFromTools(content, toolOutputs) {
  const trends = toolOutputs.get('get_study_trends');
  if (!trends) return content;
  const periods = trends.periods;
  if (!Array.isArray(periods) || !periods.length || periods.some(period => !Number.isInteger(period.minutes) || period.minutes < 0 || !Number.isInteger(period.sessions) || period.sessions < 0)) throw new AgentError('Os dados temporais retornados pela Tool sao invalidos.', 503, 'invalid-trend-data');
  const metrics = { metric: trends.metric, unit: trends.unit, granularity: trends.granularity, count: trends.count, comparison: trends.comparison, start: trends.start, end: trends.end, minutes: trends.minutes, sessions: trends.sessions };
  if (!trends.hasActivity) return JSON.stringify({ type: 'analysis', analysis: 'Nao ha sessoes de estudo registradas no periodo solicitado para comparar.', metrics });
  const data = periods.map(period => ({ period: period.label, start: period.start, end: period.end, minutes: period.minutes, sessions: period.sessions }));
  const chartType = trends.chartType === 'line' ? 'line' : 'bar';
  return JSON.stringify({
    type: 'analysis',
    analysis: `Foram registrados ${trends.minutes} minutos de estudo entre ${trends.start} e ${trends.end}, organizados em ${trends.periods.length} periodos ${trends.granularity === 'month' ? 'mensais' : trends.granularity === 'week' ? 'semanais' : 'diarios'}.`,
    metrics,
    chart: {
      type: chartType,
      title: `Minutos estudados por ${trends.granularity === 'month' ? 'mes' : trends.granularity === 'week' ? 'semana' : 'dia'}`,
      description: 'Valores calculados a partir das sessoes de estudo registradas no periodo solicitado.',
      xAxis: { field: 'period', label: trends.granularity === 'month' ? 'Mes' : trends.granularity === 'week' ? 'Semana' : 'Data' },
      yAxis: { field: 'minutes', label: 'Minutos estudados' },
      series: [{ field: 'minutes', label: 'Minutos estudados' }],
      data,
      source: { tool: 'get_study_trends' },
      datasetVersion: 'get_study_trends-v3',
    },
  });
}

function finalToolType(current, definition) {
  return definition?.risk === 'write' || current === 'action' ? 'action' : 'analysis';
}

export async function chatWithAgent({ db, user, message, conversationId, config = readAgentConfig(), provider, tools } = {}) {
  const input = agentChatInputSchema.safeParse({ message, conversationId });
  if (!input.success) throw new AgentError('Mensagem inválida.', 400, 'invalid-message', input.error);
  const agentProvider = provider || createAgentProvider(config);
  const registry = tools || createAgentToolRegistry();
  let currentConversationId = input.data.conversationId;
  let history = [];
  if (currentConversationId) {
    const loaded = await loadConversation(db, currentConversationId, user.id, config.maxHistory);
    history = loaded.messages;
  } else {
    currentConversationId = await createConversation(db, user.id, input.data.message);
  }
  await persistMessage(db, currentConversationId, 'USER', input.data.message);
  const subjects = (await db.query('SELECT id,name FROM subjects WHERE user_id=$1 ORDER BY created_at,id', [user.id])).rows;
  const messages = [{ role: 'system', content: buildSystemPrompt({ subjects }) }, ...history, { role: 'user', content: input.data.message }];
  let requestedTemporal;
  try { requestedTemporal = normalizeTemporalRequest(input.data.message); } catch (error) { requestedTemporal = { error }; }
  const executedToolNames = new Set();
  const executedCallKeys = new Set();
  const toolOutputs = new Map();
  const failedToolNames = new Set();
  let expectedType;
  let iterations = 0;
  let toolCallCount = 0;
  while (iterations < config.maxIterations) {
    iterations += 1;
    let result;
    try {
      result = await agentProvider.complete({
        model: config.model,
        messages,
        tools: expectedType ? undefined : registry.list(),
        responseFormat: expectedType ? expectedResponse(expectedType) : undefined,
        temperature: 0.2,
        maxTokens: 1600,
      });
    } catch (error) {
      const trends = toolOutputs.get('get_study_trends');
      if (!trends || expectedType !== 'analysis' || !String(error?.code || '').startsWith('provider-')) throw error;
      const response = parseResponse(completeAnalysisFromTools('', toolOutputs), expectedType, executedToolNames);
      await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(response));
      await db.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1 AND user_id=$2', [currentConversationId, user.id]);
      return { conversationId: currentConversationId, response, metadata: { model: config.model, iterations, toolCalls: toolCallCount, textFallback: true } };
    }
    const calls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    if (!calls.length) {
      if (failedToolNames.has('get_study_trends')) throw new AgentError('Nao foi possivel consultar o historico de sessoes de estudo.', 503, 'study-trends-unavailable');
      const response = parseResponse(completeAnalysisFromTools(result.content, toolOutputs), expectedType, executedToolNames);
      await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(response));
      await db.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1 AND user_id=$2', [currentConversationId, user.id]);
      return { conversationId: currentConversationId, response, metadata: { model: result.model || config.model, iterations, toolCalls: toolCallCount } };
    }
    const assistantCallMessage = { content: result.content, toolCalls: calls.map(call => ({ id: call.id, name: call.name, arguments: redact(call.arguments), ...(typeof call.thoughtSignature === 'string' ? { thoughtSignature: call.thoughtSignature } : {}) })) };
    messages.push({ role: 'assistant', content: result.content || null, tool_calls: calls });
    await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(assistantCallMessage));
    for (const rawCall of calls) {
      toolCallCount += 1;
      const name = typeof rawCall?.name === 'string' ? rawCall.name : 'unknown';
      const callId = typeof rawCall?.id === 'string' ? rawCall.id : randomUUID();
      const definition = registry.get(name);
      const callArguments = name === 'get_study_trends' ? { ...(rawCall?.arguments || {}), ...(requestedTemporal?.error ? {} : { temporal: requestedTemporal }) } : (rawCall?.arguments || {});
      const executionId = randomUUID();
      const key = `${callId}:${name}:${JSON.stringify(callArguments)}`;
      await db.query('INSERT INTO ai_tool_executions(id,user_id,conversation_id,intent,tool_name,input_json,status,model,provider,prompt_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [executionId, user.id, currentConversationId, definition?.risk || 'unknown', name, boundedJson(callArguments, config.maxToolResultLength), 'PENDING', result.model || config.model, config.provider, config.promptVersion]);
      let output;
      let failure;
      try {
        const effectiveCall = { id: callId, name, arguments: callArguments };
        const effectiveParsed = toolCallSchema.safeParse(effectiveCall);
        if (!effectiveParsed.success) throw new AgentError('Tool Call malformada.', 400, 'invalid-tool-call', effectiveParsed.error);
        if (requestedTemporal?.error && name === 'get_study_trends') throw new AgentError(requestedTemporal.error.message, 400, 'invalid-temporal-range');
        if (executedCallKeys.has(key)) throw new AgentError('Tool Call duplicada rejeitada.', 400, 'duplicate-tool-call');
        executedCallKeys.add(key);
        const validation = registry.validate(name, effectiveParsed.data.arguments);
        if (!validation.success) throw validation.error;
        output = await registry.execute(name, validation.data, { db, user, executionId, conversationId: currentConversationId, config });
        executedToolNames.add(name);
        failedToolNames.delete(name);
        expectedType = finalToolType(expectedType, definition);
        await db.query('UPDATE ai_tool_executions SET output_json=$2,status=$3,completed_at=now() WHERE id=$1 AND user_id=$4', [executionId, boundedJson(output, config.maxToolResultLength), 'SUCCESS', user.id]);
      } catch (error) {
        failure = error instanceof AgentError ? error : new AgentError('A Tool falhou.', 503, 'tool-failed', error);
        failedToolNames.add(name);
        await db.query('UPDATE ai_tool_executions SET output_json=$2,status=$3,completed_at=now() WHERE id=$1 AND user_id=$4', [executionId, JSON.stringify(errorContent(failure)), 'FAILED', user.id]);
      }
      if (!failure) toolOutputs.set(name, output);
      const toolResult = failure ? errorContent(failure) : output;
      messages.push({ role: 'tool', name, tool_call_id: callId, content: JSON.stringify(toolResult) });
      await persistMessage(db, currentConversationId, 'TOOL', toolContent(name, callId, toolResult));
    }
  }
  throw new AgentError('O Agent atingiu o limite de iterações.', 503, 'iteration-limit');
}
