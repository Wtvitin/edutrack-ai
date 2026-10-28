"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, CalendarDays, Check, Clock3, ListChecks, MessageCircle, Sparkles, Target, WandSparkles } from 'lucide-react';
import { formatMinutes, lastSevenDays, type StudyData } from '@/lib/edutrack';
import { AgentChart } from './agent-chart';
import { analyticsMetadata, formatAnalyticsCount } from './analytics-presentation.mjs';
import { chatWithAgent, type AgentResponse } from './agent-api';
import { Heading, type ViewProps } from './views';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; response?: AgentResponse };

const suggestions = [
  { label: 'Ver minhas tarefas', prompt: 'Quais são minhas tarefas?', icon: ListChecks },
  { label: 'Analisar meu desempenho', prompt: 'Como está meu desempenho?', icon: Target },
  { label: 'Ver tendências de estudo', prompt: 'Mostre minhas tendências de estudo', icon: CalendarDays },
];

function responseText(response: AgentResponse) {
  if (response.type === 'text') return response.content;
  if (response.type === 'analysis') return response.analysis;
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
  const title = typeof result.title === 'string' ? result.title : 'Tarefa atualizada';
  const dueDate = typeof result.dueDate === 'string' && result.dueDate ? result.dueDate : null;
  return <div className="agent-action-result"><span className="agent-result-icon"><Check size={16}/></span><div><strong>{response.action === 'create_task' ? 'Tarefa criada' : response.action === 'complete_task' ? 'Tarefa concluída' : 'Tarefa atualizada'}</strong><span>{title}</span>{dueDate && <small>{dueDate}</small>}</div></div>;
}

function AnalysisDetails({ response }: { response: Extract<AgentResponse, { type: 'analysis' }> }) {
  const metrics = Object.entries(response.metrics).slice(0, 4).flatMap(([key, value]) => {
    const item = analyticsMetadata(key, value);
    if (!item) return [];
    return [{ ...item, value: key === 'count' ? formatAnalyticsCount(value, response.metrics.unit) : item.value }];
  });
  return <><div className="agent-metric-grid">{metrics.map(({ label, value }) => <div className="agent-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>{response.chart && <AgentChart chart={response.chart}/>}</>;
}

export function AgentView({ data, editTask }: Pick<ViewProps, 'data' | 'editTask'>) {
  const isDemo = !data.profile.id;
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);

  function sendMessage() {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setError('');
    setMessages(previous => [...previous, { id: `${Date.now()}-user`, role: 'user', text: message }]);
    if (isDemo) {
      const response = demoResponse(message, data);
      setMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', text: responseText(response), response }]);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const result = await chatWithAgent({ message, conversationId });
        setConversationId(result.conversationId);
        setMessages(previous => [...previous, { id: `${Date.now()}-assistant`, role: 'assistant', text: responseText(result.response), response: result.response }]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a conversa.');
      } finally {
        setBusy(false);
      }
    })();
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendMessage(); }

  return <>
    <Heading title="Seu espaço para pensar melhor" description={isDemo ? 'Explore uma prévia segura usando apenas os dados locais da demonstração.' : 'Converse com seu assistente acadêmico com contexto e segurança.'}/>
    <div className="agent-shell">
      <header className="agent-header"><div className="agent-identity"><div className="agent-avatar"><Sparkles size={21}/></div><div><strong>Assistente EduTrack</strong><span>Seu parceiro de estudos</span></div></div><div className="agent-status"><span className="agent-status-dot"/>{isDemo ? 'Modo demonstração' : 'Pronto para ajudar'}</div></header>
      {!messages.length && <section className="agent-empty-state"><div className="agent-empty-icon"><WandSparkles size={27}/></div><span className="eyebrow">ASSISTENTE ACADÊMICO</span><h2>Qual é o próximo passo?</h2><p>Organize tarefas, entenda seu ritmo de estudo e encontre prioridades com uma conversa simples.</p><div className="agent-suggestions">{suggestions.map(({ label, prompt, icon: Icon }) => <button className="agent-suggestion" key={prompt} type="button" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}><Icon size={17}/><span>{label}</span><ArrowUp size={15}/></button>)}</div></section>}
      <section className="agent-chat-card" aria-label="Conversa com o Assistente EduTrack">
        <div className="agent-chat-heading"><div><span className="agent-section-kicker"><MessageCircle size={14}/> CONVERSA</span><h2>{messages.length ? 'Continuar conversa' : 'Comece quando quiser'}</h2></div><span className="agent-privacy"><Check size={14}/> Dados protegidos</span></div>
        <div className="agent-messages" role="log" aria-live="polite" aria-label="Mensagens da conversa">{messages.map(message => <article key={message.id} className={`agent-message ${message.role}`}><div className="agent-message-meta"><span className={`agent-message-mark ${message.role}`}>{message.role === 'user' ? 'Você' : <Sparkles size={14}/>}</span><strong>{message.role === 'user' ? 'Você' : 'Assistente EduTrack'}</strong></div><div className="agent-message-body"><p>{message.text}</p>{message.response?.type === 'analysis' && <AnalysisDetails response={message.response}/>} {message.response?.type === 'action' && <ActionResult response={message.response}/>}</div></article>)}{busy && <div className="agent-processing" role="status"><span className="agent-processing-icon"><Sparkles size={15}/></span><span>Organizando uma resposta para você</span><span className="agent-dots"><i/><i/><i/></span></div>}<div ref={messagesEndRef}/></div>
        {error && <div className="agent-error" role="alert"><span>Não consegui concluir agora.</span><small>{error}</small><button type="button" onClick={() => setError('')}>Fechar</button></div>}
        <form onSubmit={submit} className="agent-composer"><label className="sr-only" htmlFor="agent-message">Mensagem para o Assistente EduTrack</label><textarea ref={textareaRef} id="agent-message" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => submitOnEnter(event, sendMessage)} placeholder="Pergunte sobre suas tarefas, estudos ou progresso..." maxLength={12000} rows={1}/><div className="agent-composer-footer"><span><Clock3 size={14}/> Enter envia · Shift + Enter quebra linha</span><button className="agent-send" type="submit" aria-label="Enviar mensagem" disabled={!input.trim() || busy}><ArrowUp size={19}/></button></div></form>
      </section>
      <div className="agent-trust-row"><span><Check size={15}/> Ações passam por validação do backend</span><span><Check size={15}/> Histórico protegido por conta</span></div>
      {isDemo && <button className="button secondary agent-demo-action" type="button" onClick={() => editTask()}>Planejar uma tarefa manualmente <ArrowUp size={16}/></button>}
    </div>
  </>;
}
