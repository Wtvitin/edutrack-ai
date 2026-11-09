# EduTrack AI — Laboratório de Estudos

## Arquitetura e escopo

O Laboratório é uma experiência própria em `/laboratorio`, acessível pelo menu principal, inclusive no menu móvel. Usa a navegação interna existente, sem recarregar o documento entre abas. O chat e seu histórico permanecem separados.

O fluxo é: interface → API autenticada existente → serviço `study-lab` → adaptador de IA existente → validação estruturada → persistência. O navegador não recebe credenciais nem consulta o banco diretamente. Não foram adicionadas dependências.

A inspeção prévia identificou autenticação por cookie, proteção de origem, SQL parametrizado, migrações incrementais, disciplinas com vínculo composto de ownership, componentes com tokens de tema e os três adaptadores existentes de IA. Uma extração local do Graphify examinou 17 arquivos de servidor, com 216 nós e 456 relações; não utilizou LLM nem serviços externos.

As entidades anteriores não representam perguntas e respostas de um quiz. Por isso foram criadas duas tabelas específicas, sem reutilizar indevidamente `study_sessions`, o histórico do chat ou as tarefas. Concluir um quiz não cria tarefas nem duplica minutos do cronômetro.

## Telas e funcionalidades

- Visão geral com quizzes concluídos, questões respondidas, percentual de acertos e áreas praticadas.
- Geração por disciplina cadastrada, assunto livre ou material de referência, com até 12.000 caracteres.
- Configuração de 5, 10, 15 ou 20 questões; dificuldade fácil, intermediária, difícil ou mista; quatro ou cinco alternativas; correção imediata ou ao final.
- Navegação livre entre questões, confirmação explícita e imutável de cada resposta, progresso persistido, retomada e revisão final.
- Resultado com acertos, erros, percentual e tempo decorrido entre disponibilização e conclusão. O tempo inclui pausas e saídas da página; não é tempo ativo de estudo.
- Evolução por disciplina/área, últimos 12 resultados clicáveis e assuntos com mais erros.
- Histórico das 100 atividades mais recentes; os indicadores consideram todo o histórico persistido.
- Estados de carregamento, vazio, indisponibilidade, geração em andamento e falha recuperável. Os temas claro e escuro usam a paleta existente e há layout móvel.
- Modalidades futuras apresentadas como planejadas, sem botões que simulem funcionalidades inexistentes. A demonstração exige login para gerar, sem inserir métricas fictícias.

## API

Todas as rotas exigem sessão. As escritas também exigem a origem e o tipo JSON já verificados pela API existente.

| Método e rota | Função |
| --- | --- |
| GET `/api/lab` | Indicadores e histórico da própria conta, sem gabaritos |
| POST `/api/lab/quizzes` | Geração idempotente por `requestId` |
| GET `/api/lab/quizzes/:id` | Recuperação autorizada da atividade |
| POST `/api/lab/quizzes/:id/answers` | Confirmação imutável de uma alternativa |
| POST `/api/lab/quizzes/:id/finish` | Correção e conclusão atômicas |

O contrato de configuração é estrito e rejeita identidades, notas ou gabaritos enviados pelo cliente. O usuário vem da sessão; a disciplina é validada contra esse usuário. Consultas e mutações usam SQL parametrizado e filtro por owner.

## Geração e confiabilidade pedagógica

A geração reutiliza Gemini, Groq ou OpenRouter conforme seleção explícita atual, mantendo Gemini como padrão. Somente para o laboratório, o fallback de modelo é desabilitado e cada chamada ao transporte tem limite de até 45 segundos. O chat não teve sua configuração alterada. Os retries limitados já implementados no adaptador continuam válidos; o laboratório não adiciona chamadas de reparo ou repetições automáticas de geração.

O pedido não oferece Tools e não passa pelo orquestrador de ações acadêmicas. Uma resposta que tente chamar ferramentas é rejeitada. Apenas nome/descrição da disciplina selecionada, assunto e material informado são enviados ao modelo; tarefas, conversas, e-mails e outras disciplinas não entram no prompt.

A resposta deve satisfazer o JSON Schema compartilhado e a validação Zod do servidor. São exigidos quantidade exata de perguntas, quatro ou cinco alternativas distintas após normalização, índice válido de uma única correta, enunciados distintos, dificuldade solicitada e correspondência entre `explanation.answer` e a alternativa do gabarito. A dificuldade mista inclui as três dificuldades. Respostas incompletas, acima de 120 KB, com JSON inválido ou fora do contrato não são publicadas.

Com material fornecido, uma questão precisa indicar referência literal encontrada no texto, ou ser marcada como conteúdo complementar sem sustentação no material. Sem material, aparece como conhecimento geral gerado por IA. A interface preserva e permite consultar o texto original.

