# Design

## Fluxo corrigido

```text
AgentOrchestrator
  -> contrato interno de Tool Call
  -> GroqProviderAdapter
      -> assistant.tool_calls OpenAI-compatível
      -> tool schema nullable compatível
      -> response_format=json_object + instrução do contrato
  -> Groq
  -> Tool Registry existente
  -> Structured Output validado no backend
```

## Fronteira de compatibilidade

`server/agent-provider.mjs` é o único ponto que conhece o formato wire do Groq.
O Orchestrator continua usando o contrato normalizado e Gemini continua usando
`geminiMessages`/`geminiTools` sem compartilhar a transformação Groq.

## Structured Output

O contrato final continua sendo `text`, `analysis` ou `action` e continua sendo
validado por `structuredResponseSchema`, `analysisResponseSchema` e
`actionResponseSchema`. O Groq recebe JSON object mode porque os contratos
analíticos contêm mapas e linhas de gráfico dinâmicos que não podem ser
representados pelo schema estrito aceito pelo endpoint observado.

## Segurança

Nenhuma mudança altera identidade, ownership ou autorização. `null` no filtro
opcional de listagem significa ausência de filtro; argumentos extras e enums
inválidos continuam rejeitados. O provider selecionado continua determinístico e
não existe fallback para Gemini ou OpenRouter.

## Traceability

| Requirement | Implementation | Test |
| --- | --- | --- |
| Tool Call Groq | `server/agent-provider.mjs:43`, `server/agent-provider.mjs:215` | `tests/agent-provider.test.mjs:123` |
| Filtro nullable | `server/agent-provider.mjs:47`, `server/agent-schemas.mjs:40` | `tests/agent-provider.test.mjs:115`, `tests/agent-tools.test.mjs:46` |
| Structured Output | `server/agent-provider.mjs:98`, `server/agent-provider.mjs:224` | `tests/agent-provider.test.mjs:130`, `tests/agent-orchestrator.test.mjs:55` |
| Preservação | `server/agent-provider.mjs:264`, `server/agent-orchestrator.mjs:145` | `tests/agent-provider.test.mjs:60`, `tests/agent-orchestrator.test.mjs:70` |
