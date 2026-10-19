<p align="center">
  <img src="docs/assets/edutrack-cover.svg" alt="EduTrack AI — Organização e acompanhamento da rotina acadêmica" width="100%" />
</p>

<h1 align="center">EduTrack AI</h1>

<p align="center">
  <a href="#funcionalidades">Funcionalidades</a> · <a href="#instalação-e-execução">Executar localmente</a> · <a href="docs/arquitetura.md">Arquitetura</a> · <a href="#limitações-conhecidas">Status e limites</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" /> <img alt="Next.js" src="https://img.shields.io/badge/Next.js-181717?style=flat-square&amp;logo=nextdotjs" /> <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169A1?style=flat-square&amp;logo=postgresql&amp;logoColor=white" /> <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=flat-square&amp;logo=python&amp;logoColor=white" />
</p>

Aplicação web para organizar a rotina acadêmica em um só lugar: disciplinas, tarefas, sessões de estudo, calendário, notificações e relatórios de desempenho. O projeto também inclui um agente de IA autenticado e uma integração opcional, somente para leitura, com o Google Classroom.

> **Status:** projeto em desenvolvimento. A execução local é documentada; antes de uma publicação pública, ainda são necessárias etapas adicionais de segurança, operação e privacidade.

## Conteúdo

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e execução](#instalação-e-execução)
- [Configuração](#configuração)
- [Primeiro acesso](#primeiro-acesso)
- [Agente de IA](#agente-de-ia)
- [Integração com Google Classroom](#integração-com-google-classroom)
- [Testes e validações](#testes-e-validações)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Limitações conhecidas](#limitações-conhecidas)
- [Documentação complementar](#documentação-complementar)

## Visão geral

O EduTrack AI combina planejamento acadêmico e acompanhamento do estudo com métricas calculadas a partir dos registros do usuário. A aplicação diferencia a demonstração local das contas reais: os exemplos da demonstração não são importados automaticamente para uma conta, e os dados de contas autenticadas ficam no banco gerenciado pelo servidor.

A arquitetura segue este fluxo:

```text
Navegador
   │
   ▼
Servidor Node.js / API
   ├── Autenticação e autorização por conta
   ├── PostgreSQL (PGlite local ou PostgreSQL convencional)
   ├── Relatórios: Python + Pandas
   ├── Agente de IA: provider configurado no servidor
   └── Integração opcional com Google Classroom
```

O navegador e o agente não recebem uma conexão direta com o banco de dados. Para a instalação local, o projeto usa PGlite no processo de backend e não exige Docker. Também é possível apontar a aplicação para uma instância convencional de PostgreSQL por meio de `DATABASE_URL`.

## Funcionalidades

### Planejamento e acompanhamento acadêmico

- Cadastro e gerenciamento de disciplinas e tarefas.
- Tarefas com status, prioridade, dificuldade, prazo e estimativa de duração.
- Dashboard com indicadores, filtros por período e disciplina, foco em atrasos e prioridades e acompanhamento da meta semanal.
- Calendário com filtros, navegação por mês/agenda, tarefas com prazo e sessões de estudo registradas.
- Cronômetro para sessões de estudo, com continuidade entre páginas no mesmo dispositivo.
- Notificações internas de tarefas próximas ou atrasadas, com controle de leitura e preferências.
- Histórico de criação e de alterações relevantes nas tarefas.
- Preferências de perfil, tema claro/escuro/sistema e interface responsiva.

### Relatórios e dados

- Relatórios para períodos de 7, 30 ou 90 dias, com filtro por disciplina.
- Comparação entre períodos equivalentes, distribuição de atividades, pendências, atrasos e carga estimada.
- Gráficos interativos, exportação CSV e impressão ou salvamento em PDF pelo navegador.
- Exportação dos registros da conta em JSON, sem incluir senhas ou tokens.
- Processamento das métricas de contas autenticadas com Python e Pandas, recebendo apenas os dados necessários para os cálculos.

### Contas e autenticação

- Cadastro, login, confirmação de e-mail, reenvio de confirmação, recuperação de senha e logout.
- Sessões mantidas por cookies `HttpOnly`.
- Isolamento de dados por usuário e verificação de propriedade dos registros no backend.
- Controle de concorrência para evitar que uma alteração de outra aba seja sobrescrita silenciosamente.

### Agente de IA

- Chat autenticado em `/agente`, usando `POST /api/ai/chat`.
- Provider de modelo configurado no servidor, sem expor chaves de API ao frontend.
- Tools permitidas explicitamente, com validação de argumentos, verificação de propriedade dos dados e auditoria das execuções.
- Conversas e mensagens persistidas no backend.

A disponibilidade do agente depende de configurar um provider e sua credencial. A demonstração `/demo` permanece separada e não envia seus exemplos locais a um modelo.

### Integrações

A página `/integracoes` apresenta um catálogo de integrações educacionais. Atualmente, o Google Classroom oferece conexão OAuth por conta e importação manual de atividades publicadas, após configuração e consentimento. Microsoft Teams for Education, Moodle, Canvas LMS, Notion e Google Agenda aparecem como opções planejadas; a presença no catálogo não significa que estejam conectados.

## Tecnologias

| Área | Tecnologias |
| --- | --- |
| Linguagem e runtime | TypeScript, JavaScript, Node.js 22+ |
| Aplicação web | Next.js 16, React 19 |
| Interface | Tailwind CSS, Radix/Shadcn, React Hook Form, Zod |
| Gráficos e ícones | Recharts, Lucide React |
| Persistência | PostgreSQL, PGlite e Drizzle ORM |
| Análises | Python e Pandas |
| E-mail | Nodemailer e SMTP opcional |
| Testes | `node:test` e `unittest` para Python |

As versões instaladas e os comandos disponíveis estão definidos em `package.json` e `package-lock.json`.

## Pré-requisitos

- Node.js **22.15 ou superior**.
- npm, incluído com o Node.js.
- Python 3 com suporte às dependências listadas em `analytics/requirements.txt` para os relatórios.
- Acesso à internet para instalar dependências; uma conta/provedor de IA e credenciais Google só são necessários para habilitar essas integrações.

Não é necessário instalar Docker ou um servidor PostgreSQL para a configuração local padrão.

## Instalação e execução

### 1. Clonar o repositório

```bash
git clone https://github.com/Wtvitin/edutrack-ai.git
cd edutrack-ai
```

### 2. Instalar dependências

```bash
npm ci
python -m pip install -r analytics/requirements.txt
```

No Windows, se `python` não apontar para um interpretador com Pandas, use o Python Launcher (`py -3`) ou defina `PYTHON_BIN` com o caminho completo do executável que tem as dependências instaladas.

### 3. Criar o arquivo de ambiente

No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

No macOS/Linux:

```bash
cp .env.example .env.local
```

Revise os valores em `.env.local`. Não coloque credenciais reais no repositório.

### 4. Compilar e iniciar

Para compilar e executar a versão de produção local:

```bash
npm run build
npm start
```

Abra **http://localhost:4173** no navegador.

Para executar em modo de desenvolvimento:

```bash
npm run dev
```

O servidor de entrada usa a porta `4173` por padrão e encaminha as páginas para a interface interna, normalmente na porta `4174`. Use a URL de entrada da aplicação; a porta interna da interface não substitui a API autenticada.

> **Banco local:** os dados ficam em `.local/postgres`. Não inicie duas instâncias da aplicação apontando para a mesma pasta de dados. Antes de mover ou substituir a instalação, pare o servidor e faça backup do banco.

## Configuração

O arquivo `.env.example` documenta as variáveis básicas. As principais são:

| Variável | Finalidade |
| --- | --- |
| `APP_ORIGIN` | Origem pública autorizada pela aplicação; padrão local `http://localhost:4173`. |
| `PORT` | Porta do servidor de entrada; padrão `4173`. |
| `UI_PORT` | Porta interna da interface; padrão `4174`. |
| `MAIL_MODE` | `local` para testes sem envio externo ou `smtp` para configurar envio real. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Configuração de e-mail quando SMTP estiver habilitado. |
| `DATABASE_URL` | URL de um PostgreSQL convencional. Vazia, utiliza o banco PGlite embutido. |
| `DATA_DIR` | Diretório do banco local; padrão `.local/postgres`. |
| `PYTHON_BIN` | Executável Python usado pelo backend de análises. |

### E-mail

Por padrão, `MAIL_MODE=local` permite testar confirmação de e-mail e recuperação de senha sem enviar mensagens para fora da máquina. Para utilizar Gmail/SMTP, configure as variáveis SMTP e siga o [guia de configuração do Gmail](docs/configurar-gmail.md). Use uma senha de app quando exigida pelo provedor; nunca use ou publique a senha normal da sua conta Google.

### PostgreSQL convencional

Para usar um servidor PostgreSQL externo/local, configure `DATABASE_URL` em `.env.local`. Deixe-a vazia para usar o PGlite embutido. Mantenha credenciais e URLs de conexão fora do controle de versão.

### Google Classroom

A integração exige configurar um cliente OAuth de aplicação web no Google Cloud, habilitar a API do Classroom e cadastrar o callback correspondente à origem configurada:

```text
<APP_ORIGIN>/api/integrations/google/callback
```

Configure `GOOGLE_CLASSROOM_CREDENTIALS_FILE` para apontar para o arquivo de credenciais mantido fora do repositório. Em produção, a chave estável de criptografia dos tokens deve ser fornecida por `CLASSROOM_TOKEN_ENCRYPTION_KEY`. Consulte o [guia de integração](docs/integrar-classroom.md) para escopos, consentimento, proteção de tokens e limitações.

## Primeiro acesso

1. Inicie a aplicação e abra [http://localhost:4173/cadastro](http://localhost:4173/cadastro).
2. Crie uma conta de teste.
3. Com `MAIL_MODE=local`, abra [http://localhost:4173/emails-locais](http://localhost:4173/emails-locais) e utilize o link de confirmação exibido.
4. Acesse [http://localhost:4173/login](http://localhost:4173/login) e entre com a conta confirmada.
5. Para conhecer a experiência com dados fictícios, abra `/demo`. Esses dados são independentes da conta real.

A confirmação de e-mail é obrigatória para entrar com uma nova conta. A caixa local de e-mails é exclusiva para testes e não deve ser exposta à rede.

## Agente de IA

O agente real é acessado por uma conta autenticada em `/agente`. A escolha do provider e todas as credenciais são feitas no backend. Configure apenas **um provider por vez** por meio de `LLM_PROVIDER` e inclua a chave correspondente no arquivo de ambiente local.

### Google Gemini (padrão)

```dotenv
LLM_PROVIDER=google-gemini
LLM_MODEL=gemini-2.5-flash
GOOGLE_API_KEY=sua_chave_aqui
```

Quando `LLM_PROVIDER` não é definido, o runtime usa Google Gemini por padrão.

### Groq (opcional)

```dotenv
LLM_PROVIDER=groq
GROQ_API_KEY=sua_chave_aqui
GROQ_MODEL=nome_do_modelo_disponibilizado_na_sua_conta
```

`GROQ_BASE_URL` e `GROQ_TIMEOUT_MS` podem ser definidos quando necessário. O modelo Groq deve ser configurado explicitamente; o provider não deve ser trocado silenciosamente em caso de falha.

### OpenRouter (compatibilidade explícita)

```dotenv
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sua_chave_aqui
LLM_MODEL=nome_do_modelo_disponivel_no_openrouter
```

`LLM_FALLBACK_MODEL` e `LLM_TIMEOUT_MS` também podem ser configurados quando aplicáveis ao provider escolhido. Consulte `SPEC.md` e `server/` para as regras de execução atuais. Nunca coloque chaves de IA em variáveis públicas do frontend nem as envie em commits ou logs.

O agente utiliza Tools registradas e validadas no servidor. A identidade é derivada da sessão autenticada, e os registros acessados devem pertencer à conta correspondente. O uso do agente pode transmitir ao provider configurado o conteúdo necessário para responder à solicitação; considere isso ao escolher o provider e os dados enviados.

## Integração com Google Classroom

Depois de configurar o OAuth e conectar a conta pela página `/integracoes`, o usuário pode selecionar até 20 turmas ativas e iniciar a importação manual das atividades publicadas disponíveis.

- A integração é de leitura: não envia trabalhos, não lê notas e não modifica cursos ou atividades no Google Classroom.
- A sincronização utiliza identificadores externos para evitar duplicações.
- Alterações locais em campos protegidos pela edição do usuário são preservadas durante sincronizações subsequentes.
- A desconexão revoga o acesso e remove os tokens locais, preservando os registros importados no EduTrack.

O funcionamento real depende do consentimento, dos escopos e das credenciais OAuth configuradas; a tela de catálogo sozinha não conecta serviços.

## Testes e validações

Execute a partir da raiz do projeto:

```bash
npm run typecheck
npm run lint
npm test
python -m unittest discover -s analytics -p "test_*.py"
npm run build
```

Para testar especificamente a integração com o Classroom e o catálogo:

```bash
node --test tests/classroom.test.mjs tests/integrations.test.mjs
```

Os testes automatizados não substituem um teste com credenciais reais do provedor de e-mail, do modelo de IA ou do Google Classroom. A validação real dessas integrações depende da configuração externa.

## Estrutura do projeto

```text
.
├── app/                  # Páginas e rotas da aplicação Next.js
├── components/           # Componentes de interface, incluindo os do EduTrack
├── server/               # Servidor Node, API, autenticação, banco, IA e integrações
├── database/             # Migrações SQL versionadas
├── db/                   # Camada de acesso e definição do banco
├── drizzle/              # Metadados de migrações Drizzle
├── analytics/             # Preparação de métricas e testes Python/Pandas
├── tests/                 # Testes automatizados da aplicação
├── docs/                  # Arquitetura, guias e dicionário de dados
├── openspec/              # Especificações de funcionalidades e mudanças
├── public/                # Recursos estáticos
├── scripts/               # Scripts de instalação e build
├── SPEC.md                # Especificações técnicas do agente de IA
├── context.md             # Contexto operacional do projeto
├── package.json           # Dependências e scripts npm
└── .env.example           # Modelo de configuração local
```

## Segurança e privacidade

- Senhas são armazenadas como hashes; tokens de confirmação e recuperação têm uso limitado e expiração.
- A API deriva a identidade da sessão e valida a propriedade dos registros no backend.
- O processamento analítico de contas utiliza apenas os dados necessários aos cálculos; Python não acessa diretamente o banco.
- O arquivo JSON exportado não inclui senhas ou tokens.
- A demonstração usa dados locais fictícios e não envia seus exemplos ao modelo de IA.
- Arquivos `.env*`, banco local, credenciais OAuth, chaves de IA e tokens não devem ser enviados ao Git.

**Atenção:** a caixa `/emails-locais` expõe links úteis para contas de teste e deve permanecer restrita ao desenvolvimento local. O próprio projeto a recusa em modo de produção. Antes de disponibilizar o sistema publicamente, faça uma revisão de segurança e privacidade e configure HTTPS, backups testados, monitoramento, limites de requisição compartilhados e uma estratégia confiável para entrega de e-mails.

## Limitações conhecidas

- Teams, Moodle, Canvas, Notion e Google Agenda ainda são integrações planejadas.
- As notificações atuais são internas e não funcionam como push em segundo plano com a aplicação fechada.
- O Classroom usa sincronização manual; a sincronização automática ainda não está implementada.
- O agente depende de uma credencial válida do provider configurado. Streaming, RAG/memória semântica, filas e rate limiting distribuído permanecem fora do escopo implementado descrito nas especificações atuais.
- O projeto ainda não deve ser tratado como serviço pronto para operação pública sem as etapas adicionais de produção citadas acima.

## Documentação complementar

- [`docs/arquitetura.md`](docs/arquitetura.md) — arquitetura, API, segurança e regras de cálculo.
- [`docs/integrar-classroom.md`](docs/integrar-classroom.md) — configuração e limites da integração com Google Classroom.
- [`docs/configurar-gmail.md`](docs/configurar-gmail.md) — configuração de envio de e-mail via Gmail/SMTP.
- [`docs/data-dictionary.json`](docs/data-dictionary.json) — dicionário de dados incorporado ao projeto.
- [`SPEC.md`](SPEC.md) — contratos e invariantes do agente de IA.
- [`openspec/`](openspec/) — especificações das funcionalidades e mudanças.

---

Desenvolvido como projeto de organização e acompanhamento acadêmico, com foco em separação de dados por conta, cálculos analíticos determinísticos e integrações controladas pelo backend.
