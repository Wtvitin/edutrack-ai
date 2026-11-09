import {z} from 'zod';
/** @type {['create_task','update_task','complete_task','prepare_study_quiz','prepare_study_exam','prepare_study_flashcards']} */
export const writableToolValues=['create_task','update_task','complete_task','prepare_study_quiz','prepare_study_exam','prepare_study_flashcards'];
export const chartTypeValues=['kpi','card','table','line','bar','area','donut','pie','scatter','comparison','heatmap'];
export const chartSourceValues=['get_general_dashboard','get_academic_performance','get_study_trends'];

const chartAxisSchema = z.object({ field: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(100) }).strict();
export const chartSpecificationSchema = z.object({
  type: z.enum(chartTypeValues),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional(),
  xAxis: chartAxisSchema,
  yAxis: chartAxisSchema,
  series: z.array(z.object({ field: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(100) }).strict()).min(1).max(8),
  data: z.array(z.record(z.string(), z.unknown())).max(500),
  filters: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  source: z.object({ tool: z.enum(chartSourceValues) }).strict(),
  datasetVersion: z.string().trim().min(1).max(40),
}).strict();

const metadataSchema = z.record(z.string(), z.unknown()).optional();
export const textResponseSchema = z.object({ type: z.literal('text'), content: z.string().min(1), metadata: metadataSchema }).strict();
export const analysisResponseSchema = z.object({ type: z.literal('analysis'), analysis: z.string().min(1), metrics: z.record(z.string(), z.unknown()), chart: chartSpecificationSchema.optional(), metadata: metadataSchema }).strict();
export const actionResponseSchema = z.object({ type: z.literal('action'), action: z.enum(writableToolValues), result: z.record(z.string(), z.unknown()), metadata: metadataSchema }).strict();
export const structuredResponseSchema = z.discriminatedUnion('type', [textResponseSchema, analysisResponseSchema, actionResponseSchema]);
