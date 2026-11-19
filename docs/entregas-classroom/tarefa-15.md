# Tarefa 15 - Feature Avançada: Geração de Relatórios

Aluno: Victor Samuel Costa de Oliveira

Disciplina: Innovation Lab - Desenvolvimento Avançado No/Low Code

## Modalidade desta entrega

Implementação no EduTrack AI existente, com adaptação de tecnologias solicitada pelo aluno. Este documento registra o resultado real; a aceitação da adaptação cabe ao professor.

## Resolução

Foi implementado um gerador PDF em Python com ReportLab. O documento apresenta disciplina, quantidade concluída, total de tarefas, percentual de progresso e tarefas atrasadas.

`POST /api/reports/generate` retorna uma URL da própria aplicação. `GET /api/reports/download` exige sessão e gera o PDF com os dados autorizados. Não é criado um arquivo público com dados pessoais.

O botão “Baixar PDF” foi adicionado ao relatório das contas autenticadas. A impressão/salvamento pelo navegador continua disponível.

O arquivo anexado a esta entrega foi efetivamente gerado pelo endpoint em um teste com banco descartável e dados fictícios. Não contém notas reais nem resultados pessoais do aluno. A integração validou o Content-Type application/pdf e o conteúdo PDF retornado.

## Evidências no projeto

- [analytics/generate_report.py](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/generate_report.py)
- [server/coursework.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/server/coursework.mjs)
- [components/edutrack/report-panel.tsx](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/components/edutrack/report-panel.tsx)
- [analytics/requirements.txt](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/analytics/requirements.txt)
- [tests/coursework.test.mjs](https://github.com/Wtvitin/edutrack-ai/blob/release/final-delivery-classroom-20261119/tests/coursework.test.mjs)

Repositório: https://github.com/Wtvitin/edutrack-ai

## Situação da atividade

PDF gerado e baixado pela API autenticada; amostra de teste anexada.

## Entregáveis pedidos no roteiro original

1.  O arquivo PDF gerado pelo seu sistema.
2.  Link do script Python no GitHub.

##

As evidências e limitações desta resposta devem ser lidas em conjunto. Logs reais de comandos não são apresentados como screenshots de VS Code, Xano ou FlutterFlow.
