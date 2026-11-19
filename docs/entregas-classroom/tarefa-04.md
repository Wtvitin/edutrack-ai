# Tarefa 04 - Primeiro Pull/Push com XanoScript

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

O backend do EduTrack AI está representado por código Node.js, migrações SQL e contratos da API. A persistência utiliza PostgreSQL, com PGlite disponível para execução local e testes descartáveis.

O equivalente funcional de manter a estrutura do backend como código aparece nas migrações versionadas. A nova migração 009 acrescenta teacher e hours às disciplinas sem remover dados ou substituir as tabelas existentes.

O projeto não foi conectado ao Xano nem passou a gerar arquivos .xs. Conforme a adaptação solicitada, a entrega utiliza o backend real já adotado e a evidência correspondente no repositório.

## Evidências no projeto

- [server/database.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/database.mjs)
- [server/data.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/data.mjs)
- [database/009_subject_academic_fields.sql](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/database/009_subject_academic_fields.sql)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

Adaptada de XanoScript para Node.js e migrações SQL; não houve pull/push para Xano.

## Entregáveis pedidos no roteiro original

Screenshot do VS Code mostrando a pasta com os arquivos .xs baixados.
Screenshot do terminal mostrando o git push realizado com sucesso.
Link do repositório GitHub atualizado.

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
