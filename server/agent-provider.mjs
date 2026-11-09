import { AgentError } from './agent-config.mjs';

export class AgentProviderError extends AgentError {
  constructor(message, status = 503, code = 'provider-unavailable', transient = false, cause) {
    super(message, status, code, cause);
    this.name = 'AgentProviderError';
    this.transient = transient;
  }
}

export function createFetchTransport(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new AgentProviderError('Provider indisponível.', 503, 'provider-transport');
  return {
    async post(url, headers, body, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
        const text = await response.text();
        let parsed = null;
        if (text) {
          try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        }
        return { status: response.status, body: parsed, retryAfter: response.headers?.get('retry-after') };
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new AgentProviderError('O tempo da resposta do Provider expirou.', 504, 'provider-timeout', true, error);
        throw new AgentProviderError('Não foi possível acessar o Provider.', 503, 'provider-network', true, error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function transientStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function providerTools(tools = []) {
  return tools.map(tool => tool.type === 'function' ? tool : ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

function groqTools(tools = []) {
  return providerTools(tools).map(tool => {
    if (tool.function.name !== 'list_tasks' || !tool.function.parameters?.properties?.status) return tool;
    const parameters = tool.function.parameters;
    return {
      ...tool,
      function: {
        ...tool.function,
        parameters: {
          ...parameters,
          properties: {
            ...parameters.properties,
            status: {
              ...parameters.properties.status,
              type: ['string', 'null'],
              enum: [...(parameters.properties.status.enum || []), null],
            },
          },
        },
      },
    };
  });
}

function groqMessages(messages = []) {
  return messages.map(message => {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return message;
    return {
      ...message,
      tool_calls: message.tool_calls.map(call => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
        },
      })),
    };
  });
}

function geminiSchema(schema, options = {}) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const result = {};
  const type = Array.isArray(schema.type) && options.tool ? schema.type.find(value => value !== 'null') || 'string' : schema.type;
  if (type !== undefined) result.type = type;
  if (options.tool && Array.isArray(schema.type) && schema.type.includes('null')) result.nullable = true;
  const schemaKeys = ['title', 'description', 'enum', 'minimum', 'maximum', 'minItems', 'maxItems', 'required'];
  for (const key of schemaKeys) {
    if (schema[key] !== undefined) result[key] = schema[key];
  }
  if (schema.const !== undefined) result.enum = [schema.const];
  if (schema.format && schema.format !== 'uuid') result.format = schema.format;
  if (options.structured && schema.additionalProperties !== undefined) result.additionalProperties = typeof schema.additionalProperties === 'object' ? geminiSchema(schema.additionalProperties, options) : schema.additionalProperties;
  if (schema.properties && typeof schema.properties === 'object') result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, value]) => [name, geminiSchema(value, options)]));
  if (schema.items) result.items = geminiSchema(schema.items, options);
  if (schema.prefixItems) result.prefixItems = schema.prefixItems.map(value => geminiSchema(value, options));
  return result;
}

function responseFormatBody(responseFormat) {
  if (!responseFormat) return undefined;
  return { type: 'json_schema', json_schema: { name: responseFormat.name, strict: true, schema: responseFormat.schema } };
}

function groqResponseMessages(messages, responseFormat) {
  if (!responseFormat) return groqMessages(messages);
  const instruction = `Retorne somente JSON válido conforme o contrato ${responseFormat.name}: ${JSON.stringify(responseFormat.schema)}`;
  const systemIndex = messages.findIndex(message => message.role === 'system');
  const normalized = systemIndex < 0 ? [{ role: 'system', content: instruction }, ...groqMessages(messages)] : groqMessages(messages).map((message, index) => index === systemIndex ? { ...message, content: `${message.content || ''}\n\n${instruction}` } : message);
  return [...normalized, { role: 'user', content: 'A ferramenta já foi executada. Não chame nenhuma ferramenta. Retorne somente o JSON final solicitado.' }];
}

function groqResponseFormatBody(responseFormat) {
  return responseFormat ? { type: 'json_object' } : undefined;
}

