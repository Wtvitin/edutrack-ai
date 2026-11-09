import { z } from 'zod';
import {writableToolValues,chartTypeValues,chartSourceValues} from '../lib/agent-response-schemas.mjs';
export {chartSpecificationSchema,textResponseSchema,analysisResponseSchema,actionResponseSchema,structuredResponseSchema} from '../lib/agent-response-schemas.mjs';

const uuid = z.string().uuid();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const taskStatusValues = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const priorityValues = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const difficultyValues = ['EASY', 'MEDIUM', 'HARD'];

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
  get_study_trends: emptySchema,
  get_general_dashboard: emptySchema,
  prepare_study_quiz: z.object({prompt:z.string().trim().min(3).max(1000),subjectId:uuid.nullable().optional()}).strict(),
  prepare_study_flashcards: z.object({prompt:z.string().trim().min(3).max(1000),subjectId:uuid.nullable().optional(),fromErrors:z.boolean().optional()}).strict(),
  get_review_schedule: z.object({}).strict(),
  prepare_study_exam: z.object({prompt:z.string().trim().min(3).max(1000),subjectId:uuid.nullable().optional()}).strict(),
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
  { name: 'get_study_trends', description: 'Get study time trends and subject distribution for the authenticated user.', risk: 'read', parameters: toolJson([], {}) },
  { name: 'get_general_dashboard', description: 'Get dashboard aggregates for the authenticated user.', risk: 'read', parameters: toolJson([], {}) },
  {name:'prepare_study_flashcards',description:'Prepare an owned flashcard draft and navigate to the Laboratory. No generation until student confirms. Can use concepts missed in completed assessments with fromErrors=true; never treat old AI keys as verified facts.',risk:'write',parameters:toolJson(['prompt'],{prompt:{type:'string',minLength:3,maxLength:1000},subjectId:{type:['string','null'],format:'uuid'},fromErrors:{type:'boolean'}})},
  {name:'get_review_schedule',description:'Read persisted flashcard due counts and concepts for today. Self-assessments are not measurements of retention. No generation or mutation.',risk:'read',parameters:toolJson([],{})},
  { name: 'prepare_study_exam', description: 'Prepare a simulated exam configuration (30 mixed questions, unlimited time, review marks enabled, correction after submission). Suggest a subject from authorized data. No generation before student confirmation in the Laboratory. Never answer or submit exams.', risk: 'write', parameters: toolJson(['prompt'],{prompt:{type:'string',minLength:3,maxLength:1000},subjectId:{type:['string','null'],format:'uuid'}}) },
  { name: 'prepare_study_quiz', description: 'When the student requests a quiz or practice exam, prepare an authorized Study Laboratory activity from their subjects and assignments. The Laboratory generates the questions after navigation; never create academic tasks for this request.', risk: 'write', parameters: toolJson(['prompt'], {prompt:{type:'string',minLength:3,maxLength:1000},subjectId:{type:['string','null'],format:'uuid'}}) },
].map(definition => ({ ...definition, type: 'function', function: { name: definition.name, description: definition.description, parameters: definition.parameters } })));


export const agentChatInputSchema = z.object({ message: z.string().trim().min(1).max(12000), conversationId: uuid.optional() }).strict();
export const toolCallSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()) }).strict();

export const responseJsonSchemas = Object.freeze({
  text: { type: 'object', additionalProperties: false, required: ['type', 'content'], properties: { type: { const: 'text' }, content: { type: 'string', minLength: 1 }, metadata: { type: 'object', additionalProperties: true } } },
  analysis: { type: 'object', additionalProperties: false, required: ['type', 'analysis', 'metrics'], properties: { type: { const: 'analysis' }, analysis: { type: 'string', minLength: 1 }, metrics: { type: 'object', additionalProperties: true }, chart: { type: 'object', additionalProperties: false, required: ['type', 'title', 'xAxis', 'yAxis', 'series', 'data', 'source', 'datasetVersion'], properties: { type: { type: 'string', enum: chartTypeValues }, title: { type: 'string', minLength: 1, maxLength: 200 }, description: { type: 'string', maxLength: 500 }, xAxis: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } }, yAxis: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } }, series: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['field', 'label'], properties: { field: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1, maxLength: 100 } } } }, data: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } }, filters: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: true } }, source: { type: 'object', additionalProperties: false, required: ['tool'], properties: { tool: { type: 'string', enum: chartSourceValues } } }, datasetVersion: { type: 'string', minLength: 1, maxLength: 40 } } }, metadata: { type: 'object', additionalProperties: true } } },
  action: { type: 'object', additionalProperties: false, required: ['type', 'action', 'result'], properties: { type: { const: 'action' }, action: { type: 'string', enum: writableToolValues }, result: { type: 'object', additionalProperties: true }, metadata: { type: 'object', additionalProperties: true } } },
});

export const writableTools = new Set(writableToolValues);
