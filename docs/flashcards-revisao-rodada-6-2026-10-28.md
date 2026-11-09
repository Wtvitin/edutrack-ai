# EduTrack AI — Rodada 6: Flashcards e revisão espaçada

Data: 28/10/2026. Implementação local, sem commit, push ou deploy.

## Diagnóstico anterior às alterações

O Git já continha alterações das rodadas anteriores em autenticação/e-mail, provedores, segurança, navegação e Laboratório. Foi criado um inventário SHA-256 inicial; a conferência final considera 334 arquivos de projeto, excluindo cache npm e artefatos regenerados pelo TypeScript/Next, sem ler credenciais. Nenhuma alteração anterior foi revertida.

As migrações 009, 010 e 011 criam e estendem `learning_activities` e `learning_answers`: quizzes, preparação assistida, feedback e simulados. Essas entidades preservam gabaritos e resultados determinísticos. Flashcards exigem conteúdo editável e autoavaliações repetidas; gravar isso como respostas de prova misturaria conceitos distintos. A implementação integra o mesmo Laboratório, cliente HTTP, adaptadores e identidade, com entidades próprias para o agendamento.

Foi consultado o mapa Graphify existente em `.local/round5-architecture/graphify-out/graph.json`, apenas em memória, sem reconstruir o grafo ou usar extração semântica externa. Foram localizados `createStudyLab`, `createAssistedLab`, `collectLabContext` e `createAgentToolRegistry`, com 43 relações incidentes no mapa anterior. O mapa não inclui os novos arquivos desta rodada; as relações novas foram verificadas pelo código e pelos testes.

A auditoria dos painéis identificou: relatórios com fonte Python/Pandas e filtros já funcionais; meta semanal global corretamente identificada; painel do Laboratório omitindo questões em branco dos pontos de atenção; cartões de disciplina contando tarefas canceladas como pendentes; formatos de gráfico do agente sem representação própria sendo desenhados como linha; e acesso insuficiente aos valores dos gráficos sem mouse. As correções ficaram restritas a esses pontos e à integração da revisão.

## Implementação

### Flashcards

- Preparação por pedido, disciplina, texto opcional e conceitos errados ou não respondidos de avaliações concluídas. Recomendações existentes encaminham à avaliação de origem.
- Baralhos de 5, 10, 15 ou 20 cartões. Preparação e geração são operações separadas; a segunda exige confirmação explícita. GET, reload e abertura de abas não geram cartões.
- Conteúdo validado integralmente antes da publicação: quantidade, contrato estrito, campos limitados, perguntas distintas por normalização literal, texto simples, origem e referências literais no material quando declaradas.
- Cada cartão mantém pergunta, explicação, conceito, disciplina/assunto, origem, citação opcional e versão. Os conteúdos da IA e as edições do estudante são identificados como não verificados automaticamente.
- A geração não recebe os gabaritos anteriores: somente conceitos, enunciados e IDs de evidência. Esses registros delimitam o assunto; não são tratados como fonte factual confirmada. Material acadêmico continua sendo dado não confiável para o modelo.
- Revelar/ocultar, navegação, embaralhamento apenas da ordem da sessão, avaliação de lembrança, edição, arquivamento reversível e histórico. Nenhum endpoint permite editar diretamente data, etapa ou contadores do agendamento.
- A edição cria nova versão, retira a citação factual anterior, reinicia etapa/data e mantém revisões anteriores. Cada revisão guarda uma fotografia do conteúdo e conceito avaliados naquela versão.

### Sessões, concorrência e auditoria

A sessão guarda IDs ordenados, posição, revisões e estado. Há uma sessão ativa por conta; o estudante pode retomá-la ou encerrá-la explicitamente. Ela pode abranger até 100 cartões. Um cartão é avaliado no máximo uma vez por sessão. A autoavaliação salva e avança ao próximo cartão não avaliado e não arquivado.

A entrega de uma autoavaliação usa ID de requisição, versão da sessão e versão do cartão, com transação e bloqueio de linhas. Repetir o mesmo pedido não incrementa contadores; pedidos incompatíveis e abas desatualizadas recebem conflito. Não há reexecução de geração nem de ferramentas após um reload. Pedidos pendentes expirados são identificados sem nova chamada automática.

