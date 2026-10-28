# Honrar periodos solicitados nos graficos do Agent

## Problema

O Agent delegava a duracao ao modelo e usava `7` como fallback. A agregacao
seguia diaria e o Orchestrator criava somente duas series, mesmo quando a
pessoa solicitava quatro semanas, meses ou um intervalo explicito.

## Solucao

Normalizar deterministicamente a linguagem temporal antes da Tool, agregar
sessoes reais em buckets diarios, semanais ou mensais e entregar uma resposta
canonica `analysis.chart`. Respostas JSON recuperaveis sao normalizadas na
fronteira do Orchestrator; falhas de JSON, schema, tipo e grafico possuem
codigos distintos.

## Nao objetivos

- Criar notas ou metricas academicas inexistentes.
- Substituir a fonte autorizada de dados ou o isolamento por usuario.
- Fazer a interface interpretar formatos brutos de providers.
