# Envio de e-mail pelo Gmail

O Gmail aqui é o remetente dos e-mails transacionais. Isso NÃO implementa "Entrar com Google" nem autoriza acesso ao Classroom.

1. Escolha a conta Gmail remetente. Ative a verificação em duas etapas nela.
2. Crie uma senha de app para EduTrack: https://myaccount.google.com/apppasswords. Algumas contas corporativas/escolares ou com Proteção Avançada não permitem esse recurso. Consulte https://support.google.com/accounts/answer/185833?hl=pt-BR.
3. Edite `.env.local` na raiz do projeto (arquivo ignorado pelo Git):

```dotenv
MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-remetente@gmail.com
SMTP_PASSWORD=senha_de_app_sem_espacos
MAIL_FROM="EduTrack AI <seu-remetente@gmail.com>"
```

Não use a senha normal da conta Google. Não envie a senha de app por chat, nem coloque em código, captura de tela ou GitHub. O backend é o único componente que recebe a credencial.

4. Reinicie o servidor. Cadastre uma conta de teste com um endereço que você controla. Confirme o link recebido; depois teste a recuperação de senha.
5. Falhas de autenticação SMTP: confirme a conta remetente, a senha de app e a política da sua conta. Não desative TLS nem a verificação em duas etapas para contornar o erro.

Configuração SMTP oficial: https://support.google.com/mail/answer/7104828. A porta 465 usa TLS desde o início; a 587 usa STARTTLS obrigatório neste projeto.

Enquanto `MAIL_MODE=local`, nada é enviado ao Gmail: `/emails-locais` mostra as mensagens para testar os fluxos. Essa caixa dá acesso aos links de ativação/recuperação e só é permitida no ambiente de desenvolvimento em loopback. Use dados fictícios. Ela é desativada com envio SMTP ou `NODE_ENV=production`.

Para operação pública, planeje OAuth2 ou um serviço transacional, limites de envio, reentrega, domínio e reputação do remetente. SMTP configurado não significa que a entrega real já foi validada.
