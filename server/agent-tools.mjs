import { randomUUID } from 'node:crypto';
import { readData } from './data.mjs';
import { prepareAnalytics } from './analytics.mjs';
import { AgentError } from './agent-config.mjs';
import { toolArgumentSchemas, toolDefinitions } from './agent-schemas.mjs';

const priorityLabels = { LOW: 'baixa', MEDIUM: 'normal', HIGH: 'alta', URGENT: 'urgente' };
const day = value => value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
const iso = value => value ? new Date(value).toISOString() : null;

export class AgentToolError extends AgentError {
  constructor(message, status = 400, code = 'tool-error', cause) {
    super(message, status, code, cause);
    this.name = 'AgentToolError';
  }
}

function notFound() {
  return new AgentToolError('Registro não encontrado ou não autorizado.', 404, 'not-found');
}

function taskResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    subjectId: row.subject_id,
    subjectName: row.subject_name || undefined,
    status: row.status,
    priority: row.priority,
    priorityLabel: priorityLabels[row.priority] || row.priority,
    difficulty: row.difficulty,
    dueDate: day(row.due_date) || null,
    estimatedMinutes: row.estimated_minutes,
    completedAt: iso(row.completed_at),
    createdBy: row.created_by,
  };
}

function validateDate(value) {
  if (value == null) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AgentToolError('Data da tarefa inválida.', 400, 'invalid-date');
  return `${value}T23:59:59-03:00`;
}

async function createTask(db, user, args, executionId) {
  const subject = (await db.query('SELECT id FROM subjects WHERE id=$1 AND user_id=$2', [args.subjectId, user.id])).rows[0];
  if (!subject) throw notFound();
  const id = randomUUID();
  const dueDate = validateDate(args.dueDate);
  return db.transaction(async tx => {
    const row = (await tx.query(`INSERT INTO academic_tasks(id,user_id,subject_id,title,description,status,priority,difficulty,due_date,estimated_minutes,created_by,agent_execution_id,updated_at) VALUES($1,$2,$3,$4,$5,'TODO',$6,$7,$8,$9,'AGENT',$10,now()) RETURNING *`, [id, user.id, args.subjectId, args.title, args.description || '', args.priority || 'MEDIUM', args.difficulty || 'MEDIUM', dueDate, args.estimatedMinutes ?? null, executionId])).rows[0];
    await tx.query('INSERT INTO task_history(task_id,user_id,to_status,to_priority,to_due_date,changes_json) VALUES($1,$2,$3,$4,$5,$6)', [id, user.id, 'TODO', args.priority || 'MEDIUM', dueDate, JSON.stringify({ created: true, source: 'AGENT' })]);
    return taskResult(row);
  });
}

async function loadOwnedTask(db, user, taskId) {
  const row = (await db.query('SELECT t.*,s.name AS subject_name FROM academic_tasks t JOIN subjects s ON s.id=t.subject_id WHERE t.id=$1 AND t.user_id=$2', [taskId, user.id])).rows[0];
  if (!row) throw notFound();
  return row;
}

