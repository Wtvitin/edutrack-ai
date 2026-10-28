# Restaurar compara��es temporais de desempenho

## Problema

A Tool `get_study_trends` entregava um resumo e uma s�rie di�ria apenas para os
sete dias recentes. Assim, o Orchestrator n�o tinha dados di�rios para ambos os
per�odos e acabava retornando an�lise sem compara��o �til.

## Solu��o

Estender a mesma agrega��o autorizada para incluir duas s�ries di�rias completas
e os limites de ambas as janelas. O Orchestrator constr�i a visualiza��o com
minutos registrados em sess�es de estudo; indisponibilidade da consulta e
aus�ncia real de sess�es permanecem estados distintos.

## N�o objetivos

- Inferir notas ou desempenho acad�mico n�o armazenado.
- Inventar ou duplicar pontos para preencher per�odos sem atividade.
- Alterar o modelo de dados, isolamento do usu�rio ou biblioteca de gr�ficos.
