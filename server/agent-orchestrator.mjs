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
      if (value?.geminiContent?.role === 'model' && Array.isArray(value.geminiContent.parts)) return { role: 'assistant', content: value.content || null, ...(Array.isArray(value.toolCalls) ? { tool_calls: value.toolCalls } : {}), geminiContent: value.geminiContent };
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
  // Select the newest messages, then restore chronological order for the model.
  let rows = (await db.query('SELECT id,created_at::text AS history_time,role,content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2', [conversationId, limit])).rows
    .reverse();
  if (rows.length && rows[0].role !== 'USER') {
    // maxHistory is a target, not permission to split a Tool exchange. Extend
    // only to the user turn that owns the oldest selected message.
    const boundary = (await db.query("SELECT id,created_at::text AS history_time FROM ai_messages WHERE conversation_id=$1 AND role='USER' AND (created_at,id)<=($2,$3::uuid) ORDER BY created_at DESC,id DESC LIMIT 1", [conversationId, rows[0].history_time, rows[0].id])).rows[0];
    if (boundary) rows = (await db.query('SELECT role,content FROM ai_messages WHERE conversation_id=$1 AND (created_at,id)>=($2,$3::uuid) ORDER BY created_at,id', [conversationId, boundary.history_time, boundary.id])).rows;
    else rows = [];
  }
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
  if (typeof content !== 'string') return content;
  let value;
  try { value = JSON.parse(content); } catch { return content; }
  if (value?.type === 'action' && toolOutputs.has(value.action)) return JSON.stringify({ ...value, result: redact(toolOutputs.get(value.action)) });
  const trends = toolOutputs.get('get_study_trends');
  if (!trends || value?.type !== 'analysis') return content;
  const data = [
    { period: 'Periodo atual', minutes: trends.minutes },
    { period: 'Periodo anterior', minutes: trends.previousMinutes },
  ];
  return JSON.stringify({
    ...value,
    metrics: { ...trends },
    chart: {
      type: 'comparison',
      title: 'Comparativo das ultimas duas semanas de estudo',
      xAxis: { field: 'period', label: 'Periodo' },
      yAxis: { field: 'minutes', label: 'Minutos estudados' },
      series: [{ field: 'minutes', label: 'Minutos estudados' }],
      data,
      source: { tool: 'get_study_trends' },
      datasetVersion: 'get_study_trends-v1',
    },
  });
}

const laboratoryHandoffs = new Set(['prepare_study_quiz', 'prepare_study_exam', 'prepare_study_flashcards']);

function finalToolType(current, definition) {
  return definition?.risk === 'write' || current === 'action' ? 'action' : 'analysis';
}

