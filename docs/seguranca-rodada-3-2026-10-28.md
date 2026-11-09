# EduTrack AI — estabilização de segurança, rodada 3

Relatório concluído em 28/10/2026. Nenhum commit, push ou deploy realizado.

## Resultado

O audit inicial identificou três pacotes vulneráveis, associados a sete advisories. Após as atualizações, `npm audit --json` na instalação principal e `npm audit` na cópia isolada terminaram com código zero e nenhuma vulnerabilidade conhecida pelo registro consultado. Isso não substitui auditorias futuras nem representa garantia de ausência de falhas desconhecidas.

| Dependência direta | Antes | Depois | Severidade máxima anterior |
| --- | --- | --- | --- |
| Next.js | 16.4.0 | 16.4.3 | Crítica |
| Nodemailer | 10.0.13 | 10.1.4 | Moderada |
| Zod | 3.25.76 | 4.6.7 | Alta |

Next.js e Nodemailer permanecem em suas versões major anteriores. A atualização major do Zod foi necessária porque o advisory cobre versões abaixo de 4.6.6; não foi identificada uma correção equivalente na linha 3. Os três pacotes são dependências diretas. Zod também era compartilhado com `@hookform/resolvers`, `eslint-plugin-react-hooks` e `zod-validation-error`; seus intervalos de compatibilidade permitem Zod 4.

O lockfile mudou somente 12 versões de pacotes: as três dependências diretas, `@next/env` e oito variantes de plataforma de `@next/swc`. React, TypeScript, bibliotecas de banco e ferramentas não relacionadas foram preservados. Sharp 0.35.5, usado pelo Next, já atendia ao mínimo corrigido e não precisou mudar.

## Advisories oficiais

