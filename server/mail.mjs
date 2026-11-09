import nodemailer from 'nodemailer';
export class MailError extends Error {
  constructor(message, { code = 'mail-delivery-failed', mailMode, recipientDomain, cause } = {}) {
    super(message, { cause });
    this.name = 'MailError';
    this.code = code;
    this.status = 503;
    this.mailMode = mailMode;
    this.recipientDomain = recipientDomain;
  }
}

const domainOf = email => String(email).split('@')[1]?.toLowerCase() || 'unknown';

export function createMailer(db, config, dependencies = {}) {
  const env = config.env || process.env;
  const mailMode = String(config.mailMode || 'local').toLowerCase();
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtp = mailMode === 'smtp' ? (dependencies.smtpTransport || nodemailer.createTransport({
    host: env.SMTP_HOST, port: smtpPort,
    secure: smtpPort === 465, requireTLS: smtpPort !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, socketTimeout: 15000,
  })) : null;
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  return async function sendMail({ to, subject, body, link }) {
    const recipientDomain = domainOf(to);
    try {
      if (mailMode === 'local' && config.local) {
        await db.query('INSERT INTO development_mail(recipient,subject,body,link) VALUES($1,$2,$3,$4)', [to, subject, body, link]);
      } else if (mailMode === 'smtp' && smtp) {
        const result = await smtp.sendMail({ from: env.MAIL_FROM, to, subject, text: `${body}\n\n${link}` });
        if (Array.isArray(result?.accepted) && !result.accepted.length) throw new Error('No recipient accepted.');
      } else if (mailMode === 'resend' && env.RESEND_API_KEY && env.MAIL_FROM && typeof fetchImpl === 'function') {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text: `${body}\n\n${link}` }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          const failure = new Error('Resend rejected mail delivery.');
          failure.code = `resend-http-${response.status}`;
          throw failure;
        }
      } else {
        throw new MailError('O serviço de e-mail não está configurado.', { code: 'mail-not-configured', mailMode, recipientDomain });
      }
    } catch (cause) {
      if (cause instanceof MailError) {
        console.error('Mail operation failed:', cause.code, cause.mailMode || mailMode, cause.recipientDomain || recipientDomain);
        throw cause;
      }
      console.error('Mail operation failed:', mailMode, recipientDomain, cause?.code || cause?.name || 'unknown');
      throw new MailError('Não foi possível enviar o e-mail agora. Tente solicitar um novo link em alguns instantes.', { mailMode, recipientDomain, cause });
    }
  };
}
