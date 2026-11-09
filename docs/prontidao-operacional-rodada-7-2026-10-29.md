# EduTrack AI — prontidão operacional e homologação externa

Atualizado em 29/10/2026. Este documento prepara uma homologação; não confirma integrações reais nem autoriza chamadas externas com credenciais.

## Condições de entrada

- Implantar primeiro em ambiente de homologação separado, com contas e dados de teste autorizados. Não importar o banco real para os testes de carga.
- Executar Node compatível com `package.json`, Python com Pandas e a instalação travada em `package-lock.json`. Validar a imagem Linux escolhida; os ensaios atuais usam Windows/PGlite.
- Configurar um serviço HTTP persistente: `npm run build` antes de `npm start`; `PORT` vem do ambiente. O processo público aceita a porta em `0.0.0.0`; a interface Next permanece em loopback e é encaminhada pelo backend. Desenvolvimento local permanece restrito a loopback.
- Usar HTTPS e `APP_ORIGIN` exatamente igual à origem pública, sem caminho, credenciais ou parâmetros. Confirmar cookies HttpOnly, SameSite=Lax e Secure. Aplicar limites de requisição no proxy sem confiar cegamente em X-Forwarded-For.
- Definir segredos apenas no gerenciador de secrets do servidor. Cada navegador utiliza o mesmo backend; não precisa configurar SMTP, Resend, PostgreSQL ou Gemini no computador do estudante.

## PostgreSQL, migrações e recuperação

