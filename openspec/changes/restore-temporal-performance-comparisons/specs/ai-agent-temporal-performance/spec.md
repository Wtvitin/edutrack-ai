# ai-agent-temporal-performance Specification

## ADDED Requirements

### Requirement: Compara��o temporal de sess�es de estudo

O Agent MUST obter e comparar minutos de sess�es reais em janelas consecutivas
de igual dura��o, usando dados isolados pelo usu�rio autenticado e datas locais
de `America/Sao_Paulo`.

#### Scenario: Duas semanas dispon�veis

- WHEN uma pessoa solicita compara��o das duas �ltimas semanas
- THEN o Agent MUST consultar sete dias recentes e os sete dias imediatamente
  anteriores e MUST fornecer s�ries di�rias de minutos reais para ambas.

#### Scenario: Hist�rico sem atividade

- WHEN a consulta v�lida n�o encontra sess�es em nenhum dos per�odos
- THEN o Agent MUST explicar a aus�ncia e MUST NOT criar um gr�fico enganoso.

#### Scenario: Falha da consulta

- WHEN a consulta hist�rica falha tecnicamente
- THEN o Agent MUST retornar erro controlado e MUST NOT descrever a falha como
  aus�ncia de dados.

#### Scenario: Gr�fico comparativo

- WHEN existem sess�es em pelo menos um dos per�odos
- THEN o Agent MUST retornar `ChartSpecification` com duas s�ries di�rias,
  intervalos identificados e fonte `get_study_trends`.
