import { z } from 'zod';

const uuid = z.string().uuid();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const taskStatusValues = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const priorityValues = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const difficultyValues = ['EASY', 'MEDIUM', 'HARD'];
const writableToolValues = ['create_task', 'update_task', 'complete_task'];
const chartTypeValues = ['kpi', 'card', 'table', 'line', 'bar', 'area', 'donut', 'pie', 'scatter', 'comparison', 'heatmap'];
const chartSourceValues = ['get_general_dashboard', 'get_academic_performance', 'get_study_trends'];

const validDate = value => {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const optionalDate = z.string().regex(datePattern).refine(validDate, 'Data inválida.').nullable().optional();
const taskCreateSchema = z.object({
  subjectId: uuid,
  title: z.string().trim().min(1).max(140),
  description: z.string().max(1500).optional(),
  priority: z.enum(priorityValues).optional(),
  difficulty: z.enum(difficultyValues).optional(),
  dueDate: optionalDate,
  estimatedMinutes: z.number().int().min(1).max(10080).nullable().optional(),
}).strict();
const taskUpdateSchema = z.object({
  taskId: uuid,
  subjectId: uuid.optional(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().max(1500).optional(),
  priority: z.enum(priorityValues).optional(),
  difficulty: z.enum(difficultyValues).optional(),
  status: z.enum(taskStatusValues).optional(),
  dueDate: optionalDate,
  estimatedMinutes: z.number().int().min(1).max(10080).nullable().optional(),
}).strict().refine(value => Object.keys(value).some(key => key !== 'taskId'), 'Informe ao menos um campo para atualizar.');
const taskIdSchema = z.object({ taskId: uuid }).strict();
const listTasksSchema = z.object({ status: z.preprocess(value => value === null ? undefined : value, z.enum(taskStatusValues).optional()) }).strict();
const emptySchema = z.object({}).strict();

export const toolArgumentSchemas = Object.freeze({
  create_task: taskCreateSchema,
  update_task: taskUpdateSchema,
  complete_task: taskIdSchema,
  get_task: taskIdSchema,
  list_tasks: listTasksSchema,
  get_academic_performance: emptySchema,
  get_study_trends: z.object({ days: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]).optional() }).strict(),
  get_general_dashboard: emptySchema,
});

const toolJson = (required, properties) => ({ type: 'object', additionalProperties: false, required, properties });
const uuidJson = { type: 'string', format: 'uuid' };
const dateJson = { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

export const toolDefinitions = Object.freeze([
  { name: 'create_task', description: 'Create an academic task for the authenticated user.', risk: 'write', parameters: toolJson(['subjectId', 'title'], { subjectId: uuidJson, title: { type: 'string', minLength: 1, maxLength: 140 }, description: { type: 'string', maxLength: 1500 }, priority: { type: 'string', enum: priorityValues }, difficulty: { type: 'string', enum: difficultyValues }, dueDate: dateJson, estimatedMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 } }) },
  { name: 'update_task', description: 'Update an academic task owned by the authenticated user.', risk: 'write', parameters: toolJson(['taskId'], { taskId: uuidJson, subjectId: uuidJson, title: { type: 'string', minLength: 1, maxLength: 140 }, description: { type: 'string', maxLength: 1500 }, priority: { type: 'string', enum: priorityValues }, difficulty: { type: 'string', enum: difficultyValues }, status: { type: 'string', enum: taskStatusValues }, dueDate: dateJson, estimatedMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 } }) },
  { name: 'complete_task', description: 'Complete an academic task owned by the authenticated user.', risk: 'write', parameters: toolJson(['taskId'], { taskId: uuidJson }) },
  { name: 'get_task', description: 'Get one academic task owned by the authenticated user.', risk: 'read', parameters: toolJson(['taskId'], { taskId: uuidJson }) },
  { name: 'list_tasks', description: 'List academic tasks for the authenticated user, optionally filtered by status.', risk: 'read', parameters: toolJson([], { status: { type: 'string', enum: taskStatusValues } }) },
  { name: 'get_academic_performance', description: 'Get academic performance metrics for the authenticated user.', risk: 'read', parameters: toolJson([], {}) },
  { name: 'get_study_trends', description: 'Get historical study time trends for the authenticated user. Use days=7 for a comparison of the latest two consecutive weeks; results include daily minutes for both weeks.', risk: 'read', parameters: toolJson([], { days: { type: 'integer', enum: [7, 14, 30, 90] } }) },
  { name: 'get_general_dashboard', description: 'Get dashboard aggregates for the authenticated user.', risk: 'read', parameters: toolJson([], {}) },
].map(definition => ({ ...definition, type: 'function', function: { name: definition.name, description: definition.description, parameters: definition.parameters } })));

