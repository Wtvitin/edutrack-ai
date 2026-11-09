import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';

// Separate from analytics.mjs: the existing Agent keeps its current implementation.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const pythonCommands = new Map();

function splitCommand(value) {
  return String(value).trim().match(/"[^"]+"|'[^']+'|\S+/g)?.map(part => part.replace(/^['"]|['"]$/g, '')) || [];
}

function commandCandidates(configured) {
  // PYTHON_BIN can be a literal executable path containing spaces, not a shell command.
  const executable = String(configured || '').trim();
  if (executable && existsSync(executable)) return [{file:executable,args:[]}];
  const parts = splitCommand(configured || 'python');
  const first = parts[0] || 'python';
  const configuredCommand = {file: first, args: parts.slice(1)};
  const generic = ['python', 'python.exe', 'python3', 'python3.exe'].includes(first.toLowerCase());
  if (process.platform !== 'win32' || !generic) return [configuredCommand];
  return [configuredCommand, {file: 'py', args: ['-3']}];
}

function probePython(command) {
  return new Promise(resolve => {
    const child = spawn(command.file, [...command.args, '-c', 'import pandas; print(pandas.__version__)'], {cwd: projectRoot, windowsHide: true, timeout:15000, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => {stdout += chunk;});
    child.stderr.on('data', chunk => {stderr += chunk;});
    child.on('error', error => resolve({...command, error, stderr}));
    child.on('close', code => resolve({...command, code, stdout: stdout.trim(), stderr: stderr.trim()}));
  });
}

async function resolvePython(configured) {
  const key = configured || 'python';
  if (!pythonCommands.has(key)) {
    pythonCommands.set(key, (async () => {
      const attempts = [];
      for (const candidate of commandCandidates(key)) {
        const result = await probePython(candidate);
        if (result.code === 0) return result;
        attempts.push(`${candidate.file} ${candidate.args.join(' ')}: ${result.error?.message || result.stderr || `exit ${result.code}`}`.trim());
      }
      const failure = new Error(`Python/Pandas indisponível: ${attempts.join(' | ')}`);
      failure.code = 'reports-python-unavailable';
      failure.attempts = attempts;
      throw failure;
    })());
  }
  return pythonCommands.get(key);
}

export function prepareReportAnalytics(data, days, subject, {python = process.env.PYTHON_BIN || 'python', today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}), timeoutMs = 15000} = {}) {
  const safe = {
    subjects: data.subjects.map(s => ({id: s.id, name: s.name})),
    sessions: data.sessions.map(s => ({subjectId: s.subjectId, date: s.date, minutes: s.minutes})),
    tasks: data.tasks.map(t => ({subjectId: t.subjectId, due: t.due, done: t.done, status: t.status,
      priority: t.priority, estimatedMinutes: t.estimatedMinutes,
      completedAt: t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}) : null})),
  };
  return resolvePython(python).then(command => new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../analytics/prepare.py', import.meta.url));
    const child = spawn(command.file, [...command.args, '-X', 'utf8', script], {cwd: projectRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    let output = '', size = 0, settled = false;
    const finish = (error, result) => {if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(result);};
    const timer = setTimeout(() => {child.kill(); finish(new Error('Reports timeout'));}, timeoutMs);
    let stderr = '';
    child.stdout.on('data', chunk => {size += chunk.length; if (size > 2e6) {child.kill(); finish(new Error('Reports too large'));} else output += chunk;});
    child.stderr.on('data', chunk => {stderr += chunk;});
    child.on('error', error => {error.code = error.code || 'reports-python-spawn'; error.python = command.file; error.stderr = stderr.trim(); finish(error);});
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (settled) return;
      try {
        if (code !== 0) {const error = new Error(`Reports unavailable (exit ${code})`);error.code = 'reports-python-failed';error.exitCode = code;error.python = command.file;error.stderr = stderr.trim();throw error;}
        const result = JSON.parse(output);
        finish(null, result);
      } catch (error) {if (!error.code) error.code = 'reports-invalid-output';error.python = command.file;error.stderr = stderr.trim();finish(error);}
    });
    child.stdin.end(JSON.stringify({data: safe, days, subject, today}));
  }));
}
