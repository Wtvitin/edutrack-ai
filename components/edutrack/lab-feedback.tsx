"use client";
import {ArrowRight,Sparkles} from 'lucide-react';
import Link from './link';
import type {LabOverview} from '@/lib/lab-types';

export function LabFeedback({review,busy,error,onAnalyze,onOpen}:{review:LabOverview['aiReview'];busy:boolean;error:string;onAnalyze:(id:string,retry:boolean)=>void;onOpen:(id:string)=>void}){
  if(!review)return <p className="lab-caption">Ao concluir um quiz, a IA poderá identificar padrões de erro e sugerir como praticar.</p>;
  return <div className="lab-feedback">
    <span className="lab-kicker"><Sparkles size={16}/>ANÁLISE PERSONALIZADA POR IA</span>
    {error&&<p className="lab-caption" role="alert">{error} As notas e respostas continuam salvas.</p>}
    {busy||review.state==='pending'?<div role="status"><p>A IA está relacionando seus erros e sugerindo os próximos exercícios.</p>{!busy&&<button className="text-link" onClick={()=>onAnalyze(review.activityId,false)}>Verificar análise</button>}</div>:review.state==='ready'&&review.content?<>
      <p>{review.content.summary}</p>
      {!!review.content.strengths.length&&<div className="lab-strengths"><strong>O que você já está construindo</strong><ul>{review.content.strengths.map((text,i)=><li key={i}>{text}</li>)}</ul></div>}
      <div className="lab-review-priorities">{review.content.priorities.map((priority,i)=><article key={i}><h3>{priority.concept}</h3><p>{priority.observation}</p><p><strong>Como praticar:</strong> {priority.practice}</p><button className="text-link" onClick={()=>onOpen(priority.evidenceIds[0].split(':')[0])}>Rever avaliação de referência<ArrowRight size={14}/></button><Link className="text-link" href={`/laboratorio?aba=flashcards&fonte=${priority.evidenceIds[0].split(':')[0]}`}>Preparar cartões desta avaliação<ArrowRight size={14}/></Link></article>)}</div>
      <small>Interpretação da IA sobre quizzes gerados por IA. Confira as recomendações e os gabaritos com seu material.</small>
    </>:<><p>{review.state==='failed'?'A análise não foi concluída. Você pode solicitar uma nova tentativa.':'Peça uma leitura dos seus quizzes concluídos, com pontos fortes, dificuldades e exercícios de revisão.'}</p>{review.attempts<2&&<button className="button secondary" onClick={()=>onAnalyze(review.activityId,review.state==='failed')}><Sparkles size={16}/>{review.state==='failed'?'Tentar análise novamente':'Analisar meus quizzes'}</button>}</>}
  </div>;
}