Essas verificações comprovam formato e proveniência literal, não a correção factual, ausência de ambiguidade semântica ou a validade pedagógica da justificativa. O próprio produto apresenta essa limitação. Uma justificativa pode ser semanticamente incorreta mesmo com a alternativa e o campo de resposta estruturalmente consistentes. Revisão humana e avaliação com conteúdo de referência são recomendadas antes de usos avaliativos.

## Persistência e integridade

A migração incremental `database/009_study_lab.sql` cria:

- `learning_activities`: usuário, disciplina opcional, nome da disciplina preservado, modalidade, versão do contrato, configuração, assunto, fonte, questões imutáveis, estado, identificação da geração, provedor/modelo, versão do prompt, nota e datas.
- `learning_answers`: atividade, owner, posição da questão, alternativa escolhida, correção calculada no servidor e data da resposta.

O vínculo composto entre usuário e disciplina impede associação entre contas no banco. Ao remover uma disciplina, somente a referência do quiz fica nula: o nome, as questões, respostas e resultados continuam no histórico. O vínculo composto de respostas com a atividade impede respostas de outro usuário. Há unicidade de pedido por usuário e de resposta por questão.

Reservas de geração e cotas usam uma transação curta com lock do usuário, liberada antes de chamar a IA. O mesmo `requestId` recupera a atividade; conteúdo diferente com o mesmo identificador gera conflito. Novos pedidos concorrentes são bloqueados enquanto a geração está ativa. As cotas persistidas são de quatro gerações em 15 minutos e doze em 24 horas, incluindo tentativas que falharam. Isso não equivale a doze chamadas HTTP: o adaptador pode repetir uma falha transitória uma vez dentro dos limites existentes.

Respostas e conclusão usam lock da atividade. Reenviar a mesma resposta não cria duplicata; tentar substituí-la causa conflito. A conclusão exige todas as respostas, é idempotente e calcula a nota no servidor. O cliente não pode fornecer `score`, `isCorrect`, identidade ou gabarito.

Na correção imediata, só a questão já respondida recebe o gabarito. Na correção ao final, os gabaritos e explicações só são enviados após conclusão. Percentuais e dificuldades do dashboard usam apenas quizzes concluídos, evitando revelar correção através de indicadores durante a atividade; o contador de questões respondidas inclui atividades ainda abertas.

Gerações interrompidas por mais de três minutos passam a falha ao serem recuperadas, sem outra chamada paga. O navegador mantém o identificador enquanto tenta recuperar um envio sem confirmação; após recarregar ou sair da aba, a recuperação é feita pelo histórico e pelo parâmetro `atividade` na URL.

Foi fornecido `database/rollback/009_study_lab.sql` exclusivamente para reversão manual após exportar os dados do laboratório. Ele elimina apenas as tabelas novas e sua entrada no registro de migrações. **Não deve ser executado em dados reais sem uma decisão explícita de apagar o histórico do laboratório.** Foi testado somente em banco descartável.

Nenhum banco real foi aberto durante a implementação ou os testes. A migração aditiva será aplicada pelo mecanismo existente quando a aplicação for iniciada normalmente; não altera registros acadêmicos anteriores.

## Arquivos desta rodada

Novos arquivos de produto:

- `lib/lab-schemas.mjs` e `lib/lab-types.ts`.
- `server/study-lab.mjs`.
- `components/edutrack/lab-view.tsx` e `app/study-lab.css`.
- `database/009_study_lab.sql` e `database/rollback/009_study_lab.sql`.

Pontos de integração alterados: `server/api.mjs`, `server/database.mjs`, `lib/navigation.mjs`, `components/edutrack/app.tsx`, `app/[...slug]/page.tsx` e `app/layout.tsx`.

Novos testes e ferramentas: `tests/study-lab.test.mjs`, `tests/study-lab-api.test.mjs`, `tests/fixtures/lab.mjs`, `scripts/lab-fixture.mjs` e `scripts/test-lab-browser.mjs`.

As alterações locais das rodadas anteriores foram mantidas. Não foram modificados Classroom, Resend/SMTP, o provedor ou o orquestrador do chat, arquivos de credenciais ou migrações anteriores. Não houve commit, push ou deploy.

## Execução segura dos testes

A validação usa uma cópia isolada do código, sem arquivos `.env`, credenciais ou dados locais. A instalação já corrigida na rodada 3 é reutilizada por junction somente para dependências; build, cache e testes trabalham na cópia. Não foi necessário instalar pacotes novos.

Para os testes de navegador, primeiro execute `npm run build` em uma cópia de teste e inicie `node scripts/lab-fixture.mjs`. Esse servidor usa banco em memória, e-mail local, conta fictícia `lab@example.test` com senha `laboratory-test-123` e provedor simulado. Ele nunca é uma conta de acesso à aplicação real.

