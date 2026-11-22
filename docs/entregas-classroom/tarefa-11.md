# Tarefa 11 - Adicionar Tabela Tarefas via XanoScript

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

A tabela academic_tasks já está definida nas migrações do projeto. Ela contém title, description, due_date, status e subject_id, além de user_id e outros campos que a aplicação já utiliza.

O relacionamento da tarefa com a disciplina é protegido por restrições do banco. A API lê e grava apenas registros do usuário autenticado. O fluxo de integração desta entrega criou tarefas de teste vinculadas às disciplinas e verificou a persistência.

O equivalente ao arquivo .xs é a migração SQL versionada. A evidência é o schema real, o código de persistência e o teste com banco descartável.

## Evidências no projeto

- [database/001_core.sql](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/database/001_core.sql)
- [database/002_accounts.sql](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/database/002_accounts.sql)
- [server/data.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/data.mjs)
- [tests/coursework.test.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/tests/coursework.test.mjs)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

Schema e relacionamento testados em PostgreSQL/PGlite; sem declaração de tabela no painel Xano.

## Entregáveis pedidos no roteiro original

Screenshot da tabela academic_tasks no painel do Xano.
Link do arquivo .xs no GitHub.

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