As relações usam chaves compostas por usuário, e todas as operações validam ownership. Eventos de preparação, geração, edição, arquivamento, avaliação e encerramento são persistidos. Edições não reescrevem avaliações anteriores. Se uma disciplina for removida pelo fluxo já existente, seu vínculo opcional é limpo e o nome de referência do baralho é preservado. O módulo não adiciona exclusões acadêmicas.

### Algoritmo determinístico: EduTrack Boxes v1

Algoritmo simplificado de etapas, próprio e identificado como tal; não é SM-2 nem FSRS. Foi escolhido por ser auditável, previsível e não exigir parâmetros de retenção que o projeto ainda não tem dados para estimar.

| Autoavaliação | Mudança de etapa | Próximo intervalo |
|---|---|---|
| Esqueci | Volta a 0 | 10 minutos |
| Difícil | Recua uma etapa, mínimo 0 | Intervalo da etapa, mínimo 1 hora |
| Bom | Avança uma etapa, máximo 8 | Intervalo da etapa |
| Fácil | Avança duas etapas, máximo 8 | Intervalo da etapa |

Etapas 1 a 8: 1, 3, 7, 14, 30, 60, 120 e 180 dias. O servidor utiliza seu relógio para calcular `due_at`; o navegador não fornece o próximo prazo. Cada evento registra algoritmo, intervalo, etapas anterior/nova, horário e versão. O agendamento parte do momento da avaliação; não há penalização extra por atraso nem previsão de retenção.

### Agente

`prepare_study_flashcards` prepara somente um rascunho autorizado e encaminha para o Laboratório. `get_review_schedule` consulta contagens persistidas e até dez conceitos disponíveis, sem retornar todas as explicações ou materiais ao modelo. Não existem Tools de avaliação automática, edição de respostas de prova ou alteração de notas. O orquestrador conserva histórico, registro de ações e seleção explícita dos provedores. Gemini continua como padrão, sem fallback implícito.

Há limite persistido de quatro preparações de baralhos em 15 minutos e 12 em 24 horas, incluindo falhas e rascunhos. As modalidades mantêm suas cotas separadas. A API também limita preparações, gerações, edição e operações de sessão; os limites de geração usam dados persistidos, enquanto a proteção HTTP por IP é local ao processo existente.

## Dashboards, gráficos e navegação

- Área “Flashcards e revisão” no Laboratório, ligada ao dashboard, agente e recomendações.
- Indicadores clicáveis de hoje, atrasadas, novos, revisados e próximos; filtro de disciplina e histórico de 7/30/90 dias; fila, distribuição por disciplina, revisões por dia e histórico com acesso à sessão.
- As categorias de cartões se sobrepõem intencionalmente; datas/categorias refletem o estado atual, enquanto a evolução considera o período selecionado. O fuso usado é Brasília. “Disponíveis agora” compara o horário exato; “previstas para hoje” inclui também horários posteriores de hoje.
- Os indicadores consideram todos os registros autorizados, mesmo quando as listas são limitadas. Contagens de cartões não são apresentadas como percentual de retenção.
- O Laboratório inclui erros e questões em branco separadamente nos pontos de atenção; a taxa de acerto continua usando o total das avaliações concluídas.
- Cartões de disciplinas deixam de contar tarefas canceladas como pendências ou no denominador de progresso.
- Relatórios mantêm cálculos em Python/Pandas, unidades de minutos, filtros e legendas. Uma tabela acessível dos valores permite abrir o detalhamento por dia usando teclado. O eixo de minutos usa marcações inteiras.
- Gráficos do agente incluem tabela de valores, estado vazio e animações desativadas. Formatos sem representação visual própria usam tabela, em vez de uma linha com significado incorreto.
- A navegação permanece dentro da aplicação. Parâmetros de URL permitem retomar baralhos, avaliações e sessões, inclusive a passagem de recomendações para cartões.
- Componentes existentes de diálogo cuidam de foco, Escape e confirmação. O verso não usa controles clicáveis sem rótulo; a resposta é revelada por botão. A transição curta respeita preferência de movimento reduzido. Estilos usam as variáveis dos temas claro/escuro.

## Arquivos e API

Novos arquivos:

- `database/012_flashcards.sql`: cinco tabelas, índices e restrições; migração aditiva.
- `lib/flashcard-schemas.mjs`: contratos, filtros, algoritmo e schema de geração.
- `lib/flashcard-types.ts`: contratos de interface.
- `server/flashcards.mjs`: conteúdo, geração, ownership, sessões, revisões, indicadores e auditoria.
- `components/edutrack/flashcards-view.tsx` e `app/flashcards.css`.
- `tests/flashcards.test.mjs`, `tests/flashcards-api.test.mjs`, `scripts/test-flashcards-browser.mjs`.

