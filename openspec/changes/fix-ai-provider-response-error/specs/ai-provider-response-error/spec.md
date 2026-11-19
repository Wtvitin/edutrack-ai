# AI Provider Response Error

## ADDED Requirements

### Requirement: Compatibilidade Groq após Tool Calling

O adapter Groq MUST converter Tool Calls do contrato interno para mensagens
`assistant.tool_calls` com `id`, `type=function` e objeto `function` antes de
enviar a continuação da conversa.

#### Scenario: retorno de Tool

- WHEN o Orchestrator envia uma mensagem Assistant com Tool Call normalizada
- THEN o Groq MUST receber `type=function`, nome e argumentos JSON serializados,
  e a mensagem `tool` MUST manter o mesmo `tool_call_id`.

### Requirement: Filtro opcional compatível

O boundary Groq MUST aceitar que o modelo emita `null` para o filtro opcional de
`list_tasks`, tratando esse valor como ausência de filtro sem alterar as regras
de ownership ou permitir propriedades extras.

#### Scenario: listagem sem filtro

- WHEN Groq solicita `list_tasks` com `{ "status": null }`
- THEN o backend MUST validar a chamada e executar a listagem completa da conta.

### Requirement: Structured Output Groq compatível

Quando o contrato de resposta contém objetos dinâmicos, o adapter Groq MUST
solicitar JSON object mode e incluir instrução suficiente para o contrato,
enquanto o backend MUST continuar validando o JSON contra os schemas existentes.

#### Scenario: resposta analítica

- WHEN uma Tool de leitura termina e o Orchestrator solicita resposta `analysis`
- THEN o Groq MUST receber JSON object mode e a API MUST retornar somente uma
  resposta validada pelo backend.

### Requirement: Preservação dos outros providers

O sistema MUST preservar Gemini, seleção explícita, AgentOrchestrator, Tool
Registry, autenticação, autorização, ownership, auditoria e ausência de fallback.

#### Scenario: Gemini selecionado

- WHEN `LLM_PROVIDER=google-gemini`
- THEN o adapter Gemini MUST continuar usando o mapeamento Gemini existente sem
  receber a transformação específica do Groq.
