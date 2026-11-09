import {z} from 'zod';
import {questionSchema} from './lab-schemas.mjs';
export const examSettingsSchema=z.object({
  subjectId:z.string().uuid().nullable(),topic:z.string().trim().min(3).max(160),
  count:z.union([z.literal(10),z.literal(20),z.literal(30)]),difficulty:z.enum(['easy','medium','hard','mixed']),
  durationMinutes:z.number().int().min(0).max(180),reviewEnabled:z.boolean(),alternatives:z.union([z.literal(4),z.literal(5)]),
}).strict();
export const examPrepareSchema=z.object({requestId:z.string().uuid(),prompt:z.string().trim().min(3).max(1000),subjectId:z.string().uuid().nullable().optional()}).strict();
export const examGenerateSchema=z.object({confirmed:z.literal(true),settings:examSettingsSchema}).strict();
export const examAnswerSchema=z.object({questionIndex:z.number().int().min(0).max(29),optionIndex:z.number().int().min(0).max(4),expectedRevision:z.number().int().nonnegative()}).strict();
export const examMarkSchema=z.object({questionIndex:z.number().int().min(0).max(29),flagged:z.boolean(),expectedRevision:z.number().int().nonnegative()}).strict();
export const examSubmitSchema=z.object({confirmed:z.literal(true)}).strict();
export const examDocumentSchema=z.object({questions:z.array(questionSchema.extend({concept:z.string().trim().min(2).max(100)})).min(10).max(30)}).strict();
export function difficultyDistribution(count,difficulty='mixed',offset=0){
  const values={easy:0,medium:0,hard:0};for(let i=0;i<count;i++)values[difficulty==='mixed'?['easy','medium','hard'][(i+offset)%3]:difficulty]++;return values;
}