function parseJsonArguments(value) {
  if (typeof value !== 'string') return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

function parseOpenRouterResponse(body, model) {
  const choice = body?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new AgentProviderError('Resposta vazia do Provider.', 503, 'provider-empty-response', true);
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.map((call, index) => ({
    id: String(call?.id || `call_${index + 1}`),
    name: String(call?.function?.name || 'unknown'),
    arguments: parseJsonArguments(call?.function?.arguments),
  })) : [];
  if (message.content == null && toolCalls.length === 0) throw new AgentProviderError('Resposta vazia do Provider.', 503, 'provider-empty-response', true);
  return { content: message.content == null ? null : String(message.content), toolCalls: toolCalls.length ? toolCalls : undefined, model, usage: body?.usage, raw: body };
}

function geminiMessages(messages) {
  const nativeIds = new Map();
  for (const message of messages) {
    if (!message.geminiContent) continue;
    const calls = message.geminiContent.parts?.filter(part => part.functionCall) || [];
    (message.tool_calls || []).forEach((call,index) => nativeIds.set(call.id,calls[index]?.functionCall?.id));
  }
  const contents = messages.filter(message => message.role !== 'system').map(message => {
    if (message.role === 'user') return { role: 'user', parts: [{ text: message.content || '' }] };
    if (message.role === 'assistant') {
      if (message.geminiContent?.role === 'model' && Array.isArray(message.geminiContent.parts)) return structuredClone(message.geminiContent);
      const parts = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls || []) {
        const part = { functionCall: { name: call.name, args: call.arguments } };
        if (call.id) part.functionCall.id = call.id;
        if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
        parts.push(part);
      }
      return { role: 'model', parts: parts.length ? parts : [{ text: '' }] };
    }
    let response;
    try { response = JSON.parse(message.content || '{}'); } catch { response = { value: message.content || '' }; }
    if (!response || typeof response !== 'object' || Array.isArray(response)) response = { result: response };
    const nativeId = nativeIds.has(message.tool_call_id) ? nativeIds.get(message.tool_call_id) : message.tool_call_id;
    return { role: 'user', parts: [{ functionResponse: { name: message.name || 'tool', ...(nativeId ? { id: nativeId } : {}), response } }] };
  });
  // Parallel calls must be answered together, in the same order as the calls.
  return contents.reduce((result, content) => {
    const previous = result.at(-1);
    if (content.parts.every(part => part.functionResponse) && previous?.parts.every(part => part.functionResponse)) previous.parts.push(...content.parts);
    else result.push(content);
    return result;
  }, []);
}

function geminiSystemInstruction(messages) {
  const text = messages.filter(message => message.role === 'system').map(message => message.content || '').filter(Boolean).join('\n\n');
  return text ? { parts: [{ text }] } : undefined;
}

function geminiTools(tools = []) {
  const definitions = providerTools(tools).map(tool => ({ name: tool.function.name, description: tool.function.description || '', parameters: geminiSchema(tool.function.parameters, { tool: true }) }));
  return definitions.length ? [{ functionDeclarations: definitions }] : undefined;
}

function parseGeminiResponse(body, model) {
  const candidate = body?.candidates?.[0];
  const reason = candidate?.finishReason;
  const blocked = body?.promptFeedback?.blockReason;
  if (blocked && blocked !== 'BLOCK_REASON_UNSPECIFIED' || ['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','IMAGE_SAFETY','IMAGE_PROHIBITED_CONTENT','IMAGE_RECITATION'].includes(reason) || candidate?.safetyRatings?.some(rating => rating.blocked)) throw new AgentProviderError('O Gemini bloqueou esta solicitação por segurança. Reformule a mensagem.', 422, 'provider-safety-blocked');
  if (reason === 'MAX_TOKENS') throw new AgentProviderError('O Gemini atingiu o limite de saída. Peça uma resposta mais curta.', 503, 'provider-output-truncated');
  if (['MALFORMED_FUNCTION_CALL','UNEXPECTED_TOOL_CALL','TOO_MANY_TOOL_CALLS'].includes(reason)) throw new AgentProviderError('O Gemini retornou uma chamada de ferramenta inválida. Nenhuma nova ação foi executada.', 503, 'provider-invalid-tool-call');
  if (reason && !['STOP','FINISH_REASON_UNSPECIFIED'].includes(reason)) throw new AgentProviderError('O Gemini não concluiu a resposta. Reformule a solicitação.', 503, 'provider-generation-failed');
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || !parts.length) throw new AgentProviderError('Resposta vazia do Provider.', 503, 'provider-empty-response', true);
  let content = '';
  const toolCalls = [];
  parts.forEach((part, index) => {
    if (typeof part?.text === 'string' && !part.thought) content += part.text;
    if (part?.functionCall?.name) {
      toolCalls.push({
        id: String(part.functionCall.id || `call_${Date.now()}_${index}`),
        name: part.functionCall.name,
        arguments: part.functionCall.args === undefined ? {} : part.functionCall.args,
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
      });
    }
  });
  if (!content.trim() && !toolCalls.length) throw new AgentProviderError('Resposta vazia do Provider.', 503, 'provider-empty-response', true);
  return { content: content || null, toolCalls: toolCalls.length ? toolCalls : undefined, geminiContent: { role: 'model', parts: structuredClone(parts) }, model, usage: body?.usageMetadata, raw: body };
}

