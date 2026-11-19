# Referências de interface - EduTrack AI

## Contexto da adaptação
A implementação existente utiliza Next.js/React, componentes Shadcn/Radix e Recharts. Esta pesquisa documenta referências compatíveis com essa arquitetura; não afirma duplicação ou importação de arquivos no Figma.

## 1. shadcn/ui: dashboard e navegação
- Fonte oficial: https://ui.shadcn.com/blocks
- Recursos consultados: dashboard-01 e sidebar-07.
- Aplicação ao EduTrack AI: separar navegação, cabeçalho, indicadores e conteúdo; reutilizar componentes para manter consistência entre dashboard, disciplinas e tarefas.
- Cuidado: o conteúdo acadêmico e a prioridade das tarefas devem definir a hierarquia, evitando excesso de cards.

## 2. Recharts: gráficos comparativos
- Fonte oficial: https://recharts.github.io/en-US/examples/
- Recursos consultados: gráficos de área, composição de séries e ResponsiveContainer.
- Aplicação ao EduTrack AI: comparar períodos equivalentes, nomear eixos e explicitar quando não há base anterior.

## Referências Figma para estudo complementar
- Onboarding & Mobile UI Kit, Sundar Raj Sharma: https://www.srsdevdesign.com/me/projects/onboarding-ui-kit
- Arquivo indicado pelo autor: https://www.figma.com/community/file/1192255935701924968/onboarding-screen-basic-login-screen-dashboard-design-mockups-cards-design-system
- Material 3 Design Kit: disponível na página oficial https://m3.material.io/

As páginas dos autores foram consultadas, mas os arquivos Figma não foram duplicados nesta execução. Assim, o requisito original de duplicar dois templates Figma permanece substituído pela pesquisa de referências compatíveis com a aplicação real.

## Reflexão
A principal percepção foi que consistência vem da reutilização de componentes e de uma hierarquia clara. No EduTrack AI, isso significa usar os mesmos padrões de navegação, filtros e estados nas telas, deixando prazos, tarefas e progresso fáceis de entender. No backend, a mesma disciplina se aplica à separação dos dados por usuário e à definição dos contratos da API.