- Next.js: [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), execução de código pela otimização de imagens em ambientes afetados; [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), negação de serviço envolvendo Server Actions; [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr), execução de código em condições envolvendo `use cache`. Correção mínima na linha instalada: 16.4.1.
- Nodemailer: [GHSA-8c8m-p3m8-cjg8](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8), [GHSA-m943-m63m-w62w](https://github.com/advisories/GHSA-m943-m63m-w62w) e [GHSA-85x2-q946-cp5h](https://github.com/advisories/GHSA-85x2-q946-cp5h), interpretação incorreta de endereços em construções com comentários, grupos ou aspas. Correção mínima: 10.1.4.
- Zod: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), consumo excessivo de recursos durante validação de coleções. Correção mínima: 4.6.6. A migração foi conferida contra o [guia oficial do Zod 4](https://zod.dev/v4/changelog).

## Compatibilidade e alterações

A única adaptação de código exigida pela migração foi explicitar o schema das chaves em seis records: `z.record(z.unknown())` passou a `z.record(z.string(), z.unknown())`. Isso preserva os objetos dinâmicos usados em métricas, metadados, resultados e argumentos de ferramentas. Não foram relaxadas validações para acomodar a atualização.

Foram avaliadas as mudanças do Zod em UUIDs, números inteiros, defaults e erros. Os testes verificam UUIDs válidos, campos opcionais e nulos, rejeição de campos indevidos e respostas estruturadas. Não foi utilizado o caminho `zod/v3` para contornar a correção.

Arquivos desta rodada:

- `package.json` e `package-lock.json`: versões corrigidas e reproduzíveis.
- `lib/agent-response-schemas.mjs`: cinco records compartilhados adaptados.
- `server/agent-schemas.mjs`: um record de argumentos adaptado.
- `tests/security-dependencies.test.mjs`: sete regressões novas.
- Este relatório.

As mudanças locais anteriores foram preservadas, incluindo a estabilização do agente e a alteração preexistente do sistema de e-mails. Não houve mudança de configuração dos provedores, arquivos `.env`, Classroom, migrações ou dados reais.

## Investigação do SecurityFatalError

A origem foi identificada no código instalado do Next.js, em `next/dist/lib/upgrade/nudge.js`. O mecanismo de aviso de atualização para execução por agente pode lançar um erro com nome `SecurityFatalError` e código de saída 1 ao detectar uma versão vulnerável. O mecanismo `allowNudgeRetry()` registra uma autorização temporária de repetição sob `.next/cache/next-agentic-upgrade-retries`, considerando projeto, versão e comando. Isso explica uma segunda compilação passar sem que a vulnerabilidade tivesse sido corrigida.

Portanto, o comportamento observado era uma barreira de segurança do framework, e não evidência de um erro de TypeScript ou da aplicação. Repetir a compilação não corrige a dependência vulnerável. Após atualizar, o primeiro build da cópia isolada, com `.next` novo, passou sem `SecurityFatalError`. Nenhuma proteção foi desativada e nenhum recibo de repetição foi copiado.

## Validações

Foi criada uma cópia descartável com as alterações locais existentes, sem `.git`, dependências instaladas, banco, arquivos de credenciais ou `.env` reais. A instalação limpa ocorreu nessa cópia. Os testes usam dados fictícios, banco em memória, capturas locais de e-mail e mocks dos provedores externos.

| Verificação na cópia isolada | Resultado |
| --- | --- |
| `npm ci --no-fund` | Aprovado, código 0 |
| `npm run typecheck` | Aprovado, código 0 |
| `npm test` | 156 testes aprovados; zero falhas, cancelamentos ou testes ignorados |
| `npm run lint` | Aprovado, zero avisos |
| `npm run build` | Aprovado na primeira tentativa com Next.js 16.4.3 |
| `npm audit` | Zero vulnerabilidades |

O smoke test de produção percorreu 25 páginas, duas respostas de página inexistente e dois recursos estáticos. Exercitou autenticação, CRUD, histórico, notificações, analytics, proteção CSRF, logout, status do Classroom e agente simulado. As suítes de autenticação e e-mail cobrem confirmação e recuperação de senha, Resend e SMTP sem envio externo.

Além disso, passaram 20 verificações de navegador: navegação entre abas, ausência de recarregamento e de flash de animação, relações disciplina/tarefa/dashboard, sessões de estudo, persistência do cronômetro, histórico do navegador, catálogo de integrações, layout móvel claro/escuro, persistência e logout. Os testes específicos do agente verificaram bloqueio de segurança, recuperação após ação parcial, envio duplicado e resposta malformada.

Os sete testes novos validam as versões instaladas e o lockfile, ausência de Zod vulnerável aninhado, resolução das dependências na própria instalação, schemas compartilhados, argumentos das ferramentas, os três casos de parsing dos advisories do Nodemailer e geração de mensagem SMTP por transporte em memória. Nenhuma API paga ou credencial real foi utilizada.

Após promover os arquivos validados, as versões instaladas na pasta principal foram confirmadas e seu `npm audit --json` também retornou zero vulnerabilidades. As evidências e logs estão em `.local/round3-validation-results.json`, `.local/round3-validation-fNdgtn/` e `.local/round3-preservation-results.json`. A cópia isolada foi mantida para reprodução; seu servidor temporário foi encerrado.

## Riscos e limites

- As integrações externas foram verificadas com mocks e contratos locais. A disponibilidade do Google/Gemini/Groq/OpenRouter e a entrega real de e-mails dependem das contas e dos serviços; não foram usados para esta rodada.
- O build isolado em uma pasta aninhada apresentou aviso de descoberta de múltiplos lockfiles. A resolução efetiva das dependências locais foi testada explicitamente; não se alterou a configuração de produção para esconder esse aviso.
- Avisos de descontinuação do Node e de ferramentas transitivas não foram confundidos com vulnerabilidades. Não justificaram atualizar ferramentas fora do escopo.
- Novos advisories podem surgir. Recomenda-se repetir o audit e estas regressões antes de futuras publicações, mantendo os testes de segurança e o lockfile versionados quando houver autorização para commit.
