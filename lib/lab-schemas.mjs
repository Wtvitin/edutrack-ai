import {z} from 'zod';

// The envelope can grow to other activities without changing the quiz contract.
export const studyModes = Object.freeze([
  {id:'quiz',label:'Quiz inteligente',available:true},
  {id:'flashcards',label:'Flashcards',available:true},
  {id:'open-response',label:'Resposta aberta',available:false},
  {id:'exam',label:'Simulado',available:true},
  {id:'guided-practice',label:'Prática orientada',available:false},
]);
export const quizConfigSchema=z.object({
  requestId:z.string().uuid(),
  subjectId:z.string().uuid().nullable(),
  topic:z.string().trim().max(160),
  sourceText:z.string().trim().max(12000),
  count:z.union([z.literal(5),z.literal(10),z.literal(15),z.literal(20)]),
  difficulty:z.enum(['easy','medium','hard','mixed']),
  alternatives:z.union([z.literal(4),z.literal(5)]),
  correction:z.enum(['immediate','end']),
}).strict().refine(value=>value.subjectId||value.topic.length>=3||value.sourceText.length>=30,{message:'Escolha uma disciplina, informe um assunto ou forneça ao menos 30 caracteres de material.'});

export const questionSchema=z.object({
  concept:z.string().trim().min(2).max(100).optional(),
  prompt:z.string().trim().min(10).max(1200),
  options:z.array(z.string().trim().min(1).max(400)).min(4).max(5),
  correctIndex:z.number().int().min(0).max(4),
  explanation:z.object({answer:z.string().trim().min(1).max(400),reason:z.string().trim().min(15).max(1600)}).strict(),
  difficulty:z.enum(['easy','medium','hard']),
  grounding:z.enum(['material','extra','general']),
  sourceQuote:z.string().trim().max(800),
}).strict();
export const quizDocumentSchema=z.object({questions:z.array(questionSchema).min(5).max(20)}).strict();
export const quizAnswerSchema=z.object({questionIndex:z.number().int().min(0).max(19),optionIndex:z.number().int().min(0).max(4)}).strict();
const normalized=value=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR');

export function validateQuizDocument(document,config){
  const parsed=quizDocumentSchema.safeParse(document);
  if(!parsed.success)return {success:false};
  const questions=parsed.data.questions;
  if(questions.length!==config.count||new Set(questions.map(q=>normalized(q.prompt))).size!==questions.length)return {success:false};
  if(config.difficulty==='mixed'&&new Set(questions.map(q=>q.difficulty)).size!==3)return {success:false};
  for(const question of questions){
    if(question.options.length!==config.alternatives||question.correctIndex>=question.options.length)return {success:false};
    if(new Set(question.options.map(normalized)).size!==question.options.length)return {success:false};
    if(normalized(question.explanation.answer)!==normalized(question.options[question.correctIndex]))return {success:false};
    if(config.difficulty!=='mixed'&&question.difficulty!==config.difficulty)return {success:false};
    // A real excerpt proves provenance, not semantic entailment or factual truth.
    if(config.sourceText){
      if(question.grounding==='general')return {success:false};
      if(question.grounding==='material'&&(!question.sourceQuote||!config.sourceText.includes(question.sourceQuote)))return {success:false};
      if(question.grounding==='extra'&&question.sourceQuote)return {success:false};
    }else if(question.grounding!=='general'||question.sourceQuote)return {success:false};
  }
  return {success:true,data:parsed.data};
}

// Simple JSON Schema understood by all three existing provider adapters.
export const quizResponseFormat={name:'study_quiz_v1',schema:{
  type:'object',additionalProperties:false,required:['questions'],properties:{questions:{type:'array',minItems:5,maxItems:20,items:{
    type:'object',additionalProperties:false,
    required:['prompt','options','correctIndex','explanation','difficulty','grounding','sourceQuote'],
    properties:{prompt:{type:'string'},options:{type:'array',minItems:4,maxItems:5,items:{type:'string'}},correctIndex:{type:'integer',minimum:0,maximum:4},
      explanation:{type:'object',additionalProperties:false,required:['answer','reason'],properties:{answer:{type:'string'},reason:{type:'string'}}},
      difficulty:{type:'string',enum:['easy','medium','hard']},grounding:{type:'string',enum:['material','extra','general']},sourceQuote:{type:'string'}},
  }}},
}};

export const retryableQuizErrors = new Set(['provider-timeout', 'provider-network', 'provider-http-error', 'provider-unavailable', 'lab-generation-interrupted']);

export function assistedQuizTitle(prompt, subjectName) {
  if (subjectName && subjectName !== 'Plano automático' && subjectName !== 'Assunto livre') return ('Quiz · ' + subjectName).slice(0, 160);
  const topic = prompt.match(/\bquiz\s+(?:de|sobre)\s+(.+)/i)?.[1]?.trim().replace(/[.!?]+$/, '');
  return topic && topic.length <= 60 ? 'Quiz · ' + topic[0].toUpperCase() + topic.slice(1) : 'Quiz de revisão';
}

export const assistedQuizSchema=z.object({requestId:z.string().uuid(),prompt:z.string().trim().min(3).max(1000),subjectId:z.string().uuid().nullable().optional()}).strict();
export const assistedDocumentSchema=z.object({subjectId:z.string().max(36),topic:z.string().trim().min(3).max(160),questions:z.array(questionSchema.extend({concept:z.string().trim().min(2).max(100)})).min(5).max(20)}).strict();
const assistedQuestionJson=structuredClone(quizResponseFormat.schema.properties.questions);
assistedQuestionJson.items.required.push('concept');
assistedQuestionJson.items.properties.concept={type:'string'};
export const assistedResponseFormat={name:'study_quiz_assisted_v1',schema:{type:'object',additionalProperties:false,required:['subjectId','topic','questions'],properties:{subjectId:{type:'string'},topic:{type:'string'},questions:assistedQuestionJson}}};
export const labReviewSchema=z.object({
  summary:z.string().trim().min(10).max(1000),
  strengths:z.array(z.string().trim().min(3).max(240)).max(4),
  priorities:z.array(z.object({concept:z.string().trim().min(2).max(100),observation:z.string().trim().min(10).max(500),practice:z.string().trim().min(10).max(500),evidenceIds:z.array(z.string().min(1).max(80)).min(1).max(5)}).strict()).max(4),
}).strict();
export const labReviewResponseFormat={name:'study_review_v1',schema:{type:'object',additionalProperties:false,required:['summary','strengths','priorities'],properties:{
  summary:{type:'string'},strengths:{type:'array',maxItems:4,items:{type:'string'}},priorities:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['concept','observation','practice','evidenceIds'],properties:{concept:{type:'string'},observation:{type:'string'},practice:{type:'string'},evidenceIds:{type:'array',minItems:1,maxItems:5,items:{type:'string'}}}}},
}}};
