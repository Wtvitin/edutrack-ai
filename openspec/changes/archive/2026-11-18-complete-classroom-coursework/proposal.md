# Change: complete-classroom-coursework

## Why
As tarefas 01 a 16 do Classroom pedem evidências separadas e implementações de progresso, CRUD, busca híbrida e PDF. O usuário autorizou usar a arquitetura existente do EduTrack AI como adaptação de Xano e FlutterFlow.

## What Changes
- Documentar cada tarefa separadamente, com referências ao código e resultados efetivamente verificados.
- Acrescentar cálculo Python que retorne `percentage`, busca Python por nome OU atraso e geração de PDF em Python.
- Integrar essas funções à API autenticada existente e expor CRUD REST de disciplinas reutilizando a persistência e o controle de revisão existentes.
- Preservar Next.js, PostgreSQL, sessões, sincronização atual e os dados reais; testar em banco descartável.
- Preparar a entrega final em branch própria e PR aberto, sem merge.

## Impact
- Código: `analytics/`, `server/api.mjs`, `server/coursework.mjs`, documentação de API e botão de relatório.
- Testes: unidade Python e integração autenticada com duas contas.
- A adaptação de tecnologias deve constar expressamente nas entregas. Não serão declarados instalação, screenshots, integração ou histórico de Xano/FlutterFlow que não existam.
- Propostas antigas permanecem com seu estado real; apenas esta mudança poderá ser arquivada depois da verificação.
