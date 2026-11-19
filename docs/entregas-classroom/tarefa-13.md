# Tarefa 13 - APIs CRUD para Disciplinas

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

Foram acrescentados endpoints REST ao backend existente:

- `GET /api/subjects`: listar disciplinas da conta.
- `POST /api/subjects`: criar disciplina.
- `GET /api/subjects/{id}`: consultar disciplina.
- `PATCH /api/subjects/{id}`: atualizar campos.
- `DELETE /api/subjects/{id}`: excluir disciplina sem vínculos.

A identidade vem da sessão. O cliente não pode escolher user_id. As alterações exigem revision para evitar sobrescrever dados de outra aba; revisão desatualizada retorna conflito.

Os testes verificaram criação com professor e carga horária, atualização parcial, preservação dos campos em gravações de clientes antigos, exclusão de disciplina vazia e bloqueio de leitura/alteração/exclusão por outra conta. A disciplina geral e disciplinas em uso são protegidas pelas regras existentes.

As rotas foram incluídas na documentação OpenAPI da aplicação, disponível em `/api/docs` e `/api/openapi.json`.

## Evidências no projeto

- [server/coursework.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/coursework.mjs)
- [server/coursework-openapi.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/coursework-openapi.mjs)
- [server/data.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/data.mjs)
- [tests/coursework.test.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/tests/coursework.test.mjs)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

CRUD REST, revisão e propriedade testados; OpenAPI atualizado.

## Entregáveis pedidos no roteiro original

1.  Screenshot do Swagger (documentação de API) do Xano mostrando os novos endpoints.
2.  Link do arquivo `.xs` atualizado no GitHub.

##

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
