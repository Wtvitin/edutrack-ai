# Tarefa 12 - Integração Python Básica

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

Foi implementado o cálculo em Python e uma entrada CLI em `scripts/calculate_progress.py`. A função retorna completed, total e percentage em JSON.

Fórmula: `percentage = completed / total * 100`. Quando o total é zero, o retorno é `0.0`, sem divisão por zero. Tarefas canceladas ficam fora do denominador; tarefas concluídas são reconhecidas pelos campos usados pela aplicação.

Execução funcional validada: uma disciplina com duas tarefas, sendo uma concluída, retornou `{"completed": 1, "total": 2, "percentage": 50}`.

Também foi disponibilizada a rota autenticada `GET /api/progress?subject=<id>`. Uma conta diferente recebeu rejeição ao tentar consultar a disciplina de outra pessoa.

## Evidências no projeto

- [scripts/calculate_progress.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/scripts/calculate_progress.py)
- [analytics/calculate_progress.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/calculate_progress.py)
- [analytics/test_coursework.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/test_coursework.py)
- [tests/coursework.test.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/tests/coursework.test.mjs)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

Script e endpoint executados; casos de lista vazia e isolamento verificados.

## Entregáveis pedidos no roteiro original

Link do arquivo calculate_progress.py no GitHub.
Screenshot do teste do script (pode ser no terminal ou no painel do Xano).

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
