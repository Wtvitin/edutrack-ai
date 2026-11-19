# Gemini Study Comparison Continuity

## ADDED Requirements

### Requirement: Preservar metadados conhecidos de Tool Call Gemini

When the Gemini adapter returns a Tool Call with `id` or `thoughtSignature`, the
Agent MUST preserve those known fields when persisting the assistant message for
conversation history.

#### Scenario: Retomada de conversa após Tool

- WHEN uma conversa é retomada com `conversationId` após `get_study_trends`
- THEN o histórico reconstruído MUST conter o mesmo `id` e
  `thoughtSignature` da Tool Call Gemini original, quando fornecidos.

### Requirement: Continuidade do fluxo de comparação

When an authenticated user asks for a comparison of the two latest study weeks,
the Agent MUST reuse the existing Orchestrator, Tool Registry, ownership and
Structured Output validation.

#### Scenario: Comparação `0/105`

- WHEN a Tool retorna `minutes=0` e `previousMinutes=105`
- THEN the API MUST return HTTP 200 with a validated analysis and comparison chart
  sourced from `get_study_trends`.

### Requirement: Seleção explícita de provider

The runtime MUST use the provider selected by `LLM_PROVIDER` and MUST NOT switch
silently to Gemini, Groq or OpenRouter after a provider error.

#### Scenario: Gemini selecionado

- WHEN `LLM_PROVIDER=google-gemini`
- THEN the request MUST use the Gemini adapter and no provider fallback.
