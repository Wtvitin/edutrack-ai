import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMailer, MailError } from '../server/mail.mjs';

const env = { BREVO_API_KEY: 'mock-key', BREVO_SENDER_EMAIL: 'verified@example.org' };
const input = { to: 'student@example.net', subject: 'Confirmacao', body: 'Ative <sua> conta', link: 'https://example.org/verify?token=fake' };

test('Brevo sends the transactional message using the verified sender', async () => {
  let captured;
  const send = createMailer(null, { mailMode: 'brevo', env }, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 201 };
    },
  });
  await send(input);
  assert.equal(captured.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['api-key'], env.BREVO_API_KEY);
  assert.ok(captured.options.signal);
  assert.deepEqual(JSON.parse(captured.options.body), {
    sender: { name: 'EduTrack AI', email: env.BREVO_SENDER_EMAIL },
    to: [{ email: input.to }],
    subject: input.subject,
    textContent: `${input.body}\n\n${input.link}`,
    htmlContent: `<p>Ative &lt;sua&gt; conta<br><br>${input.link}</p>`,
  });
});

test('Brevo rejects an incomplete configuration before making a request', async () => {
  const send = createMailer(null, { mailMode: 'brevo', env: { BREVO_API_KEY: env.BREVO_API_KEY } }, {
    fetchImpl: async () => assert.fail('Unexpected request'),
  });
  await assert.rejects(send(input), { code: 'mail-not-configured' });
});

test('Brevo errors expose only a generic message and the upstream status code', async () => {
  const send = createMailer(null, { mailMode: 'brevo', env }, {
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(send(input), error => {
    assert.ok(error instanceof MailError);
    assert.equal(error.status, 503);
    assert.equal(error.cause.code, 'brevo-http-403');
    assert.ok(!error.message.includes(env.BREVO_API_KEY));
    assert.ok(!error.message.includes(input.link));
    return true;
  });
});