- Usar PostgreSQL persistente e conexão TLS verificada. Confirmar limites de conexões do pool e compatibilidade da versão escolhida com as chaves compostas e `ON DELETE SET NULL (coluna)`.
- Aplicar migrações 001–013 em uma cópia descartável antes de liberar o ambiente. O iniciador atual as aplica na abertura do banco: antes de múltiplas réplicas, separar a etapa de migração e adicionar coordenação compartilhada para evitar execução simultânea.
- A migração 013 é aditiva: trava por conversa e índices. A criação transacional de índices pode bloquear tabelas grandes; medir janela de manutenção. Não há comando automático de reversão que apague dados.
- Manter backups criptografados e política definida de RPO/RTO; ensaiar restauração em banco separado e registrar o tempo e a conferência de integridade. Dump SQL e recuperação por WAL/PITR são estratégias documentadas pelo [PostgreSQL](https://www.postgresql.org/docs/current/backup.html).
- Fazer rollback de aplicação usando um artefato anterior que seja compatível com o esquema atual. Não executar os scripts destrutivos legados de `database/rollback/` sobre um banco com Laboratório/flashcards. Se uma migração falhar, investigar a transação antes de nova tentativa; para correções já aplicadas, preferir migração corretiva aditiva. Restaurar backup somente com plano explícito e ambiente isolado validado.

## Resend e SMTP

A aplicação já possui modos `local`, `resend` e `smtp`. Na hospedagem, configurar uma vez no servidor:

- `MAIL_MODE=resend`, `RESEND_API_KEY` e `MAIL_FROM` com remetente autorizado. Verificar domínio e destinatários permitidos no painel do serviço antes da homologação.
- Para SMTP, preservar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `MAIL_FROM`. No Gmail, utilizar credencial de aplicativo quando exigida pela conta; não copiar senha pessoal para clientes.
- Desabilitar caixa local em ambiente publicado. `/api/dev/mail` é somente ferramenta de desenvolvimento; não deve ficar disponível na hospedagem.
- Após autorização explícita: cadastrar conta descartável, receber confirmação, reenviar, testar expiração/uso único, recuperar senha e comprovar revogação das sessões antigas. Conferir URLs HTTPS dos e-mails em dois dispositivos. Não registrar tokens, corpos, links completos ou chaves em logs.
- Separar falha HTTP, timeout, remetente não autorizado, domínio pendente e bloqueio do destinatário. Confirmar no painel do provedor o evento de entrega; HTTP de aceitação sozinho não comprova chegada à caixa de entrada.

## Google Classroom

- Manter somente a integração Google Classroom na interface. O catálogo legado de propostas foi preservado apenas no contrato estático; não representa conexões funcionais.
- Habilitar Classroom API no projeto correto do Google Cloud. Usar cliente OAuth Web, JSON montado como secret e callback público exato `APP_ORIGIN/api/integrations/google/callback`.
- Revisar público interno/externo, usuários de teste, consentimento e permissões institucionais. Confirmar os escopos definidos em `server/classroom.mjs`; são de leitura. A conexão não autoriza editar ou entregar trabalhos no Google.
- Configurar `CLASSROOM_TOKEN_ENCRYPTION_KEY` estável de 32 bytes em base64, protegida pelo servidor. Guardar cópia segura para recuperação; trocar a chave sem plano impede descriptografar tokens existentes.
- Após autorização explícita: conectar conta de teste, selecionar turma, importar duas vezes, verificar duplicação, editar uma tarefa local, sincronizar e comprovar preservação da edição; renovar token, revogar consentimento e desconectar. Conferir também a observação de entrega independente da conclusão local.
- Ensaiar quedas/429/403 e reconexão sem repetir importações parcialmente. As simulações atuais não comprovam as permissões reais da instituição, nem o consentimento publicado do projeto Cloud.

## Gemini e demais provedores

- Gemini permanece como padrão. Definir modelo e credencial no servidor; Groq e OpenRouter somente mediante seleção explícita. Não ativar fallback implícito para contornar quota.
- Validar o modelo disponível e os limites no projeto correto do AI Studio antes de testes reais. Os limites são por projeto e variam por modelo/tier, conforme a [documentação do Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).
- Após autorização explícita, executar um roteiro pequeno e com orçamento definido: texto, leitura de tarefas, criação autorizada, continuidade após Tool Call, quiz, simulado e flashcards. Conferir bloqueios de segurança separadamente de falhas temporárias.
- Não considerar as simulações como medida de precisão factual ou consumo real. Contagens técnicas internas medem operações e latência; a cobrança, os tokens e a disponibilidade precisam ser conferidos no provedor durante a homologação autorizada.
- Uma conversa admite um turno ativo. A trava persistida expira após 15 minutos caso o processo termine inesperadamente; não fica uma transação SQL aberta durante a chamada ao modelo. Registrar falhas de liberação sem repetir ações acadêmicas já confirmadas.

## Observabilidade, privacidade e limites

- `api.metrics()` expõe agregações técnicas somente ao código do servidor, sem endpoint público. São limitadas em memória e não contêm mensagens, identificadores de usuários ou credenciais. Conectar um coletor interno autenticado antes de produção; definir alertas para erros, latência e disponibilidade.
- Os limites HTTP e o cache de relatórios são locais ao processo. Antes de múltiplas réplicas, implementar rate limiting compartilhado e orçamento por conta/projeto. A trava de conversa usa o banco; ela não substitui controle compartilhado de quota.
- Definir política explícita de retenção para conversas, materiais, respostas, revisões, eventos e backups. O código atual preserva o histórico e não executa limpeza automática; isso evita exclusões indevidas, mas não constitui uma política de retenção pronta.
- Documentar os dados enviados ao provedor, finalidades, acesso do operador e procedimento de solicitação de exclusão/exportação. Revisar o texto público de privacidade com a instituição antes da publicação. Não prometer criptografia integral de todos os dados: tokens OAuth são cifrados; conversas e conteúdos exigem proteção do banco, acesso e backups.
- O contrato atual de salvamento integral aceita até 5.000 tarefas e corpo de 2 MB. O ensaio de 10.000 tarefas é de leitura/carga; gravar esse snapshot é rejeitado sem alteração dos dados. Para contas acima desses limites, planejar escrita granular antes de ampliar a oferta. Não elevar limites sem medir memória, autorização e conflito entre abas.
- Paginação por offset reflete o estado atual. Uma inclusão ou revisão entre páginas pode mudar a ordenação; atualizar a fila ao alterar filtros. Os indicadores são agregados do conjunto completo, e não uma soma apenas dos itens da página.

## Decisão de homologação

Aprovar apenas o ambiente controlado que tiver: regressões locais finais aprovadas, banco descartável restaurável, origem HTTPS, secrets no servidor, logs sem dados sensíveis e responsáveis pelo roteiro definidos. Produção pública continua condicionada aos ensaios reais autorizados, backup/restauração, política de privacidade/retenção e rate limiting compartilhado quando houver múltiplas réplicas.

Nenhum deploy, migração de dados reais, serviço pago ou teste externo autenticado é executado por este documento.
