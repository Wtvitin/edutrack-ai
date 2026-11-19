# Tarefa 14 - Funcionalidade Híbrida: Busca Avançada

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

Foi implementado `GET /api/subjects/search?q=<texto>&overdue=true`.

O Node.js obtém do banco somente o snapshot autorizado da conta. A parte necessária desse snapshot é enviada ao Python, que aplica busca por nome sem diferenciar maiúsculas/minúsculas e acentos, e identifica tarefas incompletas com prazo anterior ao dia atual em Brasília.

A regra é nome OU atraso. Uma consulta por “ESTATISTICA” com overdue=true retornou tanto a disciplina Estatística, encontrada pelo nome, quanto SQL, encontrada por tarefa atrasada. Tarefas concluídas, canceladas e com vencimento no próprio dia não contam como atrasadas.

O teste com uma segunda conta confirmou que nenhum desses registros foi retornado. O Python não recebe conexão direta com o banco.

## Evidências no projeto

- [analytics/search_subjects.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/search_subjects.py)
- [server/coursework.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/coursework.mjs)
- [analytics/test_coursework.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/test_coursework.py)
- [tests/coursework.test.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/tests/coursework.test.mjs)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

Busca híbrida executada e isolamento entre contas verificado.

## Entregáveis pedidos no roteiro original

1.  Link do Pull Request no GitHub contendo as mudanças no XanoScript e o novo script Python.
2.  Screenshot do teste da busca funcionando no Xano.

##

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