Integrações alteradas: `server/database.mjs`, `server/api.mjs`, registro/contratos/instruções do agente, tipos/interface do agente, modalidades e resumo do Laboratório, feedback, dashboard, gráficos/relatórios, cartões de disciplina e importação dos estilos. Fixtures foram estendidas com conteúdo simulado. O teste antigo de rollback 009 foi adaptado: executar a remoção do Laboratório completo passou a violar sua dependência com os baralhos; agora a verificação mantém o rollback manual sem executá-lo e confere migrações/referências e preservação de registros. Nenhuma migração anterior ou script de rollback foi modificado.

Arquivos anteriores alterados nesta rodada:

- `app/layout.tsx`
- `components/edutrack/agent-api.ts`
- `components/edutrack/agent-chart.tsx`
- `components/edutrack/agent-view.tsx`
- `components/edutrack/app.tsx`
- `components/edutrack/lab-feedback.tsx`
- `components/edutrack/lab-view.tsx`
- `components/edutrack/report-panel.tsx`
- `components/edutrack/study-dashboard.tsx`
- `lib/agent-response-schemas.mjs`
- `lib/lab-schemas.mjs`
- `lib/lab-types.ts`
- `server/agent-orchestrator.mjs`
- `server/agent-schemas.mjs`
- `server/agent-tools.mjs`
- `server/api.mjs`
- `server/database.mjs`
- `server/study-lab.mjs`
- `tests/fixtures/lab.mjs`
- `tests/study-lab.test.mjs`

Rotas principais: `/api/lab/flashcards` (painel/preparação), `/api/lab/flashcards/:id` (baralho), `/:id/generate` (confirmação), `/api/lab/flashcards/cards/:id/edit|archive` e `/api/lab/flashcard-sessions` com operações `rate`, `move` e `close`. Rotas de escrita exigem sessão, origem válida e JSON; erros públicos são controlados.

## Validação

Todas as validações funcionais usaram banco isolado, credenciais fictícias e modelos/transportes simulados. Não houve chamada paga nem alteração de arquivos de credenciais. A cópia validada está em `.local/lab-round6-gdBrcr/`, sem os arquivos `.env` e sem os dados da conta real.

| Verificação | Resultado final |
|---|---|
| `npm run typecheck` | Aprovado; repetido no código final |
| `npm test -- --test-concurrency=2` | 264 testes aprovados, zero falhas e ignorados |
| `npm run lint` | Aprovado, zero avisos; repetido no código final |
| `npm run build` | Aprovado na primeira compilação desta rodada |
| `npm audit` | Zero vulnerabilidades |
| Flashcards no navegador | 14 cenários aprovados |
| Regressão de quizzes manuais | 13 cenários aprovados |
| Regressão de quizzes assistidos | 10 cenários aprovados |
| Regressão de simulados | 12 cenários aprovados |
| Smoke integrado com Next em produção | 25 páginas, duas rotas inexistentes, dois assets e API aprovados |

São 34 testes novos do módulo/contratos/transportes/relacionamentos, além da adaptação do teste de migração antigo. Exercitam regras de agenda, limites, ausência de geração em GET, confirmação, estrutura inválida, transações, edição, snapshots do histórico, arquivamento, idempotência, concorrência, ownership, isolamento, retomada e os três adaptadores com transporte simulado. Os 49 cenários de navegador não registraram erros não tratados; incluem navegação sem recarregar o documento, vínculo das recomendações, teclado, recuperação e larguras de 320, 390 e 768 pixels.

Na primeira execução completa, o teste destrutivo legado foi bloqueado pela nova chave estrangeira; ele foi atualizado para verificar preservação, sem alterar a migração anterior ou afrouxar restrições. Uma repetição concorrente com o navegador atingiu o timeout de 20 segundos do teste Python/Pandas; também ocorreu um reset de conexão no fixture. A execução final sequencial passou com os limites existentes, sem ampliar timeouts nem adicionar retries que escondam falhas. O relatório de testes completo ficou em `.local/round6-tests-sequential.log`; as tentativas anteriores foram mantidas para diagnóstico.