Em outro terminal, execute `node scripts/test-lab-browser.mjs` com Playwright disponível. `PLAYWRIGHT_MODULE` permite indicar uma instalação já existente; `LAB_BROWSER_CHANNEL` seleciona o navegador instalado, com Chrome como padrão. A origem padrão é `http://127.0.0.1:4186`, exclusiva do fixture. As capturas e evidências ficam por padrão em `.local/audits/laboratorio-2026-10-28`.

Os testes cobrem o contrato completo de configuração, referências falsas, gabarito incompatível, proteção por conta na API e no banco, CSRF, retomada, concorrência, idempotência, correção, notas, estatísticas, cotas, segurança e falhas de IA. Os três adaptadores são exercitados com transportes simulados, sem chaves reais ou cobrança.

Resultado final: **189 testes aprovados, sem falhas ou testes ignorados**, preservando as 156 verificações anteriores e acrescentando 33. `npm run typecheck`, `npm run lint`, `npm run build` e `npm audit` passaram; o audit retornou zero vulnerabilidades. O build não apresentou `SecurityFatalError`.

Também passaram **13 cenários E2E** do laboratório, incluindo login real no fixture, navegação sem recarga, geração simulada, retomada após reload, correção imediata/ao final, fontes, resultados persistidos, falhas de geração e histórico, teclado e layouts de 320, 390 e 768 pixels. Nenhum erro não tratado foi capturado no navegador. O smoke de produção existente passou por 25 páginas, duas rotas inexistentes, dois recursos estáticos e os fluxos de autenticação, CRUD, relatórios, notificações, Classroom e agente simulado. O laboratório foi exercitado separadamente pelo E2E.

A comparação por hashes confirmou 1.587 arquivos anteriores preservados fora dos seis pontos de integração previstos e igualdade do código testado com a pasta principal. Os logs estão em `.local/round4-validation-gX0Gxz/`; os resumos, em `.local/round4-results.json` e `.local/round4-preservation-results.json`.

Capturas locais com dados explicitamente simulados pelo fixture:

- [Visão geral desktop, tema claro](../.local/audits/laboratorio-2026-10-28/desktop-claro.png).
- [Visão geral desktop, tema escuro](../.local/audits/laboratorio-2026-10-28/desktop-escuro.png).
- [Configuração do quiz](../.local/audits/laboratorio-2026-10-28/desktop-configuracao.png).
- [Questão e progresso](../.local/audits/laboratorio-2026-10-28/desktop-quiz.png).
- [Resultado e revisão](../.local/audits/laboratorio-2026-10-28/desktop-resultado.png).
- [Mobile, tema claro](../.local/audits/laboratorio-2026-10-28/mobile-claro.png).
- [Mobile, tema escuro](../.local/audits/laboratorio-2026-10-28/mobile-escuro.png).
- [Quiz mobile, tema escuro](../.local/audits/laboratorio-2026-10-28/mobile-quiz-escuro.png).

As capturas e os resultados E2E ficam em `.local`, ignorada pelo Git. São entregas locais desta auditoria, não dados adicionados ao produto. Avisos de múltiplos lockfiles durante o build decorreram da cópia de teste aninhada; não se alterou a configuração do projeto para ocultá-los. O aviso de descontinuação `module.register()` do Node é não bloqueante e permanece fora do escopo desta rodada.

## Limitações e próximo passo

- A qualidade real das questões de Gemini/Groq/OpenRouter não foi avaliada com chamadas pagas. A validação comprova contratos e falhas controladas com mocks.
- Vinte questões com justificativas podem exceder o tempo, tokens ou a cota disponível do provedor. Nesse caso, a geração falha explicitamente e o usuário pode optar por menos questões; não há fallback silencioso nem regeneração automática.
- O tempo de atividade é decorrido, não uma medição de atenção. Não altera o total de sessões do cronômetro.
- O teste de persistência usa PGlite, o PostgreSQL local suportado pelo projeto; não foi conectado um PostgreSQL remoto real. Uma instalação externa deve suportar a cláusula de FK com `ON DELETE SET NULL (subject_id)` usada pela migração.
- As verificações de acessibilidade abrangem nomes de campos, teclado, foco, progresso e estrutura básica. Não constituem uma certificação WCAG completa.
- O texto fornecido permanece na conta para retomada e rastreabilidade. Exportação e exclusão individual de atividades, retenção configurável e limites administrativos são melhorias futuras, fora desta rodada.
- A próxima modalidade recomendada é flashcards: reutilizar a atividade/versionamento/provedor/ownership, adicionar cartões e eventos de revisão e calcular o agendamento de forma determinística. Não delegar a repetição espaçada ao modelo.
