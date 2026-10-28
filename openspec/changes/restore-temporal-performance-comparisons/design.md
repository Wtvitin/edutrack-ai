# Design

`readData` continua sendo a fonte autorizada e filtra sess�es pelo usu�rio da
sess�o autenticada. `prepareAnalytics` compara janelas inclusivas de N dias
consecutivos, usando datas locais `America/Sao_Paulo`: janela recente terminando
hoje e janela anterior imediatamente precedente. `get_study_trends` aceita
per�odos suportados e retorna pontos di�rios e totais de ambos.

Para duas semanas, a Tool recebe `days=7`; o Orchestrator transforma os pontos
em duas s�ries de minutos por dia relativo da janela. Dias sem sess�o recebem
zero porque a consulta abrange integralmente o hist�rico local. Se ambos os
per�odos n�o tiverem sess�es, retorna explica��o sem gr�fico. Falha t�cnica da
Tool resulta em erro controlado, n�o em alega��o de aus�ncia de dados.

A UI existente valida `ChartSpecification` e renderiza compara��o com Recharts;
nenhuma mudan�a de frontend � necess�ria.
