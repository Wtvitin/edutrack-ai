# Validação da entrega acadêmica

## Execuções realizadas

- 117 testes Node.js passaram com concorrência limitada a dois arquivos para caber no ambiente.
- 13 testes Python passaram, incluindo progresso, busca, PDF e análises existentes.
- Typecheck, lint e build de produção passaram.
- Smoke HTTP da versão compilada: 25 páginas, dois retornos 404 esperados, dois assets e fluxo autenticado aprovados.
- OpenSpec 2.1.0: 18 itens válidos, zero falhas em modo estrito antes do arquivamento da mudança nova.
- npm audit das dependências de produção: zero vulnerabilidades após atualização de Next.js 16.4.6, Nodemailer 10.1.4 e Zod 4.6.7.
- Fluxo acadêmico com duas contas e banco descartável: criação/edição/exclusão de disciplinas, tarefas, progresso, busca por nome OU atraso e download de PDF; tentativas entre contas rejeitadas.

## Ajustes de auditoria

O teste semanal de fallback do agente usava sessões fixas de outubro de 2026 para uma consulta relativa ao dia de execução. As datas do fixture foram alinhadas às quatro semanas consultadas, preservando os valores e as verificações do comportamento.

O arquivo build/sites-vite-plugin.ts era legado, sem referência no código atual Next.js, e importava uma dependência Vite ausente. Foi removido; a checagem de tipos continua ativa.

A rastreabilidade de duas propostas antigas foi preservada em design.md, removendo seções extras dos deltas que geravam avisos na validação estrita do OpenSpec.

Os schemas record do agente foram adaptados à assinatura de chave e valor do Zod 4. Não foram removidas validações de entrada, saída, identidade ou propriedade.

## Limites

- Os dados usados nos testes e no PDF anexado são fictícios.
- Não houve acesso ao banco pessoal do aluno, envio de e-mail externo, chamada real a modelos de IA, implantação ou envio da atividade ao Classroom.
- Xano e FlutterFlow foram substituídos pela arquitetura existente por solicitação do aluno; isso não comprova aceitação pelo professor.
- Instalação e screenshots de VS Code/Gemini no computador pessoal não foram verificadas.
- Propostas antigas com pendências mantêm seu estado real. Validação de formato não equivale a implementação concluída.
- O PR final deve permanecer aberto e sem merge para revisão.