async function updateTask(db, user, args) {
  const current = await loadOwnedTask(db, user, args.taskId);
  const subjectId = args.subjectId ?? current.subject_id;
  if (args.subjectId) {
    const subject = (await db.query('SELECT id FROM subjects WHERE id=$1 AND user_id=$2', [args.subjectId, user.id])).rows[0];
    if (!subject) throw notFound();
  }
  const status = args.status ?? current.status;
  const completedAt = status === 'COMPLETED' ? (current.completed_at || new Date().toISOString()) : status === 'TODO' || status === 'IN_PROGRESS' ? null : current.completed_at;
  const dueDate = Object.prototype.hasOwnProperty.call(args, 'dueDate') ? validateDate(args.dueDate) : current.due_date;
  const values = [subjectId, args.title ?? current.title, args.description ?? current.description ?? '', status, args.priority ?? current.priority, args.difficulty ?? current.difficulty, dueDate, args.estimatedMinutes ?? current.estimated_minutes, completedAt, args.taskId, user.id];
  return db.transaction(async tx => {
    const row = (await tx.query(`UPDATE academic_tasks SET subject_id=$1,title=$2,description=$3,status=$4,priority=$5,difficulty=$6,due_date=$7,estimated_minutes=$8,completed_at=$9,updated_at=now() WHERE id=$10 AND user_id=$11 RETURNING *`, values)).rows[0];
    if (!row) throw notFound();
    const changes = { source: 'AGENT' };
    for (const [key, before, after] of [['subjectId', current.subject_id, subjectId], ['title', current.title, row.title], ['description', current.description || '', row.description || ''], ['status', current.status, row.status], ['priority', current.priority, row.priority], ['difficulty', current.difficulty, row.difficulty], ['dueDate', day(current.due_date), day(row.due_date)], ['estimatedMinutes', current.estimated_minutes, row.estimated_minutes]]) if (before !== after) changes[key] = { from: before ?? null, to: after ?? null };
    if (Object.keys(changes).length > 1) await tx.query('INSERT INTO task_history(task_id,user_id,from_status,to_status,from_priority,to_priority,from_due_date,to_due_date,changes_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [row.id, user.id, current.status, row.status, current.priority, row.priority, current.due_date, row.due_date, JSON.stringify(changes)]);
    return taskResult({ ...row, subject_name: current.subject_name });
  });
}

async function completeTask(db, user, args) {
  const current = await loadOwnedTask(db, user, args.taskId);
  if (current.status === 'COMPLETED') return taskResult(current);
  return db.transaction(async tx => {
    const row = (await tx.query(`UPDATE academic_tasks SET status='COMPLETED',completed_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`, [args.taskId, user.id])).rows[0];
    await tx.query('INSERT INTO task_history(task_id,user_id,from_status,to_status,from_priority,to_priority,from_due_date,to_due_date,changes_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [args.taskId, user.id, current.status, 'COMPLETED', current.priority, current.priority, current.due_date, current.due_date, JSON.stringify({ status: { from: current.status, to: 'COMPLETED' }, source: 'AGENT' })]);
    return taskResult({ ...row, subject_name: current.subject_name });
  });
}

async function getTask(db, user, args) {
  return taskResult(await loadOwnedTask(db, user, args.taskId));
}

async function listTasks(db, user, args) {
  const values = [user.id];
  let filter = 't.user_id=$1';
  if (args.status) { values.push(args.status); filter += ' AND t.status=$2'; }
  const rows = (await db.query(`SELECT t.*,s.name AS subject_name FROM academic_tasks t JOIN subjects s ON s.id=t.subject_id WHERE ${filter} ORDER BY t.due_date NULLS LAST,t.created_at DESC LIMIT 200`, values)).rows;
  return { tasks: rows.map(taskResult), count: rows.length };
}

async function analyticsResult(readSnapshot, analytics, db, user, toolName, args = {}) {
  const snapshot = await readSnapshot(db, user);
  const metrics = await analytics(snapshot.data, toolName === 'get_study_trends' ? args.days || 7 : 7, 'all');
  if (toolName === 'get_academic_performance') return { completed: metrics.completed, pending: metrics.pending, overdue: metrics.overdue, urgent: metrics.urgent, estimatedMinutes: metrics.estimatedMinutes, changePercent: metrics.changePercent };
  if (toolName === 'get_study_trends') return { days: metrics.days, start: metrics.start, end: metrics.end, previousStart: metrics.previousStart, previousEnd: metrics.previousEnd, minutes: metrics.minutes, previousMinutes: metrics.previousMinutes, activeDays: metrics.activeDays, sessions: metrics.sessions, previousSessions: metrics.previousSessions, averageSession: metrics.averageSession, daily: metrics.daily, previousDaily: metrics.previousDaily, subjects: metrics.subjects };
  return { start: metrics.start, end: metrics.end, minutes: metrics.minutes, completed: metrics.completed, pending: metrics.pending, overdue: metrics.overdue, urgent: metrics.urgent, subjects: metrics.subjects, recentSessions: snapshot.data.sessions.slice(-10) };
}

export function validateToolArguments(name, args) {
  const schema = toolArgumentSchemas[name];
  if (!schema) return { success: false, error: new AgentToolError('Tool não registrada.', 400, 'unknown-tool') };
  const result = schema.safeParse(args);
  return result.success ? { success: true, data: result.data } : { success: false, error: new AgentToolError('Argumentos inválidos para a Tool.', 400, 'invalid-tool-arguments', result.error) };
}

export function createAgentToolRegistry({ readSnapshot = readData, analytics = prepareAnalytics } = {}) {
  const executors = {
    create_task: ({ db, user, args, executionId }) => createTask(db, user, args, executionId),
    update_task: ({ db, user, args }) => updateTask(db, user, args),
    complete_task: ({ db, user, args }) => completeTask(db, user, args),
    get_task: ({ db, user, args }) => getTask(db, user, args),
    list_tasks: ({ db, user, args }) => listTasks(db, user, args),
    get_academic_performance: ({ db, user }) => analyticsResult(readSnapshot, analytics, db, user, 'get_academic_performance'),
    get_study_trends: ({ db, user, args }) => analyticsResult(readSnapshot, analytics, db, user, 'get_study_trends', args),
    get_general_dashboard: ({ db, user }) => analyticsResult(readSnapshot, analytics, db, user, 'get_general_dashboard'),
  };
  const definitions = toolDefinitions.map(definition => ({ ...definition, execute: executors[definition.name] }));
  const registry = new Map(definitions.map(definition => [definition.name, definition]));
  return {
    list: () => definitions,
    get: name => registry.get(name),
    has: name => registry.has(name),
    validate: validateToolArguments,
    async execute(name, args, context) {
      const definition = registry.get(name);
      if (!definition) throw new AgentToolError('Tool não registrada.', 400, 'unknown-tool');
      const parsed = validateToolArguments(name, args);
      if (!parsed.success) throw parsed.error;
      try {
        return await definition.execute({ ...context, args: parsed.data });
      } catch (error) {
        if (error instanceof AgentError) throw error;
        throw new AgentToolError('Não foi possível executar a Tool.', 503, 'tool-failed', error);
      }
    },
  };
}
