import {z} from 'zod';
const uuid=z.string().uuid();
export const flashcardPrepareSchema=z.object({requestId:uuid,prompt:z.string().trim().min(3).max(1000),subjectId:uuid.nullable().optional(),sourceText:z.string().trim().max(12000).default(''),sourceActivityId:uuid.nullable().optional(),fromErrors:z.boolean().default(false),count:z.union([z.literal(5),z.literal(10),z.literal(15),z.literal(20)]).default(10)}).strict();
export const flashcardGenerateSchema=z.object({confirmed:z.literal(true)}).strict();
export const flashcardContentSchema=z.object({front:z.string().trim().min(8).max(800),back:z.string().trim().min(12).max(2200),concept:z.string().trim().min(2).max(160),grounding:z.enum(['material','extra','general']),sourceQuote:z.string().max(600)}).strict();
export const flashcardDocumentSchema=z.object({cards:z.array(flashcardContentSchema).min(5).max(20)}).strict();
export const flashcardEditSchema=z.object({expectedRevision:z.number().int().min(1),front:z.string().trim().min(8).max(800),back:z.string().trim().min(12).max(2200),concept:z.string().trim().min(2).max(160)}).strict();
export const flashcardArchiveSchema=z.object({expectedRevision:z.number().int().min(1),archived:z.boolean()}).strict();
export const flashcardSessionSchema=z.object({requestId:uuid,deckId:uuid.nullable().optional(),subjectId:uuid.nullable().optional(),filter:z.enum(['due','today','overdue','new','reviewed','upcoming','all']).default('due'),shuffle:z.boolean().default(false)}).strict();
export const flashcardRatingSchema=z.object({requestId:uuid,cardId:uuid,rating:z.enum(['again','hard','good','easy']),expectedRevision:z.number().int().min(1),expectedCardRevision:z.number().int().min(1)}).strict();
export const flashcardMoveSchema=z.object({expectedRevision:z.number().int().min(1),direction:z.union([z.literal(-1),z.literal(1)])}).strict();
export const flashcardCloseSchema=z.object({confirmed:z.literal(true),expectedRevision:z.number().int().min(1)}).strict();
export const flashcardResponseFormat={name:'study_flashcards_v1',schema:z.toJSONSchema(flashcardDocumentSchema)};
// Simplified box scheduler, not SM-2/FSRS and not a measurement of retention.
export function scheduleFlashcard({stage=0,reviewCount=0,lapseCount=0},rating,now=new Date()){
  if(!['again','hard','good','easy'].includes(rating)||!Number.isInteger(stage)||stage<0||stage>8||!Number.isFinite(new Date(now).getTime()))throw new TypeError('Invalid scheduling input');
  const nextStage=rating==='again'?0:rating==='hard'?Math.max(0,stage-1):Math.min(8,stage+(rating==='easy'?2:1));
  const days=[0,1,3,7,14,30,60,120,180];
  const intervalSeconds=rating==='again'?600:rating==='hard'?Math.max(3600,days[nextStage]*86400):days[nextStage]*86400;
  return {stage:nextStage,reviewCount:reviewCount+1,lapseCount:lapseCount+(rating==='again'?1:0),intervalSeconds,dueAt:new Date(new Date(now).getTime()+intervalSeconds*1000).toISOString(),algorithm:'edutrack-boxes-v1'};
}
export const reviewDay=value=>new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
export function flashcardMatches(card,filter,now){
  if(card.archived)return false;
  const today=reviewDay(now),dueDay=reviewDay(card.dueAt);
  return filter==='all'||filter==='due'&&new Date(card.dueAt)<=new Date(now)||filter==='today'&&dueDay===today||filter==='overdue'&&dueDay<today||filter==='upcoming'&&dueDay>today||filter==='new'&&card.reviewCount===0||filter==='reviewed'&&card.reviewCount>0;
}
