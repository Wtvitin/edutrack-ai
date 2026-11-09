# Auditoria de estabilidade do agente — 27/10/2026

## Escopo e preservação

Auditoria do provider, configuração, orquestração, schemas, API e frontend do agente. A configuração padrão continua **google-gemini / gemini-2.5-flash**, sem fallback implícito para outro provedor. OpenRouter e Groq continuam disponíveis por seleção explícita.

Já existiam antes desta rodada: seleção das mensagens mais recentes no histórico, preservação de thoughtSignature nas chamadas de função, validação Zod, limite de três iterações, ferramentas autorizadas com ownership e auditoria. Essas correções não foram reaplicadas como duplicatas.

O diretório já continha o patch da rodada anterior: mudanças em server/mail.mjs, tests/mail-resend.test.mjs e seleção recente do histórico em server/agent-orchestrator.mjs. As alterações de e-mail foram preservadas sem edição nesta auditoria.

## Problemas e causas

| Problema | Causa identificada | Correção |
|---|---|---|
| Bloqueio de segurança confundido com indisponibilidade | Parser inspecionava apenas candidates/content/parts | Classificação de promptFeedback, safetyRatings e finishReason; bloqueios não são repetidos |
| Respostas cortadas e chamadas malformadas | MAX_TOKENS e MALFORMED_FUNCTION_CALL não eram diferenciados | Erros controlados, sem devolver ou executar chamadas parciais |
| Repetições muito próximas e tempo acumulado | Espera fixa de 50 ms e timeout reiniciado por tentativa | Uma repetição no máximo, espera com jitter, Retry-After/RetryInfo e orçamento total por completion |
| Cota diária repetida inutilmente | Todo HTTP 429 era tratado como transitório | QuotaFailure diária reconhecida, sem repetição automática |
| Falhas intermitentes depois de Tools | Reconstrução perdia partes assinadas, ordem e agrupamento de respostas paralelas | Partes originais preservadas; respostas de funções agrupadas; IDs sintéticos internos não são enviados como IDs nativos |
| Schema estruturado incompatível | Conversão removia additionalProperties de objetos dinâmicos, usando responseSchema | responseJsonSchema preserva objetos de métricas/resultados; campos nullable de Tools usam nullable; validação estrita local mantida |
| Histórico cortava uma troca de Tools | LIMIT de mensagens podia começar em uma resposta de ferramenta | Janela estendida até o USER que inicia a troca, mantendo precisão de microssegundos |
| Ação concluída aparecia como simples erro | Falha na geração final perdia o ID da conversa no frontend | API retorna conversationId e actionsApplied; frontend preserva contexto, atualiza dados e orienta a não repetir a ação |
| Nova ação indevida na finalização | O orquestrador aceitava chamadas mesmo na fase sem Tools | Novas escritas são rejeitadas e auditadas; IDs repetidos não autorizam outra chamada |
| JSON final inválido | A geração podia divergir do contrato após executar uma Tool | Uma correção de representação dentro do limite de três iterações; não reexecuta ações |
| Resultado de ação inventado pelo modelo | Validação checava formato e nome da Tool, mas não a origem do result | Resultado exibido vem da saída autorizada da Tool executada |
| Payload inválido ou erro HTML no frontend | response.json sem tratamento e confiança no formato declarado | Erro seguro e schemas compartilhados para validar antes de renderizar |

## Política de tentativas

- HTTP 429, 500, 502, 503, 504 e 408 permitem no máximo uma repetição, se houver tempo disponível.
- HTTP 400, 401, 403, 404, 501 e demais erros não classificados como transitórios não são repetidos pelo Gemini.
- Retry-After ou RetryInfo que ultrapasse o orçamento disponível causa retorno controlado, não repetição imediata.
- Bloqueios, truncamento, chamadas malformadas e falhas conhecidas de geração não são tratados como falhas de conexão.
- Resposta genuinamente vazia e falha de rede têm recuperação limitada.
- Recuperação de transporte repete somente a requisição ao modelo. Recuperação de JSON repete somente a representação final. Nenhuma delas repete uma Tool de escrita já concluída.
- O timeout continua configurável pelo mecanismo existente, sem alteração de .env. No Gemini, ele limita o conjunto de tentativas de uma completion; não é reiniciado para cada tentativa.

## Arquivos desta auditoria

Código:

- server/agent-provider.mjs
- server/agent-orchestrator.mjs
- server/agent-schemas.mjs
- server/api.mjs — somente diagnóstico e resposta de erro do agente
- components/edutrack/agent-api.ts
- components/edutrack/agent-view.tsx
- components/edutrack/app.tsx — callback de atualização dos dados após ações
- lib/agent-errors.mjs — mensagens públicas sem detalhes do provedor
- lib/agent-response-schemas.mjs — contratos de resposta compartilhados, mantendo os exports antigos

Testes:

- tests/agent-provider.test.mjs
- tests/agent-api.test.mjs
- tests/gemini-stability.test.mjs
- tests/agent-recovery.test.mjs
- tests/agent-client.test.mjs

