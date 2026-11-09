"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, CalendarDays, Check, ChevronRight, Clock3, GraduationCap, History, ListChecks, MessageCircle, Send, ShieldCheck, Sparkles, Target, WandSparkles } from 'lucide-react';
import { formatMinutes, lastSevenDays, type StudyData } from '@/lib/edutrack';
import { AgentChart } from './agent-chart';
import { AgentRequestError, chatWithAgent, type AgentResponse } from './agent-api';
import type { ViewProps } from './views';
import Link from './link';
import {navigateWithinStudy} from './navigation';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; response?: AgentResponse };

const suggestions = [
  { label: 'Ver minhas tarefas', description: 'Confira e organize suas atividades', prompt: 'Quais são minhas tarefas?', icon: ListChecks },
  { label: 'Analisar meu desempenho', description: 'Entenda seus resultados e sua evolução', prompt: 'Como está meu desempenho?', icon: Target },
  { label: 'Ver tendências de estudo', description: 'Compare seu ritmo de estudo', prompt: 'Mostre minhas tendências de estudo', icon: CalendarDays },
  { label: 'Praticar com um quiz', description: 'Teste seus conhecimentos na prática', prompt: 'Monte um quiz com base nas minhas matérias e atividades e abra no Laboratório.', icon: WandSparkles },
  { label: 'Criar flashcards', description: 'Revise os principais conceitos', prompt: 'Crie flashcards dos assuntos em que mais errei e abra o Laboratório.', icon: BookOpen },
  { label: 'Preparar um simulado', description: 'Pratique em formato de prova', prompt: 'Prepare um simulado de 30 questões sobre a matéria que mais preciso revisar.', icon: GraduationCap },
];

function responseText(response: AgentResponse) {
  if (response.type === 'text') return response.content;
  if (response.type === 'analysis') return response.analysis;
  if (response.action === 'prepare_study_flashcards') return 'O baralho foi preparado. Confira as fontes e confirme a geração no Laboratório.';
  if (response.action === 'prepare_study_exam') return 'A configuração do simulado foi preparada. Revise a sugestão no Laboratório e confirme antes de gerar as questões.';
  if (response.action === 'prepare_study_quiz') return 'Seu quiz está preparado. Vou abrir o Laboratório para gerar as questões com o contexto das suas matérias.';
  if (response.action === 'create_task') return 'A tarefa foi criada com sucesso.';
  if (response.action === 'complete_task') return 'A tarefa foi concluída com sucesso.';
  return 'A tarefa foi atualizada com sucesso.';
}

function demoResponse(message: string, data: StudyData): AgentResponse {
  const pending = data.tasks.filter(task => !task.done);
  if (/tarefa|pendência/i.test(message)) return { type: 'text', content: `Você tem ${pending.length} tarefas pendentes. A próxima é ${pending[0]?.title || 'planejar um novo passo'}.` };
  return { type: 'text', content: `Nos últimos 7 dias você estudou ${formatMinutes(lastSevenDays(data.sessions).reduce((sum, day) => sum + day.minutes, 0))}. O Agent real exige uma conta autenticada.` };
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function ActionResult({ response }: { response: Extract<AgentResponse, { type: 'action' }> }) {
  const result = response.result;
  if(response.action==='prepare_study_flashcards')return <div className="agent-action-result"><Sparkles size={19}/><div><strong>Flashcards preparados</strong><span>{typeof result.title==='string'?result.title:'Revisão no Laboratório'}</span>{typeof result.id==='string'&&/^[a-f\d-]{36}$/i.test(result.id)&&<Link className="text-link" href={'/laboratorio?aba=flashcards&baralho='+result.id}>Abrir flashcards</Link>}</div></div>;
  if(response.action==='prepare_study_quiz'||response.action==='prepare_study_exam')return <div className="agent-action-result"><Sparkles size={19}/><div><strong>{response.action==='prepare_study_exam'?'Configuração do simulado preparada':'Quiz preparado'}</strong><span>{typeof result.title==='string'?result.title:'Laboratório de Estudos'}</span>{typeof result.id==='string'&&/^[a-f\d-]{36}$/i.test(result.id)&&<Link className="text-link" href={`/laboratorio?atividade=${result.id}`}>Abrir Laboratório</Link>}</div></div>;
  const title = typeof result.title === 'string' ? result.title : 'Tarefa atualizada';
  const dueDate = typeof result.dueDate === 'string' && result.dueDate ? result.dueDate : null;
  return <div className="agent-action-result"><span className="agent-result-icon"><Check size={16}/></span><div><strong>{response.action === 'create_task' ? 'Tarefa criada' : response.action === 'complete_task' ? 'Tarefa concluída' : 'Tarefa atualizada'}</strong><span>{title}</span>{dueDate && <small>{dueDate}</small>}</div></div>;
}

function AnalysisDetails({ response }: { response: Extract<AgentResponse, { type: 'analysis' }> }) {
  const metrics = Object.entries(response.metrics).slice(0, 4);
  return <><div className="agent-metric-grid">{metrics.map(([key, value]) => <div className="agent-metric" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value)}</strong></div>)}</div>{response.chart && <AgentChart chart={response.chart}/>}</>;
}

