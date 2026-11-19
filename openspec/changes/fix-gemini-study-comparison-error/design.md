# Design

## Fluxo validado

```text
UI
  -> POST /api/ai/chat
  -> AgentOrchestrator
  -> GeminiProviderAdapter
  -> get_study_trends
  -> Tool Result
  -> segunda chamada Gemini
  -> Structured Output validado
  -> API HTTP 200
  -> UI
```

## Persistência de Tool Call

O contrato interno continua `{ id, name, arguments }` com o campo conhecido
`thoughtSignature` quando o Gemini o fornece. O Orchestrator persiste esse campo
sem aceitar campos arbitrários; `parseStoredMessage` já o repassa ao histórico
interno e `geminiMessages` o converte para a parte `thoughtSignature` da
mensagem `functionCall`.

## Boundary de provider

Nenhuma transformação específica de Groq é aplicada ao Gemini. O adapter Gemini
continua responsável por `systemInstruction`, `contents`, `functionCall`,
`functionResponse`, retry, timeout e parsing da resposta. A seleção permanece
determinística por `LLM_PROVIDER` e não existe fallback automático.

## Diagnóstico operacional

O teste real separa código e runtime: uma instância antiga em `4173` falhou com
503; uma instância isolada atual em `4373` e, depois, a instância reiniciada em
`4173` completaram o caso com HTTP 200. O relatório registra essa distinção para
evitar atribuir falha de processo antigo à Tool `get_study_trends`.

## Validação de segurança

O `userId` continua vindo da sessão autenticada. A Tool Registry, schemas,
ownership, auditoria e validação final Zod não são bypassados pela preservação do
campo Gemini.

## Traceability

| Requirement | Implementation | Test/Evidence |
| --- | --- | --- |
| Metadados Gemini | `server/agent-orchestrator.mjs:160` | `tests/agent-orchestrator.test.mjs` |
| Continuidade | `server/agent-provider.mjs:144-191`, `server/agent-orchestrator.mjs:121-194` | teste de continuidade + E2E autenticado |
| Provider explícito | `server/agent-config.mjs:24-43`, `server/agent-provider.mjs:293-302` | testes de provider + E2E Gemini |
