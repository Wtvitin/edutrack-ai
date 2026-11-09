# Laboratório assistido — 28/10/2026

## Uso

No agente, peça: **“Monte um quiz de SQL com base na minha matéria e atividades.”** O agente usa a Tool controlada `prepare_study_quiz`, registra a preparação na auditoria existente e encaminha para `/laboratorio?atividade=<id>`. O Laboratório gera as questões automaticamente ao recuperar esse pedido.

Também é possível clicar em **Novo quiz** e escrever o pedido diretamente. A IA escolhe a matéria e o assunto entre candidatos autorizados, usando descrições e atividades relacionadas da própria conta. A configuração detalhada continua acessível em **Configuração avançada (opcional)**.

A quantidade é sorteada entre 5, 10, 15 e 20 perguntas, com quatro ou cinco alternativas e dificuldade mista. Perguntas e alternativas são embaralhadas no servidor e persistidas com o gabarito ajustado. Recarregar mantém a mesma atividade e suas respostas.

Na correção imediata, selecionar uma alternativa já envia e salva a resposta: verde para a correta, vermelho para a escolhida incorretamente, com explicação e texto de feedback. A resposta é imutável após salvar. O modo avançado de correção ao final mantém a confirmação explícita e esconde o gabarito até concluir.

## Onde focar

Ao concluir um quiz, a interface solicita uma análise da IA. Ela considera até cinco quizzes recentes e o quiz solicitado, se for mais antigo, com no máximo 40 respostas concluídas. A análise traz resumo, pontos fortes e exercícios de revisão. Cada prioridade deve citar identificadores reais de respostas erradas do mesmo conceito; referências inventadas ou de respostas corretas são rejeitadas.

Notas, percentuais e contagem de erros continuam calculados pelo sistema. A IA interpreta esses dados, sem poder mudar notas ou respostas. Os erros observados são agrupados por conceito, quando disponível, como JOIN, GROUP BY ou HAVING.

A análise fica salva por atividade, com versão das evidências, data, provedor/modelo e versão do prompt. Abrir a aba ou recarregar não chama o modelo novamente. Uma falha exige nova tentativa explícita, limitada a duas análises por atividade e doze tentativas por conta em 24 horas. Locks e um número de tentativa impedem concorrência e sobrescrita por respostas atrasadas.

## Segurança e compatibilidade

- O backend recebe a identidade da sessão, nunca do modelo ou do cliente.
- O contexto é limitado a até quatro disciplinas candidatas e quatro atividades por disciplina, com textos truncados; não inclui perfil, e-mail ou dados de outras contas.
- O JSON Schema da geração restringe os IDs às disciplinas candidatas e fixa a quantidade de perguntas e alternativas sorteada.
- A seleção final da disciplina é validada novamente antes de salvar. Fontes literais são conferidas, e conteúdo complementar é sinalizado.
- Geração e análise não recebem Tools. A nova Tool do agente somente prepara a atividade, sem gerar tarefas acadêmicas ou executar SQL fornecido pelo modelo.
- A geração reaproveita os adaptadores existentes e mantém Gemini como padrão, sem fallback implícito. Há limites persistidos e recuperação idempotente dos pedidos.
- Não foram modificados Classroom, e-mails, credenciais ou dependências.

O vínculo literal com uma fonte e a consistência estrutural do gabarito não comprovam correção factual ou validade pedagógica. Os pontos fracos representam padrões nos quizzes analisados, não um diagnóstico de aprendizagem. Tanto as questões quanto a análise devem ser conferidas com referências confiáveis.

## Arquivos e migração

A migração aditiva `database/010_lab_assisted.sql` estende somente `learning_activities`: estado de preparação, contexto autorizado, início da geração e cache/versionamento das análises. Não recria tabelas nem altera questões, respostas ou notas já salvas. A reversão manual está em `database/rollback/010_lab_assisted.sql`, com aviso de perda dos contextos/análises e indicação de executá-la antes de uma eventual reversão da migração 009. Nenhuma reversão foi executada em dados reais.

Novos módulos: `server/lab-assisted.mjs`, `server/lab-model.mjs`, `components/edutrack/lab-feedback.tsx`, `tests/lab-assisted.test.mjs` e `scripts/test-lab-assisted-browser.mjs`.

Foram estendidos os contratos compartilhados, o serviço do laboratório, a API, o registro de Tools, a instrução de encaminhamento do orquestrador, as interfaces do agente/laboratório e os fixtures de teste. As proteções de histórico, validação e não repetição de ações do orquestrador foram mantidas.

## Validação

- Suíte anterior com as novas regressões: **205 testes aprovados**, zero falhas ou testes ignorados na execução com `node --test --test-concurrency=2 tests/*.test.mjs`.
- A primeira execução completa, anterior à última regressão de resposta atrasada, passou com 204 testes. Uma repetição padrão com Chrome e vários processos concorrentes teve um timeout no teste existente de Python/Pandas. A suíte completa voltou a passar com concorrência limitada, sem alterar o código nem aumentar o timeout dos relatórios.
- Typecheck, lint, build e audit aprovados. Audit: zero vulnerabilidades.
- **13 cenários E2E anteriores** do laboratório continuam aprovados, com a configuração avançada preservada.
- **10 cenários E2E novos** validam agente → laboratório, preenchimento automático, contexto de SQL, aleatoriedade, feedback ao selecionar, retomada, resultado, análise automática/cache, responsividade e pedido direto no laboratório.
- Os novos testes verificam ownership, ausência de Tools na geração/análise, idempotência, concorrência, gabaritos embaralhados, fontes, evidências inválidas e proteção contra respostas atrasadas.

Os testes usam PostgreSQL em memória e provedores simulados, em cópia sem `.env` ou dados locais. Não foi realizada chamada paga. A qualidade de respostas reais dependerá do modelo e da cota disponível.

Evidências locais: `.local/lab-assisted-results.json`; logs em `.local/lab-assisted-validation-saMwC6/`; execução final completa em `.local/lab-lab-assisted-Jup08n/.local/lab-assisted-controlled-tests.log`; capturas e resultados do navegador em `.local/audits/laboratorio-assistido-2026-10-28/`.

Capturas com conteúdo simulado:

- [Correção imediata no desktop](../.local/audits/laboratorio-assistido-2026-10-28/desktop-correcao-imediata.png).
- [Pontos fracos e exercícios sugeridos](../.local/audits/laboratorio-assistido-2026-10-28/desktop-pontos-fracos.png).
- [Pedido automático no mobile](../.local/audits/laboratorio-assistido-2026-10-28/mobile-pedido-automatico.png).
- [Análise no tema escuro mobile](../.local/audits/laboratorio-assistido-2026-10-28/mobile-analise-escuro.png).

Sem commit, push ou deploy.
