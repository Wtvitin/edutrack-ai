# Design

`normalizeTemporalRequest` e a fonte de verdade para unidade, quantidade,
granularidade, comparacao, limites e fuso `America/Sao_Paulo`. O Orchestrator
injeta esse contrato na chamada `get_study_trends`, impedindo que o modelo ou
um fallback de sete dias substitua um pedido explicito.

`prepareTemporalAnalytics` consulta o snapshot ja autorizado e cria buckets
diarios, semanais (segunda a domingo, com a semana atual parcial) ou mensais
(mes atual parcial quando aplicavel). Cada bucket preserva inicio, fim, rotulo,
completude, minutos e sessoes.

O Orchestrator constroi uma unica especificacao canonica com a quantidade real
de buckets e o tipo de grafico solicitado. O frontend renderiza barras ou
linhas a partir do contrato validado, com legenda. JSON cercado por Markdown,
envelopes conhecidos e graficos dentro de texto sao normalizados no backend.