async function completeOpenRouter(config, transport, request) {
  if (!config.apiKey) throw new AgentProviderError('O Provider do Agent não está configurado.', 503, 'provider-not-configured');
  const models = [...new Set([request.model || config.model, config.fallbackModel].filter(Boolean))];
  if (!models.length) throw new AgentProviderError('O modelo do Agent não está configurado.', 503, 'model-not-configured');
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = { model, messages: request.messages, temperature: request.temperature ?? 0.2, max_tokens: request.maxTokens ?? 1600 };
      const tools = providerTools(request.tools);
      if (tools.length) { body.tools = tools; body.tool_choice = request.toolChoice || 'auto'; }
      if (request.responseFormat) body.response_format = responseFormatBody(request.responseFormat);
      try {
        const response = await transport.post(`${config.baseUrl}/chat/completions`, { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, 'X-Title': 'EduTrack AI' }, body, config.timeoutMs);
        if (response.status < 200 || response.status >= 300) {
          const error = new AgentProviderError('O Provider não conseguiu responder.', response.status === 429 ? 429 : response.status >= 500 || response.status === 408 ? 503 : 503, 'provider-http-error', transientStatus(response.status));
          error.providerStatus = response.status;
        error.providerMessage = response.body?.error?.message;
        error.providerCode = response.body?.error?.status;
          if (!error.transient) throw error;
          lastError = error;
          continue;
        }
        return parseOpenRouterResponse(response.body, model);
      } catch (error) {
        const normalized = error instanceof AgentProviderError ? error : new AgentProviderError('O Provider não conseguiu responder.', 503, 'provider-network', true, error);
        if (!normalized.transient) throw normalized;
        lastError = normalized;
      }
      if (attempt === 0) await wait(50);
    }
  }
  throw lastError || new AgentProviderError('O Provider está indisponível.', 503, 'provider-unavailable', true);
}

async function completeGroq(config, transport, request) {
  if (!config.apiKey) throw new AgentProviderError('O Provider do Agent não está configurado.', 503, 'provider-not-configured');
  const model = request.model || config.model;
  if (!model) throw new AgentProviderError('O modelo do Agent não está configurado.', 503, 'model-not-configured');
  const body = { model, messages: groqResponseMessages(request.messages, request.responseFormat), temperature: request.temperature ?? 0.2, max_tokens: request.maxTokens ?? 1600 };
  const tools = groqTools(request.tools);
  if (tools.length) { body.tools = tools; body.tool_choice = request.toolChoice || 'auto'; }
  if (request.responseFormat) body.response_format = groqResponseFormatBody(request.responseFormat);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await transport.post(config.baseUrl + '/chat/completions', { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey }, body, config.timeoutMs);
      if (response.status < 200 || response.status >= 300) {
        const error = new AgentProviderError('O Provider não conseguiu responder.', response.status === 429 ? 429 : response.status >= 500 || response.status === 408 ? 503 : 503, 'provider-http-error', transientStatus(response.status));
        error.providerStatus = response.status;
        error.providerMessage = response.body?.error?.message;
        error.providerCode = response.body?.error?.code;
        if (!error.transient) throw error;
        lastError = error;
      } else return parseOpenRouterResponse(response.body, model);
    } catch (error) {
      const normalized = error instanceof AgentProviderError ? error : new AgentProviderError('O Provider não conseguiu responder.', 503, 'provider-network', true, error);
      if (!normalized.transient) throw normalized;
      lastError = normalized;
    }
    if (attempt === 0) await wait(50);
  }
  throw lastError || new AgentProviderError('O Provider está indisponível.', 503, 'provider-unavailable', true);
}

