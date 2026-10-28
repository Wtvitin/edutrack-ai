# Tasks

## 1. Temporal

- [x] 1.1 Normalizar dias, semanas, meses, intervalos de datas e defaults.
- [x] 1.2 Encaminhar o contrato normalizado ate `get_study_trends`.
- [x] 1.3 Agregar buckets diarios, semanais e mensais sem dados ficticios.

## 2. Respostas e UI

- [x] 2.1 Normalizar JSON estruturado recuperavel na fronteira do backend.
- [x] 2.2 Separar erros de JSON, schema, tipo e especificacao de grafico.
- [x] 2.3 Renderizar o tipo solicitado e exibir legenda para series.

## 3. Verificacao

- [x] 3.1 Cobrir interpretacao, agregacao, meses parciais e isolamento.
- [x] 3.2 Cobrir fluxo ponta a ponta de quatro semanas e normalizacao.
- [x] 3.3 Executar validacao ampla, lint, build e revisar diff final.

## 4. Correcoes posteriores de exibicao e resiliencia

- [x] 4.1 Usar resultado temporal validado para concluir grafico se a chamada textual opcional do Provider falhar.
- [x] 4.2 Localizar metadados e rotulos temporais na apresentacao, mantendo identificadores internos.
- [x] 4.3 Validar regressoes de quatro semanas e graficos mensais.

## 5. Validacao final P0

- [x] 5.1 Roteia pedidos de grafico/comparacao temporal explicitamente para `get_study_trends` antes do Provider escolher ferramenta.
- [x] 5.2 Testa a frase original de ponta a ponta, intervalos mensais, semanas, historico disponivel e falhas de consulta/Provider.
- [x] 5.3 Expoe intervalo consultado e limites das sessoes encontradas no texto final.
- [x] 5.4 Preserva o estado parcial do bucket mensal na especificacao do grafico.
