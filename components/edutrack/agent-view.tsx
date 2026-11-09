"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, CalendarDays, Check, Clock3, ListChecks, MessageCircle, Sparkles, Target, WandSparkles } from 'lucide-react';
import { formatMinutes, lastSevenDays, type StudyData } from '@/lib/edutrack';
import { AgentChart } from './agent-chart';
import { AgentRequestError, chatWithAgent, type AgentResponse } from './agent-api';
import { Heading, type ViewProps } from './views';
import Link from './link';
import {navigateWithinStudy} from './navigation';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; response?: AgentResponse };

const suggestions = [
  { label: 'Ver minhas tarefas', prompt: 'Quais são minhas tarefas?', icon: ListChecks },
  { label: 'Analisar meu desempenho', prompt: 'Como está meu desempenho?', icon: Target },
  { label: 'Ver tendências de estudo', prompt: 'Mostre minhas tendências de estudo', icon: CalendarDays },
  { label: 'Praticar com um quiz', prompt: 'Monte um quiz com base nas minhas matérias e atividades e abra no Laboratório.', icon: WandSparkles },
  { label: 'Criar flashcards', prompt: 'Crie flashcards dos assuntos em que mais errei e abra o Laboratório.', icon: BookOpen },
  { label: 'Preparar um simulado', prompt: 'Prepare um simulado de 30 questões sobre a matéria que mais preciso revisar.', icon: BookOpen },
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

  return <>
    <Heading title="Seu espaço para pensar melhor" description={isDemo ? 'Explore uma prévia segura usando apenas os dados locais da demonstração.' : 'Converse com seu assistente acadêmico com contexto e segurança.'}/>
    <div className="agent-shell">
      <header className="agent-header"><div className="agent-identity"><div className="agent-avatar"><Sparkles size={21}/></div><div><strong>Assistente EduTrack</strong><span>Seu parceiro de estudos</span></div></div><div className="agent-status"><span className="agent-status-dot"/>{isDemo ? 'Modo demonstração' : 'Pronto para ajudar'}</div></header>
      {conversationId&&<div className="inline-actions"><button type="button" className="button secondary" disabled={busy} onClick={newConversation}>Nova conversa</button>{!messages.length&&<p className="form-note">Conversa anterior retomada. O contexto salvo será usado ao enviar sua próxima mensagem.</p>}</div>}
      {!messages.length && <section className="agent-empty-state"><div className="agent-empty-icon"><WandSparkles size={27}/></div><span className="eyebrow">ASSISTENTE ACADÊMICO</span><h2>Qual é o próximo passo?</h2><p>Organize tarefas, entenda seu ritmo de estudo e encontre prioridades com uma conversa simples.</p><div className="agent-suggestions">{suggestions.map(({ label, prompt, icon: Icon }) => <button className="agent-suggestion" key={prompt} type="button" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}><Icon size={17}/><span>{label}</span><ArrowUp size={15}/></button>)}</div></section>}
      <section className="agent-chat-card" aria-label="Conversa com o Assistente EduTrack">
        <div className="agent-chat-heading"><div><span className="agent-section-kicker"><MessageCircle size={14}/> CONVERSA</span><h2>{messages.length ? 'Continuar conversa' : 'Comece quando quiser'}</h2></div><span className="agent-privacy"><Check size={14}/> Dados protegidos</span></div>
        <div className="agent-messages" role="log" aria-live="polite" aria-label="Mensagens da conversa">{messages.map((message, index) => <article key={message.id} ref={index===messages.length-1?latestMessageRef:undefined} className={`agent-message ${message.role}`}><div className="agent-message-meta"><span className={`agent-message-mark ${message.role}`}>{message.role === 'user' ? 'Você' : <Sparkles size={14}/>}</span><strong>{message.role === 'user' ? 'Você' : 'Assistente EduTrack'}</strong></div><div className="agent-message-body"><p>{message.text}</p>{message.response?.type === 'analysis' && <AnalysisDetails response={message.response}/>} {message.response?.type === 'action' && <ActionResult response={message.response}/>}</div></article>)}{busy && <div className="agent-processing" role="status"><span className="agent-processing-icon"><Sparkles size={15}/></span><span>Organizando uma resposta para você</span><span className="agent-dots"><i/><i/><i/></span></div>}<div ref={messagesEndRef}/></div>
        {error && <div className="agent-error" role="alert"><span>Não consegui concluir agora.</span><small>{error}</small><button type="button" onClick={() => setError('')}>Fechar</button></div>}
        <form onSubmit={submit} className="agent-composer"><label className="sr-only" htmlFor="agent-message">Mensagem para o Assistente EduTrack</label><textarea ref={textareaRef} id="agent-message" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => submitOnEnter(event, sendMessage)} placeholder="Pergunte sobre suas tarefas, estudos ou progresso..." maxLength={12000} rows={1}/><div className="agent-composer-footer"><span><Clock3 size={14}/> Enter envia · Shift + Enter quebra linha</span><button className="agent-send" type="submit" aria-label="Enviar mensagem" disabled={!input.trim() || busy}><ArrowUp size={19}/></button></div></form>
      </section>
      <div className="agent-trust-row"><span><Check size={15}/> Ações passam por validação do backend</span><span><Check size={15}/> Histórico protegido por conta</span></div>
      {isDemo && <button className="button secondary agent-demo-action" type="button" onClick={() => editTask()}>Planejar uma tarefa manualmente <ArrowUp size={16}/></button>}
    </div>
  </>;
}