O build apresentou apenas avisos de inferência do diretório raiz devido aos lockfiles da cópia aninhada e de depreciação de `module.register()` no Node 26. Não houve `SecurityFatalError`, desativação de validação ou atualização de dependências para contornar verificações.

A conferência final por hashes preservou 314 arquivos anteriores e identificou exatamente 20 pontos de integração alterados; não há divergências de código entre a pasta principal e a cópia testada. Migrações 009–011, Classroom, e-mails, adaptadores/configuração dos provedores e arquivos de dependências mantêm os hashes anteriores. Evidência: `.local/round6-preservation.json`. Arquivos regenerados `next-env.d.ts` e `tsconfig.tsbuildinfo` não são usados nessa comparação.

O localhost principal foi reiniciado em [http://localhost:4175/laboratorio?aba=flashcards](http://localhost:4175/laboratorio?aba=flashcards), com aplicação da migração incremental 012 conforme a autorização anterior de inicialização com os dados locais. As únicas verificações nessa instância foram GET de saúde/página, ambas HTTP 200. Nenhum simulado, quiz ou cartão de teste foi criado na conta real.

Evidências:

- `.local/round6-results.json` e `.local/round6-validation-pVIy1S/`: primeira rodada dos comandos.
- `.local/round6-typecheck-final.log`, `.local/round6-lint-final.log` e `.local/round6-tests-sequential.log`: validações finais.
- `.local/round6-runtime-smoke.log`: autenticação com confirmação por e-mail local, CRUD, histórico, notificações, analytics, status do Classroom, agente simulado, CSRF e logout.
- `.local/audits/flashcards-2026-10-28/results.json`, `round6-quiz-regression/results.json`, `round6-assisted-regression/results.json` e `round6-exam-regression/results.json`: resultados dos quatro fluxos de navegador.

Capturas com dados fictícios:

- [Baralho e identificação das fontes no desktop](../.local/audits/flashcards-2026-10-28/desktop-baralho-fontes.png).
- [Cartão revelado no desktop](../.local/audits/flashcards-2026-10-28/desktop-cartao-revelado.png).
- [Painel de revisão no desktop](../.local/audits/flashcards-2026-10-28/desktop-painel-revisao.png).
- [Painel no celular e modo escuro](../.local/audits/flashcards-2026-10-28/mobile-painel-escuro.png).
- [Sessão no celular e modo escuro](../.local/audits/flashcards-2026-10-28/mobile-cartao-escuro.png).

As capturas desktop e mobile foram inspecionadas visualmente. O teste automatizado verifica ausência de rolagem horizontal, controles por teclado e rótulos; isso não substitui uma auditoria completa com leitores de tela. As imagens em `.local` ficam fora do Git.

## Limitações e próximos passos

- A validação estrutural e as citações literais não provam correção factual, relevância didática ou ausência de duplicação semântica. O estudante deve poder conferir e corrigir conteúdos.
- Autoavaliações podem ser imprecisas; os intervalos são uma regra de organização, sem alegação de medir memória ou domínio.
- Não há atualização por push: a fila é consultada ao abrir, filtrar, salvar e atualizar o painel. Datas podem exigir atualização em abas mantidas abertas por muito tempo.
- Listas limitadas a 100 baralhos, 500 cartões e 100 revisões; sessões limitadas a 100 cartões. Indicadores incluem todos os registros do filtro; recomenda-se paginação e agregações SQL para contas com histórico muito grande. A evolução é apresentada como tabela de frequências, sem curva fictícia de retenção.
- Uma sessão por conta simplifica conflitos entre abas e dispositivos. Para mudar o grupo estudado, retome ou encerre a sessão ativa. O encerramento não altera prazos de cartões não avaliados.
- A escolha automática de disciplina usa o contexto disponível; pedidos livres podem exigir seleção manual para evitar uma associação pouco relevante. Não há leitura automática de anexos externos.
- Provedores reais e PostgreSQL remoto não foram acionados nos testes. A persistência exercitada usa PGlite e as mesmas migrações PostgreSQL.
- Próxima rodada: paginação e índices medidos com dados sintéticos de volume; avaliações editoriais de conteúdo e de acessibilidade com leitores de tela; métricas de uso suficientes antes de considerar FSRS/SM-2; aprimorar a seleção explícita de conceitos nas recomendações. Manter cálculos no sistema e a IA como apoio interpretativo.
