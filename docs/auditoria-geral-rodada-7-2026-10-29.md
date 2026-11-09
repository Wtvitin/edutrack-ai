# EduTrack AI — Auditoria geral da Rodada 7

Data: 29/10/2026. Estado: validação local isolada; homologação externa pendente. Não houve commit, push ou deploy. Este relatório separa ensaios simulados de funcionamento real das integrações.

## 1. Inventário e arquitetura

| Módulo | Responsabilidade e contratos principais |
|---|---|
| Identidade e conta | /api/auth/register, login, session, logout, confirmação, reenvio e recuperação; cookies, CSRF, tokens de uso único e perfil |
| Organização acadêmica | /api/data; disciplinas, tarefas, calendário, sessões, cronômetro, histórico e notificações; validação compartilhada e controle de revisão |
| Relatórios | /api/analytics; preparação Python/Pandas; métricas determinísticas e filtros por período/disciplina |
| Agente | /api/ai/chat; configuração explícita de provedores, histórico, ferramentas autorizadas e auditoria de ações |
| Laboratório | /api/lab, requests, quizzes e exams; preparação contextual, correção, resultados e evolução |
| Flashcards | /api/lab/flashcards e flashcard-sessions; baralhos, revisão espaçada, feedback e histórico |
| E-mail | Resend e SMTP; caixa local exclusivamente para desenvolvimento; confirmação e recuperação |
| Classroom | /api/integrations/classroom/*; OAuth, seleção, importação, deduplicação e leitura das entregas |
| Interface | Aplicação Web responsiva, temas claro/escuro/sistema, navegação, perfil, ajuda e configurações. Não foi auditado aplicativo mobile nativo. |

Frontend e IA acessam serviços do backend, sem conexão direta com PostgreSQL. As relações de usuário/disciplina/tarefa e os históricos de laboratório utilizam ownership e chaves compostas. Correções e estatísticas não são delegadas ao modelo. Tabelas de funcionalidades futuras não foram tratadas como funcionalidades já operacionais.

O inventário iniciou com Git e hashes dos arquivos já alterados nas rodadas anteriores. Graphify foi executado offline em server, com extração de código: 321 nós, 734 relações e 10 comunidades. O mapa representa o diagnóstico inicial. As migrações 001–012 foram revisadas e preservadas; testes de cardinalidade, isolamento e transações exercitam os relacionamentos em banco descartável.

## 2. Problemas comprovados e correções

| Severidade | Causa/impacto | Correção e risco de regressão |
|---|---|---|
| Alta | Turnos simultâneos da mesma conversa podiam disputar histórico e ações | Reserva persistente por conversa, recuperação de reserva expirada e liberação condicionada ao identificador do turno. Testes de concorrência e erro; sem repetir ferramentas na recuperação. |
| Alta | Salvamento do perfil regravava registros não alterados e podia perder precisão dos segundos estudados | Comparação dos registros, atualização apenas quando alterados e preservação de segundos/horários; teste de regressão com duração não múltipla de 60. |
| Média | Listagem de flashcards carregava material e histórico em excesso | Filtros e paginação SQL, projeção de metadados e agregações completas, índices e leitura consistente. Contratos de detalhe/revisão preservados. |
| Média | Histórico do laboratório trazia conteúdo desnecessário das questões para agregações | Projeção por conceito, paginação do histórico e Set para posições respondidas; totais calculados sobre o conjunto completo. |
| Média | Relatórios repetiam preparação custosa dos mesmos dados | Cache limitado de promessas, 32 entradas/30 segundos, por conta, revisão, filtros e dia em Brasília; falhas não permanecem no cache. |
| Média | Navegar para outra aba perdia o identificador da conversa no frontend | Persistência do UUID por conta/aba em sessionStorage e botão Nova conversa. Texto não é gravado nesse armazenamento. |
| Média | Falha inesperada do agente não retornava identificador da conversa | Erro seguro preserva contexto e estado de ações já aplicadas; reserva é liberada sem mascarar resultados confirmados. |
| Média | Respostas HTML de proxy/rede podiam gerar erros pouco claros | Helper HTTP compartilhado, mensagens seguras e nenhuma repetição automática de mutações. |
| Média | Lista de tarefas renderizava 500 linhas e milhares de nós | Paginação de 30 linhas após filtros; busca continua sobre todos os registros carregados. A API de snapshot permanece integral. |
| Média | Formulário de tarefa perdia o foco ao fechar | Restauração explícita ao elemento que abriu o diálogo, preservando foco inicial e Escape. |
| Média | Limitação de processos dos testes vinha depois dos arquivos | Opção --test-concurrency=2 posicionada antes dos arquivos em package.json. Sem alterações de dependências ou timeouts para obter aprovação. |
| Baixa | Textos secundários claros tinham contraste insuficiente no fundo principal | Cor #697086, contraste calculado de aproximadamente 4,64:1, antes 4,20:1 nesse par. Não equivale a certificação WCAG completa. |
| Baixa | Integrações planejadas apareciam como opções utilizáveis | Interface mostra apenas Classroom; contratos legados e dados preservados. |
| Baixa | Flashcards não possuíam título principal semântico | H1 consistente e controles de paginação nomeados. |
| Operacional | Escuta sempre em loopback impedia publicação pelo processo público | Host validado pela origem: desenvolvimento local em loopback, origem pública em 0.0.0.0. Não foi realizado deploy. |

Também foram unificadas a validação estrita de datas e o tratamento de requisições HTTP. Métricas internas limitadas registram operação, provedor, status e latência, sem textos, e-mails, tokens ou URLs. Não são uma medição exata de consumo faturado ou tokens. Referrer-Policy: no-referrer e supressão de logs das rotas de tokens reduzem exposição acidental. Diagnóstico do subprocesso Python registra código de falha, sem expor seu stderr.

## 3. Migração e preservação

Foi adicionada 013_operational_guards.sql: duas colunas para reserva de turno, CHECK de consistência e índices de cards/baralhos/revisões/mensagens. É aditiva; nenhuma migração anterior foi reescrita. Sua execução em bancos de ensaio parte da cadeia completa de migrações. Os testes não dependeram do banco real. Ao final, o localhost foi restaurado pelo fluxo normal de inicialização, que aplica a migração aditiva caso esteja pendente. Nenhum registro acadêmico de teste foi criado na conta local.

A comparação com o inventário inicial não encontrou arquivos removidos. Os arquivos de mail, Classroom, configuração/provedor do agente, lockfile e migrações 001–012 mantiveram seus hashes. As alterações locais anteriores foram preservadas. Arquivos de credenciais não foram copiados para os ensaios nem sobrescritos.

## 4. Desempenho antes/depois

Mesma máquina Windows, Node 26.8.1, PGlite em memória, execução sequencial, sem servidor de desenvolvimento competindo com os ensaios. Tempos em ms; medianas dos poucos samples registrados, não percentis de produção. Pico RSS após otimizações: aproximadamente 713 MiB, incluindo o banco embarcado.

| Cenário | Antes | Depois | Observação |
|---|---:|---:|---|
| Salvar apenas perfil com 1.000 tarefas | 412,89 | 76,78 | 1.012 → 13 consultas |
| Listar 500 cards | 829,79 | 81,32 | 641.069 → 27.404 bytes |
| Listar 5.000 cards | 7.634,32 | 571,50 | 661.913 → 30.271 bytes |
| Listar 10.000 cards | 17.078,58 | 1.978,62 | 661.968 → 30.275 bytes; cerca de 88% menos tempo |
| Laboratório, 100 avaliações | 193,63 | 95,64 | 42.284 → 13.993 bytes |
| Laboratório, 1.000 avaliações | 13.893,22 | 746,51 | 42.294 → 14.006 bytes; estatísticas preservadas |
| Analytics, 10.000 tarefas/20.000 sessões | 4.250,47 | 1.595,87 | Depois: primeira leitura 3.183,78; repetida 7,96; mediana de duas leituras |
| Ler snapshot de 100 tarefas | 17,35 | 22,29 | Consistência transacional tem custo; não é ganho universal |
| Ler snapshot de 1.000 tarefas | 32,06 | 61,28 | Resposta integral preservada |
| Ler snapshot de 10.000 tarefas | 347,93 | 404,30 | 4.569.274 bytes; limite arquitetural remanescente |
| Chat simulado com 10.000 mensagens | 13,15 | 27,93 | Custo adicional das proteções; sem latência real de modelo |

Foram incluídos 6.667 registros sintéticos de revisão. Os planos EXPLAIN ANALYZE constam dos JSONs brutos. O salvamento de um snapshot com 10.000 tarefas continua rejeitado antes de qualquer escrita: limite de 5.000 tarefas e corpo de 2 MB preservados. O serviço direto retorna 400 por schema; HTTP pode retornar 413 pelo corpo. Esse cenário não foi aprovado como suporte a gravação de 10.000 tarefas. Recomenda-se evolução futura para operações incrementais, sem aumentar os limites nesta rodada.

Evidências: .local/round7-perf-before-quiet.json, .local/round7-perf-after-quiet.json e respectivos logs. Não extrapolar PGlite/concorrência 1 para capacidade de PostgreSQL remoto ou múltiplos usuários.

## 5. Testes e interface

A base anterior possuía 264 testes. Foram adicionados 13 testes direcionados: concorrência/recuperação e limites do agente, paginação/isolamento, precisão das sessões, datas, sanitização HTTP, cache, telemetria, origem e conjuntos pedagógicos. A primeira execução encontrou uma falha nova no erro inesperado do agente; foi corrigida e o teste direcionado passou.

| Verificação final | Resultado |
|---|---|
| npm run typecheck | Aprovado |
| npm test -- --test-concurrency=2 | 277 aprovados; zero falhas, pulados ou cancelados |
| npm run lint | Aprovado, max-warnings=0 |
| npm run build | Aprovado em cópia isolada; SecurityFatalError não reproduzido nesta execução |
| npm audit | Zero vulnerabilidades reportadas |
| Smoke de produção | Aprovado: 25 páginas, 2 casos de rota ausente, 2 assets; autenticação, CRUD, histórico, notificações, analytics, Classroom simulado, agente simulado, CSRF e logout |
| Regressões acadêmicas no navegador | 49 verificações: quiz 13, assistido 10, simulado 12, flashcards 14; todas aprovadas |
| Homologação geral no navegador | 11 verificações, incluindo 80 combinações de rota/largura, todas aprovadas; zero controles sem nome ou erros JavaScript não tratados |
| Scripts de navegador alterados | Lint direcionado aprovado após o ajuste dos interceptadores e espera de foco |
| Preservação | Zero arquivos removidos; módulos protegidos e migrações anteriores idênticos à referência; HEAD 1a82451 |

Os testes antigos foram preservados. O interceptador de erro do E2E de quiz foi atualizado para aceitar a query de paginação; a verificação de foco aguarda o retorno efetivo após a desmontagem do diálogo, em vez de ler o foco antes da conclusão. Nenhuma asserção funcional foi removida. A fixture recebeu encerramento explícito por IPC para cada suíte descartar seu banco e processo filho.

As 500 tarefas passaram de 500 linhas/12.285 nós DOM para 30 linhas/1.009 nós, mantendo busca e paginação. Evidências visuais da execução aprovada:

- [Tarefas no desktop](../.local/audits/round7-homologation/desktop-tarefas.png)
- [Revisão no desktop](../.local/audits/round7-homologation/desktop-revisao.png)
- [Classroom no desktop](../.local/audits/round7-homologation/desktop-classroom.png)
- [Revisão no celular, tema escuro](../.local/audits/round7-homologation/mobile-revisao-escuro.png)
- [Classroom no celular, tema escuro](../.local/audits/round7-homologation/mobile-classroom-escuro.png)

Resultados brutos: .local/round7-results.json, .local/round7-browser-results.json, .local/round7-runtime-smoke.log e .local/round7-preservation.json. Imagens failure.png eventualmente presentes registram tentativas de diagnóstico anteriores; não representam a execução final aprovada.

O teste visual usa banco em memória e conta fictícia, com 500 tarefas, 500 cards e 60 sessões. Verifica filtros, paginação, contexto do agente, falha de rede, temas, foco, nomes acessíveis e telas em 320, 390, 768 e 1440 px. Os fluxos anteriores de quiz/assistente/simulado/flashcards são repetidos separadamente com banco recém-criado, sem dados de carga. Evidências locais em .local/audits/round7-homologation e pastas de regressão desta rodada.

## 6. Qualidade pedagógica

Conjuntos de referência controlados cobrem aritmética e SQL executado em banco de teste, com respostas esperadas explícitas. A validação estrutural permite demonstrar que um JSON bem formado ainda pode trazer gabarito factualmente errado. Isso exige revisão do conteúdo e referência confiável; não há alegação de precisão acadêmica do Gemini baseada em mocks. Não foram alterados gabaritos já persistidos, notas ou estatísticas por decisão da IA. A correção e os intervalos de revisão continuam determinísticos.

## 7. Integrações e homologação externa

| Integração | Resultado local | Pendente externo |
|---|---|---|
| Resend/SMTP | Contratos, erros e tokens exercitados por testes simulados, implementação preservada | Envio autorizado, remetente/domínio, entrega, spam e limites da conta |
| Classroom | OAuth/importação/entregas/deduplicação/preservação local sob mocks, serviço preservado | Consentimento real, autorização institucional, seleção/importação/refresh/revogação com conta de homologação |
| Gemini/Groq/OpenRouter | Seleção explícita e Gemini padrão preservados; erros/Tools/histórico sob mocks | Chamada autorizada, modelo, quota, latência e avaliação factual real |

Nenhum teste desta rodada enviou e-mail real, usou chaves reais ou chamou APIs pagas. A tela deve diferenciar servidor não configurado de conexão autorizada por conta. Hospedagem correta permite acesso centralizado por diferentes dispositivos, sem configurar secrets em cada cliente.

## 8. Riscos e próximos passos

- Não houve certificação de produção: faltam PostgreSQL remoto, Linux, integrações reais, restauração de backup e ensaio multiusuário.
- Reservas de conversa são persistentes; rate limiting e cache ainda são locais ao processo. Múltiplas réplicas exigem limites compartilhados e coordenação de migrações.
- Reserva expirada é recuperada após 15 minutos. Eventos extremos que excedam esse prazo e efeitos externos não transacionais exigem atenção operacional; não há promessa de exactly-once universal.
- Snapshot acadêmico integral e paginação offset conservam limites documentados; páginas podem mudar entre requisições quando novos dados chegam.
- Cache tem validade curta e invalidação por revisão/filtros/conta/dia; não usar para decisões críticas fora dessas garantias.
- Falta definir e exercitar política de retenção/eliminação de conversas e backups em ambiente real.
- Os testes acessíveis cobrem semântica/teclado/layout e contraste pontual, sem substituir leitor de tela e auditoria WCAG completa.
- Avisos de raiz de workspace com múltiplos lockfiles surgem apenas na cópia de teste aninhada; não foram removidos lockfiles de projetos existentes.

## 9. Checklist operacional

Consultar [prontidão operacional](prontidao-operacional-rodada-7-2026-10-29.md): HTTPS/origem pública; PostgreSQL persistente; restore de backup; secrets centralizados; Resend e SMTP; OAuth público; Gemini; observabilidade sem conteúdo sensível; limites compartilhados; retenção; rollback sem apagar dados ou remover colunas novas. Nenhum serviço pago foi criado ou configurado.

## 10. Arquivos desta rodada

A lista abaixo considera o inventário de início da Rodada 7, e não todo o diff acumulado das Rodadas 1–6:

- app/flashcards.css
- components/edutrack/flashcards-view.tsx
- components/edutrack/lab-api.ts
- components/edutrack/lab-view.tsx
- lib/flashcard-types.ts
- lib/lab-types.ts
- scripts/lab-fixture.mjs
- scripts/test-lab-browser.mjs
- server/flashcards.mjs
- server/study-lab.mjs
- app/globals.css
- components/edutrack/account-store.ts
- components/edutrack/agent-view.tsx
- components/edutrack/forms.tsx
- components/edutrack/integrations-view.tsx
- components/edutrack/views.tsx
- lib/edutrack-schema.ts
- next.config.ts
- package.json
- server/agent-orchestrator.mjs
- server/api.mjs
- server/data.mjs
- server/database.mjs
- server/report-analytics.mjs
- server/start.mjs
- components/edutrack/pagination.tsx
- database/013_operational_guards.sql
- docs/auditoria-geral-rodada-7-2026-10-29.md
- docs/prontidao-operacional-rodada-7-2026-10-29.md
- lib/calendar-date.mjs
- lib/http-json.mjs
- scripts/test-homologation-browser.mjs
- server/flashcard-listing.mjs
- server/report-cache.mjs
- server/runtime-host.mjs
- server/runtime-metrics.mjs
- tests/pedagogy-reference.test.mjs
- tests/round7-agent-guards.test.mjs
- tests/round7-integrity.test.mjs

Artefatos brutos permanecem em .local e não foram publicados. O histórico Git permaneceu no mesmo HEAD durante a auditoria.
