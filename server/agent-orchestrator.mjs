import { randomUUID } from 'node:crypto';
import { readAgentConfig, buildSystemPrompt, AgentError } from './agent-config.mjs';
import { actionResponseSchema, agentChatInputSchema, analysisResponseSchema, responseJsonSchemas, structuredResponseSchema, textResponseSchema, toolCallSchema } from './agent-schemas.mjs';
import { createAgentProvider } from './agent-provider.mjs';
import { createAgentToolRegistry } from './agent-tools.mjs';

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

function parseResponse(content, expectedType, executedTools) {
  if (typeof content !== 'string' || !content.trim()) throw new AgentError('O Agent retornou uma resposta vazia.', 503, 'invalid-structured-output');
  let value;
  try { value = JSON.parse(content); } catch {
    if (expectedType) throw new AgentError('O Agent retornou uma resposta estruturada inválida.', 503, 'invalid-structured-output');
    const parsedText = textResponseSchema.safeParse({ type: 'text', content: content.trim() });
    if (!parsedText.success) throw new AgentError('O Agent retornou uma resposta inválida.', 503, 'invalid-structured-output');
    return parsedText.data;
  }
  const parsed = structuredResponseSchema.safeParse(value);
  if (!parsed.success || expectedType && parsed.data.type !== expectedType) throw new AgentError('O Agent retornou uma resposta estruturada incompatível.', 503, 'invalid-structured-output', parsed.success ? undefined : parsed.error);
  if (parsed.data.type === 'analysis') {
    const checked = analysisResponseSchema.safeParse(parsed.data);
    if (!checked.success) throw new AgentError('A análise retornada pelo Agent é inválida.', 503, 'invalid-analysis', checked.error);
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
  const daily = trends.daily;
  const previousDaily = trends.previousDaily;
  if (!Array.isArray(daily) || !Array.isArray(previousDaily) || daily.length !== trends.days || previousDaily.length !== trends.days || daily.some((point, index) => !Number.isInteger(point.minutes) || point.minutes < 0 || !Number.isInteger(previousDaily[index]?.minutes) || previousDaily[index].minutes < 0)) throw new AgentError('Os dados temporais retornados pela Tool sao invalidos.', 503, 'invalid-trend-data');
  const metrics = { days: trends.days, start: trends.start, end: trends.end, previousStart: trends.previousStart, previousEnd: trends.previousEnd, minutes: trends.minutes, previousMinutes: trends.previousMinutes, sessions: trends.sessions, previousSessions: trends.previousSessions };
  if (trends.sessions + trends.previousSessions === 0) return JSON.stringify({ type: 'analysis', analysis: 'Ainda nao ha sessoes de estudo registradas nos dois periodos para comparar.', metrics });
  const data = daily.map((point, index) => ({ day: `Dia ${index + 1}`, minutes: point.minutes, previousMinutes: previousDaily[index].minutes }));
  return JSON.stringify({
    type: 'analysis',
    analysis: `Foram registrados ${trends.minutes} min nos 7 dias recentes (${trends.start} a ${trends.end}) e ${trends.previousMinutes} min nos 7 dias anteriores (${trends.previousStart} a ${trends.previousEnd}).`,
    metrics,
    chart: {
      type: 'comparison',
      title: 'Tempo de estudo nas duas ultimas semanas',
      description: 'Minutos registrados em cada dia correspondente dos periodos indicados.',
      xAxis: { field: 'day', label: 'Dia do periodo' },
      yAxis: { field: 'minutes', label: 'Minutos estudados' },
      series: [
        { field: 'previousMinutes', label: `Semana anterior (${trends.previousStart} a ${trends.previousEnd})` },
        { field: 'minutes', label: `Semana recente (${trends.start} a ${trends.end})` },
      ],
      data,
      source: { tool: 'get_study_trends' },
      datasetVersion: 'get_study_trends-v2',
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
  const executedToolNames = new Set();
  const executedCallKeys = new Set();
  const toolOutputs = new Map();
  const failedToolNames = new Set();
  let expectedType;
  let iterations = 0;
  let toolCallCount = 0;
  while (iterations < config.maxIterations) {
    iterations += 1;
    const result = await agentProvider.complete({
      model: config.model,
      messages,
      tools: expectedType ? undefined : registry.list(),
      responseFormat: expectedType ? expectedResponse(expectedType) : undefined,
      temperature: 0.2,
      maxTokens: 1600,
    });
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
      const callParsed = toolCallSchema.safeParse({ id: rawCall?.id, name: rawCall?.name, arguments: rawCall?.arguments });
      const name = typeof rawCall?.name === 'string' ? rawCall.name : 'unknown';
      const callId = typeof rawCall?.id === 'string' ? rawCall.id : randomUUID();
      const definition = registry.get(name);
      const executionId = randomUUID();
      const key = `${callId}:${name}:${JSON.stringify(rawCall?.arguments || {})}`;
      await db.query('INSERT INTO ai_tool_executions(id,user_id,conversation_id,intent,tool_name,input_json,status,model,provider,prompt_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [executionId, user.id, currentConversationId, definition?.risk || 'unknown', name, boundedJson(rawCall?.arguments || {}, config.maxToolResultLength), 'PENDING', result.model || config.model, config.provider, config.promptVersion]);
      let output;
      let failure;
      try {
        if (!callParsed.success) throw new AgentError('Tool Call malformada.', 400, 'invalid-tool-call', callParsed.error);
        if (executedCallKeys.has(key)) throw new AgentError('Tool Call duplicada rejeitada.', 400, 'duplicate-tool-call');
        executedCallKeys.add(key);
        const validation = registry.validate(name, callParsed.data.arguments);
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