async function completeGemini(config, transport, request) {
  if (!config.apiKey) throw new AgentProviderError('O Provider do Agent não está configurado.', 503, 'provider-not-configured');
  const model = request.model || config.model;
  if (!model) throw new AgentProviderError('O modelo do Agent não está configurado.', 503, 'model-not-configured');
  const contents = geminiMessages(request.messages);
  const systemInstruction = geminiSystemInstruction(request.messages) || { parts: [] };
  if (request.responseFormat && !request.tools?.length) systemInstruction.parts.push({ text: `As ferramentas já foram processadas. Não execute novas ações. Retorne somente JSON válido conforme este schema: ${JSON.stringify(request.responseFormat.schema)}` });
  const body = { systemInstruction: systemInstruction.parts.length ? systemInstruction : undefined, contents, tools: geminiTools(request.tools), generationConfig: { temperature: request.temperature ?? 0.2, maxOutputTokens: request.maxTokens ?? 1600, ...(request.responseFormat && !request.tools?.length ? { responseMimeType: 'application/json', responseJsonSchema: geminiSchema(request.responseFormat.schema, { structured: true }) } : {}) } };
  const deadline = Date.now() + config.timeoutMs;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw lastError || new AgentProviderError('O tempo da resposta do Provider expirou.', 504, 'provider-timeout');
      const response = await transport.post(`${config.baseUrl}/${encodeURIComponent(model)}:generateContent`, { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }, body, remaining);
      if (response.status < 200 || response.status >= 300) {
        const details = Array.isArray(response.body?.error?.details) ? response.body.error.details : [];
        const dailyQuota = response.status === 429 && details.some(detail => Array.isArray(detail?.violations) && detail.violations.some(violation => /perday|daily/i.test(violation.quotaId || '')));
        const error = new AgentProviderError(dailyQuota ? 'A cota diária do Gemini foi atingida. Aguarde a renovação da cota.' : 'O Gemini não conseguiu responder agora.', response.status === 429 ? 429 : 503, dailyQuota ? 'provider-quota-exhausted' : 'provider-http-error', !dailyQuota && [408,429,500,502,503,504].includes(response.status));
        error.providerStatus = response.status;
        error.providerCode = response.body?.error?.status;
        const retryInfo = details.find(detail => typeof detail?.retryDelay === 'string')?.retryDelay;
        const retrySeconds = response.retryAfter ?? retryInfo?.replace(/s$/,'');
        const seconds = Number(retrySeconds);
        error.retryAfterMs = retrySeconds == null ? 0 : Number.isFinite(seconds) ? Math.max(0,seconds*1000) : Math.max(0,Date.parse(retrySeconds)-Date.now()) || 0;
        if (!error.transient) throw error;
        lastError = error;
      } else return parseGeminiResponse(response.body, model);
    } catch (error) {
      const normalized = error instanceof AgentProviderError ? error : new AgentProviderError('O Provider não conseguiu responder.', 503, 'provider-network', true, error);
      if (!normalized.transient) throw normalized;
      lastError = normalized;
    }
    if (attempt === 0) {
      const delay = Math.max(lastError?.retryAfterMs || 0, (config.retryBaseMs ?? 500) * 2 ** attempt + Math.floor(Math.random()*125));
      if (delay >= deadline-Date.now()) break;
      await wait(delay);
    }
  }
  throw lastError || new AgentProviderError('O Provider está indisponível.', 503, 'provider-unavailable', true);
}

export function GroqProviderAdapter(config, transport = createFetchTransport()) {
  return {
    async complete(request) {
      return completeGroq(config, transport, request);
    },
  };
}

export function createAgentProvider(config, transport = createFetchTransport()) {
  if (config.provider === 'groq') return GroqProviderAdapter(config, transport);
  return {
    async complete(request) {
      if (config.provider === 'google-gemini') return completeGemini(config, transport, request);
      if (config.provider === 'openrouter') return completeOpenRouter(config, transport, request);
      throw new AgentProviderError('O Provider configurado não é suportado.', 503, 'provider-not-supported');
    },
  };
}
