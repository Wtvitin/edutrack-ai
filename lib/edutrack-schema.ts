import { z } from "zod";
const date=z.string().refine(v=>v===""||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T12:00:00`))),"Invalid date");
export const studyDataSchema=z.object({
 version:z.literal(1),
 profile:z.object({name:z.string().trim().min(1).max(80),goal:z.string().max(300),weeklyGoalMinutes:z.number().int().min(0).max(10080).optional(),id:z.string().optional(),email:z.string().optional(),notificationsEnabled:z.boolean().optional(),theme:z.enum(["system","light","dark"]).optional()}),
 subjects:z.array(z.object({id:z.string().min(1),name:z.string().min(1).max(60),color:z.enum(["blue","purple","green","rose","orange"]),description:z.string().max(200),teacher:z.string().trim().max(120).optional(),hours:z.number().int().min(0).max(10000).optional()})),
 tasks:z.array(z.object({id:z.string().min(1),title:z.string().min(1).max(140),subjectId:z.string(),due:date,done:z.boolean(),priority:z.enum(["baixa","normal","alta","urgente"]),description:z.string().max(1500),status:z.enum(["TODO","IN_PROGRESS","COMPLETED","CANCELLED"]).optional(),difficulty:z.enum(["EASY","MEDIUM","HARD"]).optional(),estimatedMinutes:z.number().int().min(1).max(10080).nullable().optional(),completedAt:z.string().nullable().optional()})),
 sessions:z.array(z.object({id:z.string().min(1),subjectId:z.string(),date:date.refine(v=>v!==""),minutes:z.number().int().min(1)})),
});
