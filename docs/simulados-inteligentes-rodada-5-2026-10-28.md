# EduTrack AI — Rodada 5: Simulados Inteligentes

## Arquitetura

O simulado é uma modalidade de `learning_activities`, com `mode='exam'`, no mesmo Laboratório dos quizzes. Usa `learning_answers`, autenticação, proteções de origem, SQL parametrizado, contexto acadêmico autorizado, adaptadores de IA, validação Zod, embaralhamento, histórico e análise por evidências já existentes. Não foi criado outro sistema de avaliações ou outra integração educacional.

A auditoria prévia examinou as migrações 009/010, os serviços `study-lab`, `lab-assisted` e `lab-model`, os contratos, as Tools e os componentes do Laboratório. O mapa local de código do Graphify foi extraído sem LLM ou acesso externo. A migração 011 e o serviço `lab-exams` estendem essas estruturas.

## Fluxo e configuração

Pelo botão **Novo simulado** ou pelo agente, peça: “Prepare um simulado de 30 questões sobre a matéria que mais preciso revisar.” O sistema prepara uma configuração sem gerar questões ou chamar o modelo nessa preparação direta. No fluxo pelo agente, a conversa usa o provedor existente, mas a Tool apenas prepara o rascunho.

Padrão: disciplina sugerida automaticamente, 30 questões, dificuldade mista, `durationMinutes=0`, marcação para revisão habilitada, quatro alternativas e correção somente após entregar. É possível personalizar a disciplina, assunto, quantidade entre 10/20/30, dificuldade, alternativas entre quatro/cinco, marcação e duração antes de confirmar.

A sugestão usa apenas os dados da conta: avaliações concluídas, percentual e quantidade de questões sem acerto, atividades importantes e pendências. Uma matéria solicitada explicitamente é respeitada. Sem histórico suficiente, a justificativa explica que se trata de uma sugestão inicial, sem inventar desempenho. A configuração mostra o motivo da escolha e pode ser modificada.

**A geração depende de confirmação explícita no diálogo.** Abrir o Laboratório, recuperar um rascunho ou usar o agente para preparar um simulado não dispara essa geração. O endpoint exige `confirmed:true`.

## Geração

São três lotes sequenciais de dez questões no simulado padrão. Cada lote precisa satisfazer o contrato, possuir conceitos, alternativas distintas, um índice correto válido e justificativa consistente com o gabarito. A distribuição é conferida por lote para alcançar exatamente dez questões fáceis, dez intermediárias e dez difíceis ao final.

Enunciados anteriores são informados ao gerador e duplicações literais normalizadas são rejeitadas entre lotes. As perguntas usam o contexto limitado da disciplina escolhida e até quatro atividades, sem dados de outra conta. O mesmo validador verifica citações literais e a sinalização de conteúdo complementar.

Os lotes intermediários ficam privados no backend. Somente a prova inteira validada é publicada em `questions_json`. Uma falha parcial gera estado de falha, sem disponibilizar prova incompleta. Não há regeneração automática ou reparo com chamadas adicionais; novas tentativas precisam ser iniciadas pelo estudante. Os retries limitados do adaptador de provedor permanecem como antes.

Confirmações repetidas recuperam a mesma atividade. Configurações divergentes depois de confirmadas são rejeitadas. Locks e as cotas persistidas existentes evitam gerações concorrentes. O padrão de 30 perguntas normalmente usa três chamadas de geração; o custo depende do provedor e de eventuais tentativas transitórias limitadas. Gemini continua padrão, sem fallback implícito.

## Prova e persistência

A interface inclui painel das questões respondidas, pendentes e marcadas, progresso, navegação, Anterior/Próxima e um resumo antes da entrega. A marcação é independente de haver resposta.

Respostas são salvas ao selecionar e podem ser alteradas antes de entregar. Uma revisão numérica por resposta impede que outra aba sobrescreva silenciosamente uma escolha mais recente. Há uma única resposta por questão. Marcações têm revisão própria e são mescladas sob lock, sem duplicação.

