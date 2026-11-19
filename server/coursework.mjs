import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readData, saveData} from './data.mjs';

const failure = (message, status = 400) => Object.assign(new Error(message), {status});
const revision = z.number().int().nonnegative();
const subjectFields = {
  name: z.string().trim().min(1).max(60),
  color: z.enum(['blue', 'purple', 'green', 'rose', 'orange']),
  description: z.string().max(200),
  teacher: z.string().trim().max(120),
  hours: z.number().int().min(0).max(10000),
};
const createSubject = z.object({revision, name: subjectFields.name, color: subjectFields.color.default('blue'), description: subjectFields.description.default(''), teacher: subjectFields.teacher.default(''), hours: subjectFields.hours.default(0)}).strict();
const patchSubject = z.object({revision, ...Object.fromEntries(Object.entries(subjectFields).map(([key, schema]) => [key, schema.optional()]))}).strict().refine(value => Object.keys(value).length > 1);

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw failure('Confira os campos e a revisão informados.');
  return result.data;
}

export function runCourseworkPython(script, payload, {python = process.env.PYTHON_BIN || 'python', binary = false, timeoutMs = 15000} = {}) {
  if (!['calculate_progress.py', 'search_subjects.py', 'generate_report.py'].includes(script)) throw new Error('Unknown coursework script');
  const file = fileURLToPath(new URL('../analytics/' + script, import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-X', 'utf8', file], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    const chunks = [];
    let size = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {child.kill(); finish(failure('O processamento Python excedeu o tempo limite.', 503));}, timeoutMs);
    child.on('error', () => finish(failure('Python indisponível. Confira PYTHON_BIN e as dependências.', 503)));
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 8e6) {child.kill(); finish(failure('Relatório acima do limite permitido.', 503));}
      else chunks.push(chunk);
    });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish(failure('Não foi possível processar os dados em Python. Confira as dependências.', 503));
      const bytes = Buffer.concat(chunks);
      try {
        if (binary && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF');
        finish(null, binary ? bytes : JSON.parse(bytes.toString('utf8')));
      } catch {finish(failure('O processamento retornou um resultado inválido.', 503));}
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function handleCoursework({db, user, req, res, path, input, respond}) {
  const subjectMatch = path.match(/^\/api\/subjects(?:\/([0-9a-f-]{36}))?$/i);
  const search = path === '/api/subjects/search';
  const progress = path === '/api/progress';
  const report = ['/api/reports/generate', '/api/reports/download'].includes(path);
  if (!subjectMatch && !search && !progress && !report) return false;
  if ((search || progress) && req.method !== 'GET' || report && req.method !== (path.endsWith('generate') ? 'POST' : 'GET')) throw failure('Método não permitido.', 405);
  if (subjectMatch && !['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) throw failure('Método não permitido.', 405);
  const snapshot = await readData(db, user);
  const params = new URL(req.url, 'http://localhost').searchParams;
  const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
  const safe = {subjects: snapshot.data.subjects.map(({id, name}) => ({id, name})), tasks: snapshot.data.tasks.map(({subjectId, due, done, status}) => ({subjectId, due, done, status}))};

  if (search) {
    const query = params.get('q') || '';
    if (query.length > 120 || params.has('overdue') && !['true', 'false'].includes(params.get('overdue'))) throw failure('Filtro inválido.');
    respond(200, await runCourseworkPython('search_subjects.py', {data: safe, today, query, overdue: params.get('overdue') === 'true'}));
  } else if (progress || report) {
    const selected = path.endsWith('generate') ? parse(z.object({subject: z.string().uuid().or(z.literal('all')).default('all')}).strict(), input).subject : params.get('subject') || 'all';
    if (selected !== 'all' && !snapshot.data.subjects.some(subject => subject.id === selected)) throw failure('Disciplina não encontrada.', 404);
    if (progress) {
      respond(200, await runCourseworkPython('calculate_progress.py', {tasks: safe.tasks.filter(task => selected === 'all' || task.subjectId === selected)}));
    } else if (path.endsWith('generate')) {
      // A same-origin URL, protected by the account session, avoids public files.
      respond(200, {url: '/api/reports/download?subject=' + encodeURIComponent(selected)});
    } else {
      const pdf = await runCourseworkPython('generate_report.py', {today, subject: selected, data: safe}, {binary: true});
      res.writeHead(200, {'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="edutrack-performance.pdf"', 'Content-Length': pdf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      res.end(pdf);
    }
  } else {
    const id = subjectMatch[1];
    const existing = id ? snapshot.data.subjects.find(subject => subject.id === id) : null;
    if (id && !existing) throw failure('Disciplina não encontrada.', 404);
    if (req.method === 'GET') respond(200, id ? {subject: existing, revision: snapshot.revision} : {items: snapshot.data.subjects, revision: snapshot.revision});
    else if (req.method === 'POST') {
      if (id) throw failure('Método não permitido.', 405);
      const {revision, ...fields} = parse(createSubject, input);
      const subject = {id: randomUUID(), ...fields};
      const result = await saveData(db, user, {...snapshot, revision, data: {...snapshot.data, subjects: [...snapshot.data.subjects, subject]}});
      respond(201, {subject, ...result});
    } else if (req.method === 'PATCH') {
      if (!id) throw failure('Informe a disciplina.', 400);
      const {revision, ...fields} = parse(patchSubject, input);
      const subject = {...existing, ...fields};
      const result = await saveData(db, user, {...snapshot, revision, data: {...snapshot.data, subjects: snapshot.data.subjects.map(row => row.id === id ? subject : row)}});
      respond(200, {subject, ...result});
    } else {
      if (!id) throw failure('Informe a disciplina.', 400);
      const info = parse(z.object({revision}).strict(), input);
      if (snapshot.data.tasks.some(task => task.subjectId === id) || snapshot.data.sessions.some(session => session.subjectId === id)) throw failure('Reatribua as tarefas e sessões antes de excluir a disciplina.', 409);
      const result = await saveData(db, user, {...snapshot, revision: info.revision, data: {...snapshot.data, subjects: snapshot.data.subjects.filter(row => row.id !== id)}});
      respond(200, {ok: true, ...result});
    }
  }
  return true;
}