server/agent-config.mjs foi revisado e não precisou ser alterado. Não houve modificação de Classroom, e-mails, migrações, credenciais ou dados reais. Nenhum commit, push ou deploy foi realizado.

## Validação

| Comando | Resultado final |
|---|---|
| npm run typecheck | Aprovado, exit 0 |
| npm test | 149 testes aprovados; zero falhas, cancelamentos ou skips; exit 0 |
| npm run lint | Aprovado, zero warnings; exit 0 |
| npm run build | Aprovado na repetição, exit 0, mantendo aviso de segurança do Next |
| git diff --check | Aprovado |

São 45 testes a mais que a suíte de 104 anterior à auditoria. Os testes utilizam transportes e credenciais fictícias; testes de API usam HTTP local e bancos memory:// descartáveis.

Validação adicional: smoke com 25 páginas, 2 assets e 2 rotas inexistentes, autenticação, CRUD, histórico, notificações, analytics, status de integração, CSRF e agente simulado aprovado. Quatro testes de navegador de produção também passaram: bloqueio seguro sem retry, continuidade de conversa e atualização após ação aplicada, duplo submit enviando uma só requisição e rejeição de resposta malformada sem exceções JavaScript. Artefatos locais: .local/audits/gemini-2026-10-27/browser-results.json.

**Pendência de segurança independente:** o primeiro build terminou com SecurityFatalError após compilar e checar tipos. A repetição padrão do mesmo comando passou, ainda exibindo o aviso; isso não corrige a vulnerabilidade. npm audit --json retornou exit 1 e três pacotes vulneráveis: Next.js (crítico), Zod (alto) e Nodemailer (moderado). Não foi executado audit fix, upgrade, alteração de package.json ou lockfile. A migração major de Zod e mudanças do sistema de e-mails precisam de uma rodada separada com autorização e testes de compatibilidade. Não considerar o projeto livre de vulnerabilidades nem pronto para exposição pública apenas porque o build passou.

Cobertura de regressão: códigos HTTP transitórios e permanentes, quota diária, instruções de espera, falha de conexão, timeout no corpo, bloqueios de segurança, resposta vazia, truncamento, chamadas malformadas, schemas nullable, partes assinadas, múltiplas Tools, IDs ausentes, histórico recente completo, recuperação de JSON, criação única durante recuperação, continuidade após falha e erros seguros no frontend/API.

## Riscos e limites restantes

0. **Prioridade alta:** corrigir os alertas de dependências antes de publicar. Referências: [Next.js](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Nodemailer](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8). O audit apresenta outros advisories no mesmo pacote; os links são exemplos dos alertas, não uma alegação de que todos os caminhos vulneráveis sejam utilizados pelo EduTrack.
1. Não houve chamada real ao Gemini: cotas, rede externa, disponibilidade e comportamento específico da conta/modelo não estão comprovados por mocks.
2. Idempotência durável entre requisições HTTP independentes e concorrentes ainda é recomendada. A proteção desta rodada cobre as tentativas dentro do mesmo processamento e o duplo envio imediato da interface, não qualquer repetição manual ou reenvio após perda da conexão.
3. O orçamento de completion não é um deadline único para toda a conversa: ferramentas, banco e até três iterações têm seus próprios tempos.
4. Uma troca longa pode superar o alvo maxHistory para manter chamadas e respostas juntas. Recomenda-se orçamento de tokens e compactação segura em vez de cortar partes assinadas.
5. O limite de saída atual permanece. Respostas que atingirem MAX_TOKENS são explicadas ao usuário; não há aumento automático nem desativação de filtros de segurança.
6. As partes assinadas originais ficam no histórico privado do servidor. Não são devolvidas como conteúdo público nem registradas nos diagnósticos. Recomenda-se política explícita de retenção para conversas.
7. A interface preserva a conversa durante a falha na tela atual. Uma futura lista de conversas autorizada por usuário permitiria retomada após recarregar ou sair da aba.

## Próximas melhorias

- Idempotency key por ação/requisição, com retenção e controle de concorrência por conversa.
- Métricas de latência, taxa de erro e uso por código, sem prompts, tokens de autenticação ou chaves.
- Smoke real opcional e autorizado por ambiente, com limites de custo.
- Orçamento total de tokens e tamanho de saídas de Tools; revisão do orçamento de pensamento/saída por modelo.
- Recuperação visual do histórico e tratamento explícito de perda de conexão após uma ação.

## Método e referências

Graphify foi usado somente para extração AST local: 17 arquivos do backend, 211 nós e 454 relações, sem clustering e sem LLM. O grafo inicial fica em .local/gemini-audit-graph/graphify-out/graph.json, ignorado pelo Git; não é substituto para os testes. Tokens de modelo usados nessa extração: zero.

Referências primárias consultadas:

- [Gemini: troubleshooting e política de retries](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [Gemini: erros e bloqueios](https://ai.google.dev/gemini-api/docs/api-errors)
- [GenerateContent / GenerationConfig](https://ai.google.dev/api/generate-content)
- [Thought signatures e preservação exata das partes](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures)

O código mantém o endpoint GenerateContent existente; não houve migração de API ou troca automática de modelo.
