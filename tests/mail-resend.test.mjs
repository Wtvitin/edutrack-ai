import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMailer, MailError } from '../server/mail.mjs';

const env = { RESEND_API_KEY: 'test-key', MAIL_FROM: 'EduTrack <hello@example.org>' };
const input = { to: 'student@example.net', subject: 'Confirmação', body: 'Ative sua conta', link: 'https://example.org/verify?token=fake' };

test('Resend posts transactional email with timeout and server-side credentials', async () => {
  let captured;
  const mail = createMailer(null, { mailMode: 'resend', env }, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200 };
    },
  });
  await mail(input);
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  assert.ok(captured.options.signal);
  assert.deepEqual(JSON.parse(captured.options.body).to, ['student@example.net']);
});

test('Resend rejection is surfaced without leaking credentials', async () => {
  const mail = createMailer(null, { mailMode: 'resend', env }, {
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(mail(input), e => e instanceof MailError && e.status === 503);
});

test('Resend transport rejects incomplete configuration', async () => {
  const mail = createMailer(null, { mailMode: 'resend', env: { MAIL_FROM: env.MAIL_FROM } }, { fetchImpl: async () => { throw Error('should not fetch'); } });
  await assert.rejects(mail(input), e => e instanceof MailError && e.code === 'mail-not-configured');
});
