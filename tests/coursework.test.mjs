import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openDatabase} from '../server/database.mjs';
import {createAPI} from '../server/api.mjs';
import {openApiSpec} from '../server/openapi.mjs';

test('academic REST, Python search/progress and PDF remain isolated per account', async () => {
  const db = await openDatabase({directory: 'memory://', url: ''});
  let api;
  const server = createServer((req, res) => api(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  api = createAPI(db, {origin, local: true, mailMode: 'local'});
  let cookie = '';
  async function call(path, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(origin + path, {method, headers: {Origin: origin, 'Content-Type': 'application/json', Cookie: cookie}, body: body ? JSON.stringify(body) : undefined});
    const bytes = Buffer.from(await response.arrayBuffer());
    return {status: response.status, body: response.headers.get('content-type')?.startsWith('application/pdf') ? bytes : JSON.parse(bytes.toString()), cookie: response.headers.get('set-cookie')?.split(';')[0], type: response.headers.get('content-type')};
  }
  async function account(email) {
    cookie = '';
    await call('/api/auth/register', {name: 'Conta de teste acadêmico', email, password: 'coursework-test-123'});
    const token = new URL((await call('/api/dev/mail')).body.messages.find(mail => mail.recipient === email).link).searchParams.get('token');
    assert.equal((await call('/api/auth/verify', {token})).status, 200);
    const login = await call('/api/auth/login', {email, password: 'coursework-test-123'});
    assert.equal(login.status, 200);
    cookie = login.cookie;
    return cookie;
  }
  try {
    for (const path of ['/api/subjects', '/api/subjects/search', '/api/progress', '/api/reports/download']) assert.equal((await call(path)).status, 401);
    const ownerCookie = await account('coursework-owner@example.test');
    let state = (await call('/api/data')).body;
    const created = await call('/api/subjects', {revision: state.revision, name: 'Estatística', teacher: 'Professor de demonstração', hours: 80});
    assert.equal(created.status, 201);
    const first = created.body.subject;
    assert.equal(first.hours, 80);
    assert.equal((await call('/api/subjects', {revision: state.revision, name: 'Conflito'})).status, 409);
    const second = await call('/api/subjects', {revision: created.body.revision, name: 'SQL'});
    assert.equal(second.status, 201);
    const late = second.body.subject;
    state = (await call('/api/data')).body;
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
    const yesterday = new Date(today + 'T12:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    for (const [subjectId, done, due] of [[first.id, true, today], [first.id, false, today], [late.id, false, yesterday.toISOString().slice(0, 10)]]) state.data.tasks.push({id: crypto.randomUUID(), title: 'Tarefa de demonstração', subjectId, due, done, status: done ? 'COMPLETED' : 'TODO', priority: 'normal', description: ''});
    assert.equal((await call('/api/data', state, 'PUT')).status, 200);
    const progress = await call('/api/progress?subject=' + first.id);
    assert.equal(progress.status, 200);
    assert.deepEqual(progress.body, {completed: 1, total: 2, percentage: 50});
    const search = await call('/api/subjects/search?q=ESTATISTICA&overdue=true');
    assert.equal(search.status, 200);
    assert.deepEqual(new Set(search.body.items.map(subject => subject.id)), new Set([first.id, late.id]));
    assert.equal((await call('/api/subjects/search?overdue=maybe')).status, 400);
    const link = await call('/api/reports/generate', {subject: first.id});
    assert.equal(link.status, 200);
    const pdf = await call(link.body.url);
    assert.equal(pdf.status, 200); assert.equal(pdf.type, 'application/pdf'); assert.ok(pdf.body.subarray(0, 5).equals(Buffer.from('%PDF-')));
    state = (await call('/api/data')).body;
    const patched = await call('/api/subjects/' + first.id, {revision: state.revision, teacher: 'Professor atualizado'}, 'PATCH');
    assert.equal(patched.status, 200); assert.equal(patched.body.subject.hours, 80);
    const legacy = (await call('/api/data')).body;
    for (const subject of legacy.data.subjects) {delete subject.teacher; delete subject.hours;}
    assert.equal((await call('/api/data', legacy, 'PUT')).status, 200);
    const preserved = await call('/api/subjects/' + first.id);
    assert.equal(preserved.body.subject.teacher, 'Professor atualizado'); assert.equal(preserved.body.subject.hours, 80);
    assert.equal((await call('/api/subjects/' + first.id, {revision: preserved.body.revision}, 'DELETE')).status, 409);
    const empty = await call('/api/subjects', {revision: preserved.body.revision, name: 'Sem tarefas'});
    assert.equal((await call('/api/progress?subject=' + empty.body.subject.id)).body.percentage, 0);
    assert.equal((await call('/api/subjects/' + empty.body.subject.id, {revision: empty.body.revision}, 'DELETE')).status, 200);
    await account('coursework-other@example.test');
    assert.equal((await call('/api/subjects/' + first.id)).status, 404);
    assert.equal((await call('/api/subjects/' + first.id, {revision: 0, name: 'Intrusão'}, 'PATCH')).status, 404);
    assert.equal((await call('/api/subjects/' + first.id, {revision: 0}, 'DELETE')).status, 404);
    assert.equal((await call('/api/progress?subject=' + first.id)).status, 404);
    assert.equal((await call('/api/reports/generate', {subject: first.id})).status, 404);
    assert.equal((await call(link.body.url)).status, 404);
    assert.deepEqual((await call('/api/subjects/search?q=ESTATISTICA&overdue=true')).body.items, []);
    cookie = ownerCookie;
    if (process.env.COURSEWORK_EVIDENCE_DIR) {
      await mkdir(process.env.COURSEWORK_EVIDENCE_DIR, {recursive: true});
      await writeFile(join(process.env.COURSEWORK_EVIDENCE_DIR, 'relatorio_desempenho_teste.pdf'), pdf.body);
      await writeFile(join(process.env.COURSEWORK_EVIDENCE_DIR, 'fluxo_api.json'), JSON.stringify({dataOrigin: 'Disposable integration-test database; fictional data', progress: progress.body, search: search.body, pdf: {status: pdf.status, contentType: pdf.type, bytes: pdf.body.length}, isolation: 'Foreign reads, updates, deletes, progress and reports rejected'}, null, 2));
    }
  } finally {await new Promise(resolve => server.close(resolve)); await db.close();}
});

test('OpenAPI exposes required academic REST and Python report routes', () => {
  for (const [path, methods] of Object.entries({'/api/subjects': ['get', 'post'], '/api/subjects/{id}': ['get', 'patch', 'delete'], '/api/subjects/search': ['get'], '/api/progress': ['get'], '/api/reports/generate': ['post'], '/api/reports/download': ['get']})) for (const method of methods) assert.ok(openApiSpec.paths[path][method]);
});
