# ai-agent-temporal-charts Specification

## ADDED Requirements

### Requirement: Periodo solicitado como fonte de verdade

O Agent MUST preservar a unidade, quantidade, limites e granularidade
explicitamente solicitados antes de consultar analytics.

#### Scenario: Quatro semanas

- WHEN a pessoa pede as ultimas quatro semanas
- THEN a consulta e o grafico MUST conter quatro buckets semanais identificaveis.

#### Scenario: Meses

- WHEN a pessoa pede dois ou seis meses
- THEN o resultado MUST conter a quantidade correspondente de buckets mensais e
  identificar corretamente um mes atual parcial.

#### Scenario: JSON estruturado recuperavel

- WHEN o provider retorna um grafico valido em Markdown ou envelope conhecido
- THEN o backend MUST entregar `analysis.chart` validado e MUST NOT expor o JSON
  bruto como texto da conversa.

#### Scenario: Erro classificavel

- WHEN a resposta e vazia, JSON malformado, schema invalido, tipo inesperado ou
  grafico invalido
- THEN o backend MUST usar um codigo de erro especifico e uma mensagem segura.