No modo sem limite, só há tempo decorrido; não existe contagem regressiva. O início é persistido no servidor quando a prova completa fica disponível. O tempo inclui o período fora da página. Atualizar, fechar a aba e voltar não reinicia a contagem nem gera outra prova.

Se o estudante escolher duração limitada, o servidor bloqueia alterações após expirar e limita a duração pontuada ao prazo. Ainda é necessária a entrega explícita das respostas salvas. O agente não pode entregar, responder, marcar questões ou modificar resultados.

Durante a prova não são enviados gabarito, justificativas, correção individual ou conceitos que possam funcionar como pistas de resposta. Citações específicas das questões também ficam ocultas até a entrega. O endpoint de finalizar quiz não pode ser usado para contornar a confirmação do simulado.

## Entrega e resultados

O resumo informa respondidas, não respondidas e marcadas, permite voltar às questões e exige **Confirmar entrega**. Questões pendentes são permitidas, com aviso explícito de que não pontuarão.

O backend calcula e persiste total, acertos, erros, omissões, percentual, nota de 0 a 10, tempo utilizado e desempenho por conceito. Erro significa alternativa escolhida incorretamente; omissão é apresentada separadamente. Percentual e nota usam todas as questões como denominador, inclusive as não respondidas.

A entrega é transacional e idempotente. Após concluída, respostas, marcações e resultados ficam protegidos contra alteração. A correção comentada mostra todas as questões, incluindo as não respondidas. A análise de revisão existente pode interpretar erros e omissões, mas não calcula nem altera a nota.

O dashboard do Laboratório reúne quizzes e simulados. Os percentuais consideram o total de questões das avaliações concluídas, sem excluir omissões do denominador. O histórico e a evolução por disciplina continuam usando os dados persistidos.

## Migração e arquivos

`database/011_study_exams.sql` estende as duas tabelas existentes: permite modalidade exam, notas em acertos até 30 e posições de questões até 29; acrescenta revisões de respostas, marcações, prazo opcional e resultados finais. Não exclui tabelas, respostas ou questões, nem modifica migrações anteriores. As restrições dos quizzes continuam nos respectivos contratos e operações.

Não foi fornecida reversão automática: reduzir novamente os limites antigos com simulados já realizados exigiria uma estratégia de compatibilidade/exportação revisada, e não a exclusão de provas reais.

Novos arquivos:

- `lib/exam-schemas.mjs`: contratos e distribuição de dificuldade.
- `server/lab-exams.mjs`: seleção, geração em lotes, respostas, marcações, entrega e cálculo determinístico.
- `components/edutrack/exam-view.tsx`: configuração, prova, resumo e correção.
- `components/edutrack/lab-api.ts`: cliente compartilhado de requisições do Laboratório.
- `app/study-exams.css`: estilos responsivos e temas.
- `tests/study-exams.test.mjs` e `tests/study-exams-api.test.mjs`.
- `scripts/test-exams-browser.mjs`.

Integrações alteradas: inicialização das migrações, serviço/API do Laboratório, contratos e registro da Tool `prepare_study_exam`, instruções de encaminhamento do agente, interfaces e tipos do Laboratório, importação dos estilos e fixtures de teste. Classroom, Resend/SMTP, dependências e arquivos de credenciais permanecem fora das alterações.

## Validação

Os testes usam bancos em memória, sessões fictícias e provedores simulados em cópia isolada, sem `.env` ou banco real. Não há chamadas pagas. A instalação de dependências já corrigida foi reutilizada; nenhuma dependência nova foi necessária.

Os 25 testes novos incluem seleção justificada, 30 perguntas, distribuição 10/10/10, personalização, ausência de geração sem confirmação, falhas parciais, duplicação entre lotes, idempotência, concorrência, recuperação, marcações, ownership, proteção do gabarito, entrega com pendências, integridade dos resultados e limite de tempo opcional. A suíte completa passou com **230 testes**, sem falhas ou testes ignorados, usando `npm test -- --test-concurrency=2` para manter previsível o uso de recursos pelos testes de Python/Pandas.

