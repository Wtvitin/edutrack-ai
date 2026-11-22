# Tarefa 07 - Configuração Inicial no FlutterFlow

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

O frontend real do EduTrack AI utiliza Next.js e React. A aplicação possui páginas de organização acadêmica, componentes compartilhados, tema e integração com o servidor Node.js.

A comunicação acontece por rotas da própria aplicação, como `/api/data` e `/api/analytics`, com sessão autenticada e verificação de propriedade no backend. Não é necessário um API Group do FlutterFlow para esta arquitetura.

A configuração adotada, as variáveis de ambiente e as instruções de execução estão documentadas no README. O projeto preserva a separação entre demonstração e contas autenticadas.

## Evidências no projeto

- [components/edutrack/account-store.tsx](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/components/edutrack/account-store.tsx)
- [components/edutrack/app.tsx](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/components/edutrack/app.tsx)
- [server/api.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/api.mjs)
- [README.md](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/README.md)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

Adaptada de FlutterFlow/API Group para frontend Next.js e API Node.js.

## Entregáveis pedidos no roteiro original

Screenshot da tela inicial do seu projeto no FlutterFlow.
Screenshot da configuração do "API Group" mostrando a URL do Xano.
Link do repositório GitHub com o README atualizado.

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