async function runAgentTurn({ db, user, message, conversationId, config = readAgentConfig(), provider, tools } = {}) {
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
  const messages = [{ role: 'system', content: buildSystemPrompt({ subjects })+(registry.has('prepare_study_flashcards')?'\nPara flashcards ou revisão dos erros, use prepare_study_flashcards. O estudante confirma a geração no Laboratório; você só prepara o rascunho. Para o que revisar hoje, consulte get_review_schedule, sem gerar conteúdo. Autoavaliações não comprovam retenção. Nunca invente fontes nem reaproveite gabaritos antigos como fatos confirmados.':'')+(registry.has('prepare_study_quiz')?'\nPara um quiz interativo solicitado pelo estudante, use prepare_study_quiz com o pedido e a disciplina correspondente, se identificada. Não crie tarefas acadêmicas para esse pedido.':'')+(registry.has('prepare_study_exam')?'\nPara simulado ou prova, use prepare_study_exam. Para matéria que mais precisa revisar, deixe subjectId ausente e o backend fará a sugestão. O padrão tem 30 questões mistas, sem limite, revisão e correção após entrega. O estudante deve confirmar a configuração no Laboratório antes da geração. Você não pode responder, marcar alternativas, entregar provas ou modificar notas.':'') }, ...history, { role: 'user', content: input.data.message }];
  const executedToolNames = new Set();
  const executedCallKeys = new Set();
  const toolOutputs = new Map();
  let expectedType;
  let iterations = 0;
  let toolCallCount = 0;
  let actionsApplied = false;
  try {
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
    const finalizing = !!expectedType;
    if (!calls.length) {
      let response;
      try {
        response = parseResponse(completeAnalysisFromTools(result.content, toolOutputs), expectedType, executedToolNames);
      } catch (error) {
        if (!expectedType || iterations >= config.maxIterations || !['invalid-structured-output','invalid-analysis','invalid-action','invalid-chart-source'].includes(error.code)) throw error;
        // Repair only the final representation; Tools stay disabled and no
        // domain action is replayed. Never retry a safety/provider rejection.
        messages.push({ role: 'assistant', content: result.content || null, ...(result.geminiContent ? { geminiContent: result.geminiContent } : {}) });
        messages.push({ role: 'system', content: 'A resposta final anterior não passou na validação. Reescreva somente o JSON conforme o contrato solicitado, usando os resultados existentes. Não chame ferramentas e não repita ações.' });
        continue;
      }
      await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(result.geminiContent ? { content: JSON.stringify(response), geminiContent: result.geminiContent } : response));
      await db.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1 AND user_id=$2', [currentConversationId, user.id]);
      return { conversationId: currentConversationId, response, metadata: { model: result.model || config.model, iterations, toolCalls: toolCallCount } };
    }
    const assistantCallMessage = { content: result.content, toolCalls: calls.map(call => ({ id: call.id, name: call.name, arguments: redact(call.arguments), ...(typeof call.thoughtSignature === 'string' ? { thoughtSignature: call.thoughtSignature } : {}) })), ...(result.geminiContent ? { geminiContent: result.geminiContent } : {}) };
    messages.push({ role: 'assistant', content: result.content || null, tool_calls: calls, ...(result.geminiContent ? { geminiContent: result.geminiContent } : {}) });
    await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(assistantCallMessage));
    for (const rawCall of calls) {
      toolCallCount += 1;
      const callParsed = toolCallSchema.safeParse({ id: rawCall?.id, name: rawCall?.name, arguments: rawCall?.arguments });
      const name = typeof rawCall?.name === 'string' ? rawCall.name : 'unknown';
      const callId = typeof rawCall?.id === 'string' ? rawCall.id : randomUUID();
      const definition = registry.get(name);
      const executionId = randomUUID();
      const key = callId;
      await db.query('INSERT INTO ai_tool_executions(id,user_id,conversation_id,intent,tool_name,input_json,status,model,provider,prompt_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [executionId, user.id, currentConversationId, definition?.risk || 'unknown', name, boundedJson(rawCall?.arguments || {}, config.maxToolResultLength), 'PENDING', result.model || config.model, config.provider, config.promptVersion]);
      let output;
      let failure;
      try {
        if (!callParsed.success) throw new AgentError('Tool Call malformada.', 400, 'invalid-tool-call', callParsed.error);
        if (finalizing && definition?.risk === 'write') throw new AgentError('Uma nova ação durante a resposta final foi rejeitada.', 400, 'unexpected-tool-call');
        if (executedCallKeys.has(key)) throw new AgentError('Tool Call duplicada rejeitada.', 400, 'duplicate-tool-call');
        executedCallKeys.add(key);
        const validation = registry.validate(name, callParsed.data.arguments);
        if (!validation.success) throw validation.error;
        output = await registry.execute(name, validation.data, { db, user, executionId, conversationId: currentConversationId, config });
        if (definition?.risk === 'write') actionsApplied = true;
        executedToolNames.add(name);
        expectedType = finalToolType(expectedType, definition);
        await db.query('UPDATE ai_tool_executions SET output_json=$2,status=$3,completed_at=now() WHERE id=$1 AND user_id=$4', [executionId, boundedJson(output, config.maxToolResultLength), 'SUCCESS', user.id]);
      } catch (error) {
        failure = error instanceof AgentError ? error : new AgentError('A Tool falhou.', 503, 'tool-failed', error);
        await db.query('UPDATE ai_tool_executions SET output_json=$2,status=$3,completed_at=now() WHERE id=$1 AND user_id=$4', [executionId, JSON.stringify(errorContent(failure)), 'FAILED', user.id]);
      }
      if (!failure) toolOutputs.set(name, output);
      const toolResult = failure ? errorContent(failure) : output;
      messages.push({ role: 'tool', name, tool_call_id: callId, content: JSON.stringify(toolResult) });
      await persistMessage(db, currentConversationId, 'TOOL', toolContent(name, callId, toolResult));
    }

    // A saved Laboratory draft has everything the client needs to open it.
    const writes = calls.filter(call => registry.get(call?.name)?.risk === 'write');
    const handoff = writes.length === 1 ? writes[0].name : null;
    if (!finalizing && handoff && laboratoryHandoffs.has(handoff) && toolOutputs.has(handoff)) {
      const response = actionResponseSchema.parse({ type: 'action', action: handoff, result: redact(toolOutputs.get(handoff)) });
      await persistMessage(db, currentConversationId, 'ASSISTANT', JSON.stringify(response));
      await db.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1 AND user_id=$2', [currentConversationId, user.id]);
      return { conversationId: currentConversationId, response, metadata: { model: result.model || config.model, iterations, toolCalls: toolCallCount } };
    }
  }
  throw new AgentError('O Agent atingiu o limite de iterações.', 503, 'iteration-limit');
  } catch (error) {
    const failure=error instanceof AgentError?error:new AgentError('Não foi possível concluir a resposta do assistente.',503,'agent-error',error);
    failure.conversationId=currentConversationId;failure.actionsApplied=actionsApplied;
    throw failure;
  }
}

// A persisted lease rejects simultaneous turns before storing a second user
// message. No database transaction is held while waiting on a provider.
export async function chatWithAgent(options={}){
  const checked=agentChatInputSchema.safeParse({message:options.message,conversationId:options.conversationId});
  if(!checked.success)throw new AgentError('Mensagem inválida.',400,'invalid-message');
  const {db,user}=options,conversationId=checked.data.conversationId||await createConversation(db,user.id,checked.data.message),turn=randomUUID();
  const claim=await db.query("UPDATE ai_conversations SET active_turn=$3,active_turn_started_at=now() WHERE id=$1 AND user_id=$2 AND (active_turn IS NULL OR active_turn_started_at<now()-interval '15 minutes') RETURNING id",[conversationId,user.id,turn]);
  if(!claim.rows.length){const owned=(await db.query('SELECT id FROM ai_conversations WHERE id=$1 AND user_id=$2',[conversationId,user.id])).rows[0];const error=new AgentError(owned?'Uma resposta já está sendo preparada nesta conversa. Aguarde antes de enviar outra mensagem.':'Conversa não encontrada.',owned?409:404,owned?'conversation-busy':'conversation-not-found');error.conversationId=conversationId;throw error;}
  try{return await runAgentTurn({...options,conversationId});}
  finally{try{await db.query('UPDATE ai_conversations SET active_turn=NULL,active_turn_started_at=NULL WHERE id=$1 AND user_id=$2 AND active_turn=$3',[conversationId,user.id,turn]);}catch{console.error('Agent turn lease could not be released.');}}
}