export function AgentView({ data, editTask, onDataChanged }: Pick<ViewProps, 'data' | 'editTask'> & {onDataChanged?:()=>Promise<void>}) {
  const isDemo = !data.profile.id;
  const [input, setInput] = useState('');
  const conversationKey=data.profile.id?'edutrack-agent-conversation:'+data.profile.id:null;
  const [conversationId,setConversationId]=useState<string|undefined>(()=>{if(typeof window==='undefined'||!conversationKey)return;try{const id=sessionStorage.getItem(conversationKey);return id&&/^[a-f\d-]{36}$/i.test(id)?id:undefined;}catch{return;}});
  function rememberConversation(id:string){setConversationId(id);if(conversationKey)try{sessionStorage.setItem(conversationKey,id);}catch{}}
  function newConversation(){setConversationId(undefined);setMessages([]);setError('');if(conversationKey)try{sessionStorage.removeItem(conversationKey);}catch{}}

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sendingRef=useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!messages.length) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (messages.at(-1)?.role === 'assistant' && !busy) {
      latestMessageRef.current?.scrollIntoView({ behavior, block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'nearest' });
    }
  }, [messages, busy]);

  function sendMessage() {
    const message = input.trim();
    if (!message || busy || sendingRef.current) return;
    setInput('');
    setError('');
    setMessages(previous => [...previous, { id: `${Date.now()}-user`, role: 'user', text: message }]);
    if (isDemo) {
      const response = demoResponse(message, data);
      setMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', text: responseText(response), response }]);
      return;
    }
    setBusy(true);
    sendingRef.current=true;
    void (async () => {
      try {
        const result = await chatWithAgent({ message, conversationId });
        rememberConversation(result.conversationId);
        setMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', text: responseText(result.response), response: result.response }]);
        if(result.response.type==='action'&&['prepare_study_quiz','prepare_study_exam','prepare_study_flashcards'].includes(result.response.action)){
          const id=result.response.result.id;
          if(typeof id==='string'&&/^[a-f\d-]{36}$/i.test(id))await navigateWithinStudy(result.response.action==='prepare_study_flashcards'?`/laboratorio?aba=flashcards&baralho=${id}`:`/laboratorio?atividade=${id}`);
        }else if(result.response.type==='action')await onDataChanged?.().catch(()=>setError('A ação foi concluída. Atualize a página para ver os dados mais recentes.'));
      } catch (cause) {
        if(cause instanceof AgentRequestError){
          if(cause.conversationId)rememberConversation(cause.conversationId);
          if(cause.actionsApplied)await onDataChanged?.().catch(()=>{});
        }
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a conversa.');
      } finally {
        setBusy(false);
        sendingRef.current=false;
      }
    })();
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendMessage(); }

  return <div className="agent-shell">
    <header className="agent-header">
      <div className="agent-identity"><div className="agent-avatar"><Sparkles size={21}/></div><strong>Assistente EduTrack</strong></div>
      {conversationId&&<button type="button" className="button secondary" disabled={busy} onClick={newConversation}>Nova conversa</button>}
    </header>
    {!messages.length && <section className="agent-empty-state" aria-labelledby="agent-intro-title">
      <div className="agent-intro-meta"><span className="eyebrow">ASSISTENTE ACADÊMICO</span><span className="agent-status"><span className="agent-status-dot"/>{isDemo ? 'Modo demonstração' : 'Pronto para ajudar'}</span></div>
      <div className="agent-intro-title"><div className="agent-empty-icon"><Sparkles size={27}/></div><h1 id="agent-intro-title">Qual é o próximo passo?</h1></div>
      <p>{isDemo?'Explore uma prévia do assistente com os dados da demonstração.':'Organize tarefas, acompanhe seu desempenho e pratique com a IA do EduTrack.'}</p>
      <div className="agent-suggestions" aria-label="Sugestões de conversa">
        {suggestions.map(({ label, description, prompt, icon: Icon }) => <button className="agent-suggestion" key={prompt} type="button" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}>
          <span className="agent-suggestion-icon"><Icon size={22}/></span><span className="agent-suggestion-copy"><strong>{label}</strong><small>{description}</small></span><ChevronRight className="agent-suggestion-arrow" size={18}/>
        </button>)}
      </div>
    </section>}
    <section className="agent-chat-card" aria-label="Conversa com o Assistente EduTrack">
      <div className="agent-chat-heading"><MessageCircle size={26} aria-hidden="true"/><div><h2>Conversa com a IA</h2><p>Tire dúvidas, peça recomendações e receba orientações para seus estudos.</p></div></div>
        <div className="agent-messages" role="log" aria-live="polite" aria-label="Mensagens da conversa">{!messages.length&&<div className="agent-chat-welcome"><div className="agent-empty-icon"><MessageCircle size={25}/></div><h3>{conversationId?"Continue sua conversa":"Comece a conversar"}</h3><p>{conversationId?"O contexto salvo será usado ao enviar a próxima mensagem.":"Pergunte sobre tarefas, conteúdos ou seu progresso."}</p></div>}{messages.map((message, index) => <article key={message.id} ref={index===messages.length-1?latestMessageRef:undefined} className={`agent-message ${message.role}`}><div className="agent-message-meta"><span className={`agent-message-mark ${message.role}`}>{message.role === 'user' ? 'Você' : <Sparkles size={14}/>}</span><strong>{message.role === 'user' ? 'Você' : 'Assistente EduTrack'}</strong></div><div className="agent-message-body"><p>{message.text}</p>{message.response?.type === 'analysis' && <AnalysisDetails response={message.response}/>} {message.response?.type === 'action' && <ActionResult response={message.response}/>}</div></article>)}{busy && <div className="agent-processing" role="status"><span className="agent-processing-icon"><Sparkles size={15}/></span><span>Organizando uma resposta para você</span><span className="agent-dots"><i/><i/><i/></span></div>}<div ref={messagesEndRef}/></div>
        {error && <div className="agent-error" role="alert"><span>Não consegui concluir agora.</span><small>{error}</small><button type="button" onClick={() => setError('')}>Fechar</button></div>}
        <form onSubmit={submit} className="agent-composer"><label className="sr-only" htmlFor="agent-message">Mensagem para o Assistente EduTrack</label><textarea ref={textareaRef} id="agent-message" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => submitOnEnter(event, sendMessage)} placeholder="Pergunte sobre suas tarefas, estudos ou progresso..." maxLength={12000} rows={1}/><div className="agent-composer-footer"><span><Clock3 size={14}/> Enter envia · Shift + Enter quebra linha</span><button className="agent-send" type="submit" aria-label="Enviar mensagem" disabled={!input.trim() || busy}><Send size={18}/></button></div></form>
      </section>
      <div className="agent-trust-row"><span><ShieldCheck size={15}/> Dados protegidos</span><span><History size={15}/> Histórico protegido por conta</span><span><Check size={15}/> Ações validadas pelo servidor</span></div>
      {isDemo && <button className="button secondary agent-demo-action" type="button" onClick={() => editTask()}>Planejar uma tarefa manualmente <ArrowUp size={16}/></button>}
  </div>;
}