`npm run typecheck`, `npm run lint` e `npm run build` passaram. `npm audit` retornou zero vulnerabilidades. A execução completa e os códigos de saída estão em `.local/round5-results.json`; os logs estão em `.local/round5-validation-08wMA8/`.

O smoke test integrado em modo de produção também passou: 25 páginas, duas rotas inexistentes e dois assets, além de autenticação com confirmação por e-mail local de teste, CRUD, histórico, notificações, analytics, status do Classroom, agente simulado, CSRF e logout. Evidência: `.local/round5-runtime-smoke.log`. Todas essas operações usaram dados fictícios em banco isolado.

O localhost principal foi reiniciado em `http://localhost:4175` para carregar o novo módulo e aplicar a migração incremental 011, conforme a autorização anterior de inicialização com os dados locais. Nenhum simulado de teste foi criado na conta real e nenhuma chamada ao modelo real foi usada na validação.

Passaram **12 cenários E2E novos do simulado**, incluindo agente, justificativa da seleção, confirmação anterior à geração, distribuição 10/10/10, ausência de contagem regressiva no modo ilimitado, salvamento/alteração, retomada, marcações, conflito entre abas, resumo com pendências, entrega explícita, resultado determinístico e imutável, personalização e layouts de 320, 390 e 768 pixels. Nenhum erro não tratado foi capturado no navegador.

Também passaram os **23 cenários E2E anteriores** de quizzes manuais e assistidos. A conferência por hashes confirmou 1.599 arquivos anteriores preservados fora dos 15 pontos de integração previstos, sem diferenças entre o código validado na cópia isolada e os arquivos da pasta principal. Evidência: `.local/round5-preservation-results.json`.

Capturas com dados simulados pelo fixture:

- [Configuração padrão e justificativa no desktop](../.local/audits/simulados-2026-10-28/desktop-configuracao-padrao.png).
- [Prova em andamento, sem correção](../.local/audits/simulados-2026-10-28/desktop-prova-sem-correcao.png).
- [Resumo antes da entrega](../.local/audits/simulados-2026-10-28/desktop-resumo-entrega.png).
- [Resultado e correção comentada](../.local/audits/simulados-2026-10-28/desktop-resultado-comentado.png).
- [Resultado mobile no tema escuro](../.local/audits/simulados-2026-10-28/mobile-resultado-escuro.png).
- [Personalização no mobile](../.local/audits/simulados-2026-10-28/mobile-configuracao-personalizada.png).

Os resultados E2E estão em `.local/audits/simulados-2026-10-28/results.json`, `.local/audits/round5-quiz-regression/results.json` e `.local/audits/round5-assisted-regression/results.json`. As capturas ficam em `.local`, ignorada pelo Git. O aviso de múltiplos lockfiles no build decorre da cópia isolada aninhada; a configuração do projeto não foi alterada para escondê-lo.

## Limitações e Rodada 6

- O sistema verifica estrutura, quantidade, distribuição, consistência do gabarito e referência literal. Não comprova veracidade factual nem elimina toda duplicação semântica. A revisão humana continua recomendada.
- Gerar 30 questões pode exceder a cota ou disponibilidade do provedor. Uma prova parcial não é disponibilizada. Retomar somente os lotes faltantes exige um fluxo explícito futuro; não há cobrança de regeneração disparada por simples reload.
- O contexto usa títulos e descrições disponíveis na conta; não lê automaticamente anexos externos.
- Trata-se de uma experiência de estudo, sem fiscalização ou garantia contra consultas a materiais externos.
- O tempo registrado é decorrido, não uma medida de atenção ativa.
- Os testes de persistência usam PGlite, o PostgreSQL local suportado pelo projeto; não foi conectado banco remoto real.
- Para a Rodada 6, recomenda-se revisão espaçada ou um banco de questões revisadas, apoiado nos conceitos com erros e omissões. As prioridades de revisão e seus intervalos devem ser calculados pelo sistema, com IA como explicação e apoio.

Sem commit, push ou deploy.