const chartAxisSchema = z.object({ field: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(100) }).strict();
export const chartSpecificationSchema = z.object({
  type: z.enum(chartTypeValues),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional(),
  xAxis: chartAxisSchema,
  yAxis: chartAxisSchema,
  series: z.array(z.object({ field: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(100) }).strict()).min(1).max(8),
  data: z.array(z.record(z.unknown())).max(500),
  filters: z.array(z.record(z.unknown())).max(30).optional(),
  source: z.object({ tool: z.enum(chartSourceValues) }).strict(),
  datasetVersion: z.string().trim().min(1).max(40),
}).strict();

const metadataSchema = z.record(z.unknown()).optional();
export const textResponseSchema = z.object({ type: z.literal('text'), content: z.string().min(1), metadata: metadataSchema }).strict();
export const analysisResponseSchema = z.object({ type: z.literal('analysis'), analysis: z.string().min(1), metrics: z.record(z.unknown()), chart: chartSpecificationSchema.optional(), metadata: metadataSchema }).strict();
export const actionResponseSchema = z.object({ type: z.literal('action'), action: z.enum(writableToolValues), result: z.record(z.unknown()), metadata: metadataSchema }).strict();
export const structuredResponseSchema = z.discriminatedUnion('type', [textResponseSchema, analysisResponseSchema, actionResponseSchema]);

export const agentChatInputSchema = z.object({ message: z.string().trim().min(1).max(12000), conversationId: uuid.optional() }).strict();
export const toolCallSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(100), arguments: z.record(z.unknown()) }).strict();

export const responseJsonSchemas = Object.freeze({
  text: { type: 'object', additionalProperties: false, required: ['type', 'content'], properties: { type: { const: 'text' }, content: { type: 'string', minLength: 1 }, metadata: { type: 'object', additionalProperties: true } } },
  analysis: { type: 'object', additionalProperties: false, required: ['type', 'analysis', 'metrics'], properties: { type: { const: 'analysis' }, analysis: { type: 'string', minLength: 1 }, metrics: { type: 'object', additionalProperties: true }, chart: { type: 'object', additionalProperties: false, required: ['type', 'title', 'xAxis', 'yAxis', 'series', 'data', 'source', 'datasetVersion'], properties: { type: { type: 'string', enum: chartTypeValues }, title: { type: 'string', minLength: 1, maxLength: 200 }, description: { type: 'string', maxLength: 500 }, xAxis: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } }, yAxis: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } }, series: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } } }, data: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } }, filters: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: true } }, source: { type: 'object', additionalProperties: false, required: ['tool'], properties: { tool: { type: 'string', enum: chartSourceValues } } }, datasetVersion: { type: 'string', minLength: 1, maxLength: 40 } } }, metadata: { type: 'object', additionalProperties: true } } },
  action: { type: 'object', additionalProperties: false, required: ['type', 'action', 'result'], properties: { type: { const: 'action' }, action: { type: 'string', enum: writableToolValues }, result: { type: 'object', additionalProperties: true }, metadata: { type: 'object', additionalProperties: true } } },
});

export const writableTools = new Set(writableToolValues);
