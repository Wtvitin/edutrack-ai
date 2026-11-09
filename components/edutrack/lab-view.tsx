"use client";

import {useSearchParams} from 'next/navigation';
import {useCallback,useEffect,useEffectEvent,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,Clock3,FlaskConical,Lightbulb,RotateCcw,ShieldCheck,Sparkles,Target,Trophy} from 'lucide-react';
import type {StudyData} from '@/lib/edutrack';
import type {LabActivity,LabConfig,LabOverview} from '@/lib/lab-types';
import {studyModes} from '@/lib/lab-schemas.mjs';
import Link from './link';
import {LabFeedback} from './lab-feedback';
import {Pagination} from './pagination';
import {FlashcardsView} from './flashcards-view';
import {ExamView} from './exam-view';
import {labRequest} from './lab-api';

const difficulties={easy:'Fácil',medium:'Intermediária',hard:'Difícil',mixed:'Mista'};
const empty:LabOverview={summary:{completed:0,answered:0,correct:0,accuracy:0,bySubject:[],difficulties:[]},activities:[],historyLimited:false};
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const duration=(seconds:number|null)=>seconds==null?'—':`${Math.floor(seconds/60)}min ${seconds%60}s`;

export function LabView({data,mode}:{data:StudyData;mode:'account'|'demo'}){
  const search=useSearchParams(),area=search.get('aba'),requestedActivity=search.get('atividade');
  const tab=area==='flashcards'?'flashcards':'activities';
  function changeTab(next:'activities'|'flashcards'){const url=new URL(window.location.href);if(next==='flashcards')url.searchParams.set('aba','flashcards');else{url.searchParams.delete('aba');url.searchParams.delete('baralho');url.searchParams.delete('sessao');url.searchParams.delete('fonte');}window.history.replaceState(null,'',url.pathname+url.search);}
  const [historyPage,setHistoryPage]=useState(1);
  const [overview,setOverview]=useState<LabOverview>(empty),[loading,setLoading]=useState(mode==='account'),[loaded,setLoaded]=useState(mode==='demo');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[activity,setActivity]=useState<LabActivity|null>(null);
  const [index,setIndex]=useState(0),[selection,setSelection]=useState<number|null>(null),[showForm,setShowForm]=useState(false);
  const [subjectId,setSubjectId]=useState(''),[topic,setTopic]=useState(''),[sourceText,setSourceText]=useState('');
  const [count,setCount]=useState<LabConfig['count']>(5),[difficulty,setDifficulty]=useState<LabConfig['difficulty']>('mixed');
  const [alternatives,setAlternatives]=useState<4|5>(4),[correction,setCorrection]=useState<'immediate'|'end'>('immediate');
  const [pending,setPending]=useState<LabConfig|null>(null);
  const [prompt,setPrompt]=useState(''),[advanced,setAdvanced]=useState(false),[autoPending,setAutoPending]=useState<{requestId:string;prompt:string}|null>(null);
  const [reviewBusy,setReviewBusy]=useState(false),[reviewError,setReviewError]=useState('');
  const inFlight=useRef(false),alive=useRef(true),heading=useRef<HTMLHeadingElement>(null);
  const refresh=useCallback(async()=>{const value=await labRequest<LabOverview>('/api/lab?page='+historyPage);if(alive.current){setOverview(value);setLoaded(true);}},[historyPage]);
  const [openingId,setOpeningId]=useState<string|null>(null);
  const opening=openingId!==null&&openingId===requestedActivity&&tab==='activities';
  const refreshAfterGeneration=useEffectEvent(()=>{void refresh().catch(()=>{});});
  useEffect(()=>{
    alive.current=true;
    if(mode==='account'){
      void refresh().catch(e=>{if(alive.current)setError(e instanceof Error?e.message:'Não foi possível carregar o histórico.');})
        .finally(()=>{if(alive.current)setLoading(false);});
    }
    return()=>{alive.current=false;};
  },[mode,refresh]);

  useEffect(()=>{
    if(mode!=='account'||tab!=='activities'||!requestedActivity||!/^[a-f\d-]{36}$/i.test(requestedActivity))return;
    const path='/api/lab/quizzes/'+requestedActivity;
    let active=true;
    const show=(next:LabActivity)=>{
      if(!active)return;
      setActivity(next);
      setSelection(null);
      setShowForm(false);
      setIndex(Math.max(0,next.questions.findIndex(q=>q.selectedIndex===null)));
    };
    async function openRequested(){
      setOpeningId(requestedActivity);
      setError('');
      try{
        const draft=await labRequest<LabActivity>(path);
        if(!active)return;
        show(draft);
        requestAnimationFrame(()=>{if(active)document.getElementById('lab-activity-panel')?.focus();});
        if(draft.mode==='quiz'&&draft.status==='draft'){
          try{show(await labRequest<LabActivity>(path+'/generate',{}));}
          catch(e){show(await labRequest<LabActivity>(path));throw e;}
          finally{if(active)refreshAfterGeneration();}
        }
      }catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível abrir a atividade.');}
      finally{if(active)setOpeningId(null);}
    }
    void openRequested();
    return()=>{active=false;};
  },[mode,tab,requestedActivity]);
  async function perform(work:()=>Promise<void>){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try{await work();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível concluir.');}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  function display(next:LabActivity){
    if(!alive.current)return;
    setActivity(next);setSelection(null);setShowForm(false);
    const url=new URL(window.location.href);url.searchParams.set('atividade',next.id);window.history.replaceState(null,'',url.pathname+url.search);
    requestAnimationFrame(()=>heading.current?.focus());
  }
  function generate(event:FormEvent){
    event.preventDefault();void perform(async()=>{
      const request=pending??{requestId:crypto.randomUUID(),subjectId:subjectId||null,topic,sourceText,count,difficulty,alternatives,correction};
      setPending(request);
      const result=await labRequest<LabActivity>('/api/lab/quizzes',request);
      display(result);setIndex(0);setPending(null);await refresh();
    });
  }
  function generateAutomatic(event:FormEvent){
    event.preventDefault();void perform(async()=>{
      const request=autoPending||{requestId:crypto.randomUUID(),prompt};setAutoPending(request);
      const draft=await labRequest<LabActivity>('/api/lab/requests',request);
      setAutoPending(null);
      display(draft);
      setIndex(0);
    });
  }
  function open(id:string){
    if(opening)return;
    const url=new URL(window.location.href);
    if(url.searchParams.get('atividade')===id){
      void perform(async()=>{display(await labRequest<LabActivity>('/api/lab/quizzes/'+id));requestAnimationFrame(()=>document.getElementById('lab-activity-panel')?.focus());});
      return;
    }
    url.searchParams.set('atividade',id);
    window.history.replaceState(null,'',url.pathname+url.search);
  }
  function retryQuiz(id:string){void perform(async()=>{
    const path='/api/lab/quizzes/'+id;
    try{display(await labRequest<LabActivity>(path+'/generate',{retry:true}));}
    catch(e){display(await labRequest<LabActivity>(path));throw e;}
    finally{await refresh().catch(()=>{});}
  });}
  function go(next:number){setIndex(next);setSelection(null);requestAnimationFrame(()=>heading.current?.focus());}
  function saveAnswer(option=selection){if(!activity||option===null)return;void perform(async()=>{
    const next=await labRequest<LabActivity>(`/api/lab/quizzes/${activity.id}/answers`,{questionIndex:index,optionIndex:option});
    display(next);await refresh();
  });}
  async function analyze(id:string,retry=false){
    setReviewBusy(true);setReviewError('');
    try{const reviewed=await labRequest<LabActivity>(`/api/lab/quizzes/${id}/review`,retry?{retry:true}:{});if(activity?.id===id)setActivity(reviewed);}
    catch(cause){setReviewError(cause instanceof Error?cause.message:'A análise não foi concluída. Seus resultados estão salvos.');}
    finally{setReviewBusy(false);await refresh();}
  }
  function finish(){if(!activity)return;void perform(async()=>{
    const completed=await labRequest<LabActivity>(`/api/lab/quizzes/${activity.id}/finish`,{});display(completed);setIndex(0);await refresh();
    if(completed.review.state==='idle')await analyze(completed.id);
  });}
  function newQuiz(){setPending(null);setAutoPending(null);setActivity(null);setShowForm(true);setAdvanced(false);setError('');const url=new URL(window.location.href);url.searchParams.delete('atividade');window.history.replaceState(null,'',url.pathname+url.search);}
  function newExam(){void perform(async()=>{display(await labRequest<LabActivity>('/api/lab/exams',{requestId:crypto.randomUUID(),prompt:'Prepare um simulado sobre a matéria que mais preciso revisar.'}));await refresh();});}
  function closeActivity(){setActivity(null);const url=new URL(window.location.href);url.searchParams.delete('atividade');window.history.replaceState(null,'',url.pathname+url.search);}
  const question=activity?.questions[index],summary=overview.summary;

  const tabs=<nav className="lab-area-tabs" aria-label="Modalidades do Laboratório"><button className="button secondary" aria-pressed={tab==='activities'} onClick={()=>changeTab('activities')}>Quizzes e simulados</button><button className="button secondary" aria-pressed={tab==='flashcards'} onClick={()=>changeTab('flashcards')}>Flashcards e revisão</button></nav>;
  if(tab==='flashcards')return <div className="lab-page">{tabs}<FlashcardsView data={data} mode={mode}/></div>;
  return <div className="lab-page">{tabs}
    <div className="page-heading"><div><div className="eyebrow">SEU ESPAÇO PARA DESCOBRIR</div><h1>Aprender também é experimentar<span className="heading-dot">.</span></h1><p>Pratique, entenda seus erros e descubra seu próximo passo.</p></div><div className="lab-launch-actions"><button className="button secondary" onClick={newExam} disabled={busy||mode==='demo'}><BookOpen size={17}/>Novo simulado</button><button className="button primary" onClick={newQuiz} disabled={busy||mode==='demo'}><Sparkles size={17}/>Novo quiz</button></div></div>
    {mode==='demo'&&<div className="lab-notice" role="note"><ShieldCheck size={22}/><p><strong>Conheça o Laboratório de Estudos.</strong> Entre na sua conta para gerar quizzes e salvar sua evolução. Nenhuma questão ou estatística fictícia foi incluída.</p><Link href="/login" className="button secondary">Entrar</Link></div>}
    {error&&<div className="lab-error" role="alert"><p>{error}</p><button className="button secondary" disabled={busy} onClick={()=>void perform(refresh)}>Atualizar histórico</button></div>}
    {loading&&!activity?<section className="panel lab-loading" role="status"><span className="lab-skeleton"/>Carregando seu aprendizado…</section>:!loaded&&!activity?<section className="panel lab-empty"><h2>Seus indicadores estão indisponíveis.</h2><p>Atualize o histórico para tentar carregá-los novamente.</p></section>:<>
      <div className="lab-metrics" aria-label="Indicadores de aprendizado">
        {[{icon:Trophy,value:summary.completed,label:'Avaliações concluídas'},{icon:Check,value:summary.answered,label:'Questões respondidas'},{icon:Target,value:summary.completed?`${summary.accuracy}%`:'—',label:'Acertos em avaliações concluídas'},{icon:BookOpen,value:summary.bySubject.length,label:'Disciplinas e assuntos praticados'}].map(({icon:Icon,value,label})=><article className="panel lab-metric" key={label}><Icon size={19}/><strong>{value}</strong><span>{label}</span></article>)}
      </div>

      {!activity&&!showForm&&<section className="lab-hero" aria-labelledby="lab-hero-title"><div><span className="lab-kicker"><FlaskConical size={18}/>LABORATÓRIO DE ESTUDOS</span><h2 id="lab-hero-title">Transforme curiosidade<br/>em conhecimento.</h2><p>Escolha um assunto. Receba perguntas, pratique no seu ritmo e volte ao que merece mais atenção.</p><button className="button primary" onClick={newQuiz} disabled={mode==='demo'}>Começar um quiz<ArrowRight size={17}/></button><span className="lab-hero-note"><Clock3 size={14}/>Seu progresso fica salvo a cada resposta.</span></div><div className="lab-illustration" aria-hidden="true"><div className="lab-orbit"/><div className="lab-orbit second"/><div className="lab-orbit-core"><FlaskConical size={52}/></div><span className="lab-float one"><Lightbulb size={22}/></span><span className="lab-float two"><Check size={22}/></span><span className="lab-float three"><Sparkles size={20}/></span></div></section>}

      {showForm&&<section className="panel lab-builder" aria-labelledby="lab-builder-title"><div className="lab-section-heading"><div><span className="lab-kicker">PEÇA. PRATIQUE. EVOLUA.</span><h2 id="lab-builder-title">O que você quer praticar?</h2><p>A IA organiza o quiz com base nas suas disciplinas e atividades. Você só precisa dizer o assunto.</p></div><span className="pill purple">Preparação automática</span></div>
        <form onSubmit={generateAutomatic} className="lab-auto-form"><label htmlFor="lab-study-request">Seu pedido de estudo</label><textarea id="lab-study-request" value={prompt} maxLength={1000} rows={3} disabled={busy||!!autoPending} onChange={e=>setPrompt(e.target.value)} placeholder="Monte um quiz de SQL com base na minha matéria de Banco de Dados e nas minhas atividades."/><p>5 a 20 questões, 4 ou 5 alternativas e dificuldade mista. Quantidade e ordem são sorteadas; cada seleção recebe correção imediata.</p><div className="lab-actions"><button className="button primary" disabled={busy||mode==='demo'||(!autoPending&&prompt.trim().length<3)}><Sparkles size={17}/>{busy?'Preparando seu quiz…':autoPending?'Recuperar pedido':'Criar quiz com IA'}</button><Link className="button secondary" href="/agente">Pedir pelo agente<ArrowRight size={16}/></Link></div><small>O contexto acadêmico relevante da sua conta será enviado ao provedor configurado. Conteúdo gerado por IA pode conter erros.</small></form>
        <button className="text-link lab-advanced-toggle" disabled={busy} aria-expanded={advanced} onClick={()=>setAdvanced(value=>!value)}>{advanced?'Ocultar ajustes manuais':'Configuração avançada (opcional)'}</button>
        {advanced&&<form onSubmit={generate} className="lab-form"><fieldset disabled={busy||!!pending}><legend className="sr-only">Configuração do quiz</legend>
          <label>Disciplina<select aria-label="Disciplina" value={subjectId} onChange={e=>setSubjectId(e.target.value)}><option value="">Assunto livre</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Assunto<input maxLength={160} value={topic} placeholder="Ex.: funções do segundo grau" onChange={e=>setTopic(e.target.value)}/></label>
          <label className="lab-wide">Material de referência <span className="muted">(opcional)</span><textarea value={sourceText} maxLength={12000} rows={5} placeholder="Cole um trecho de suas anotações. Não inclua dados pessoais." onChange={e=>setSourceText(e.target.value)} aria-describedby="lab-source-note"/><small id="lab-source-note">{sourceText.length.toLocaleString('pt-BR')}/12.000 caracteres. Somente o texto e a disciplina escolhida serão enviados à IA.</small></label>
          <label>Quantidade de perguntas<select aria-label="Quantidade de perguntas" value={count} onChange={e=>setCount(Number(e.target.value) as LabConfig['count'])}>{[5,10,15,20].map(n=><option key={n} value={n}>{n} perguntas</option>)}</select></label>
          <label>Dificuldade<select aria-label="Dificuldade" value={difficulty} onChange={e=>setDifficulty(e.target.value as LabConfig['difficulty'])}>{Object.entries(difficulties).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label>Alternativas<select aria-label="Alternativas" value={alternatives} onChange={e=>setAlternatives(Number(e.target.value) as 4|5)}><option value={4}>4 alternativas</option><option value={5}>5 alternativas</option></select></label>
          <label>Quando corrigir<select aria-label="Quando corrigir" value={correction} onChange={e=>setCorrection(e.target.value as 'immediate'|'end')}><option value="immediate">Após cada resposta</option><option value="end">Ao concluir o quiz</option></select></label>
        </fieldset><div className="lab-notice compact"><ShieldCheck size={18}/><p>Questões geradas por IA podem conter erros. Confira as explicações com seu material. Até 4 gerações em 15 minutos e 12 em 24 horas.</p></div>
        <div className="lab-actions"><button className="button primary" disabled={busy||mode==='demo'} type="submit"><Sparkles size={17}/>{busy?'Preparando suas questões…':pending?'Recuperar pedido anterior':'Gerar quiz'}</button><button className="button secondary" type="button" disabled={busy} onClick={()=>{setPending(null);setShowForm(false);}}>Voltar ao laboratório</button></div>
        {pending&&!busy&&<p className="lab-caption">O pedido anterior será recuperado com o mesmo identificador. Isso evita uma nova geração ao repetir o envio.</p>}
        </form>}</section>}

      {activity?.mode==='exam'&&<div id="lab-activity-panel" tabIndex={-1}><ExamView key={activity.id} activity={activity} data={data} onChange={next=>setActivity(current=>current?.id===next.id?next:current)} onRefresh={refresh} onCompleted={async next=>{display(next);await refresh();if(next.review.state==='idle')await analyze(next.id);}} onExit={closeActivity}/></div>}
      {activity&&activity.mode==='quiz'&&<section className="panel lab-runner" id="lab-activity-panel" tabIndex={-1} aria-label="Atividade de quiz">
        <div className="lab-section-heading"><div><span className="lab-kicker">{activity.subjectName}</span><h2>{activity.topic}</h2></div><button className="button secondary" disabled={busy} onClick={()=>{setActivity(null);const url=new URL(window.location.href);url.searchParams.delete('atividade');window.history.replaceState(null,'',url.pathname+url.search);}}>Ver laboratório</button></div>
        {activity.status==='generating'||activity.status==='draft'?<div className="lab-empty" role="status"><Sparkles size={28}/><h3>Suas questões estão sendo preparadas.</h3><p>Buscando o contexto das suas matérias e atividades. O mesmo pedido não gera cobranças duplicadas ao ser recuperado.</p><button className="button secondary" disabled={busy||opening} onClick={()=>open(activity.id)}>Verificar atividade</button></div>:activity.status==='failed'?<div className="lab-empty"><RotateCcw size={28}/><h3>Esta geração não foi concluída.</h3><p>{activity.errorCode==='lab-invalid-generation'?'As questões foram rejeitadas pela validação.':activity.errorCode==='provider-timeout'?'A IA demorou além do limite para gerar as questões.':'A geração foi interrompida antes que as questões ficassem disponíveis.'} Nenhuma resposta foi perdida. Uma nova tentativa precisa ser iniciada por você.</p>{activity.canRetryGeneration?<button className="button primary" disabled={busy||opening} onClick={()=>retryQuiz(activity.id)}>Tentar gerar novamente</button>:<button className="button primary" disabled={busy} onClick={newQuiz}>Configurar outro quiz</button>}</div>:<>
          {activity.automatic&&<div className="lab-auto-context"><Sparkles size={17}/><span>Preparado pela IA · {activity.count} questões · {activity.alternatives} alternativas · {activity.contextSummary?.taskCount||0} atividades de referência · ordem aleatória</span></div>}
          {activity.status==='completed'&&<div className="lab-result" role="status"><Trophy size={35}/><div><span>ATIVIDADE CONCLUÍDA</span><h3>{activity.score} de {activity.count} acertos <span>· {activity.accuracy}%</span></h3><p>{activity.count-(activity.score||0)} erros · Tempo decorrido: {duration(activity.durationSeconds)}. Revise as explicações abaixo.</p></div></div>}
          <div className="lab-progress-heading"><span>{activity.status==='completed'?'Revisão':'Seu progresso'}</span><strong>{activity.answered}/{activity.count} respondidas</strong></div><progress className="lab-progress" value={activity.answered} max={activity.count} aria-label="Questões respondidas"/>
          <nav className="lab-question-picker" aria-label="Questões do quiz">{activity.questions.map(q=><button key={q.index} aria-label={`Questão ${q.index+1}${q.selectedIndex!==null?', respondida':''}`} aria-current={index===q.index?'step':undefined} className={q.selectedIndex!==null?'answered':''} onClick={()=>go(q.index)} disabled={busy}>{q.index+1}</button>)}</nav>
          {question&&<div className="lab-question"><div className="lab-question-top"><span>QUESTÃO {index+1} DE {activity.count}</span><span>{difficulties[question.difficulty]}</span></div><h3 tabIndex={-1} ref={heading}>{question.prompt}</h3>
            <fieldset className="lab-options" disabled={busy||question.selectedIndex!==null}><legend className="sr-only">Escolha uma alternativa para a questão {index+1}</legend>{question.options.map((option,i)=><label key={i} className={`${question.selectedIndex===i||selection===i?'selected':''} ${question.correctIndex===i?'correct':''} ${question.isCorrect===false&&question.selectedIndex===i?'incorrect':''}`}><input type="radio" name={`question-${activity.id}-${index}`} value={i} checked={(question.selectedIndex??selection)===i} onChange={()=>{setSelection(i);if(activity.correction==='immediate')saveAnswer(i);}}/><span className="lab-option-letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{question.correctIndex===i&&<Check size={18} aria-label="Alternativa correta"/>}</label>)}</fieldset>
            {question.selectedIndex===null?(activity.correction==='immediate'?<p className="lab-caption" role="status">{busy?'Salvando sua resposta…':'Selecione uma alternativa para ver a correção. A escolha será salva automaticamente.'}</p>:<button className="button primary" disabled={busy||selection===null} onClick={()=>saveAnswer()}>{busy?'Salvando…':'Confirmar resposta'}</button>):<p className={`lab-saved ${question.isCorrect===false?'wrong':''}`} role="status"><Check size={16}/>{question.isCorrect===undefined?'Resposta salva. A correção será exibida ao concluir.':question.isCorrect?'Correto! Confira a explicação abaixo.':'Incorreto. A alternativa certa está em verde; entenda o motivo abaixo.'}</p>}
            {question.explanation&&<div className="lab-explanation"><strong>{question.isCorrect?'Você acertou!':'Vamos entender a resposta.'}</strong><p><b>Resposta:</b> {question.explanation.answer}</p><p>{question.explanation.reason}</p></div>}
            <div className="lab-provenance"><BookOpen size={16}/><div><strong>{question.grounding==='material'?'Referência no material fornecido':question.grounding==='extra'?'Conteúdo complementar — não sustentado pelo material fornecido':'Conhecimento geral gerado por IA'}</strong>{question.sourceQuote&&<blockquote>{question.sourceQuote}</blockquote>}<p>A coerência e a veracidade não foram verificadas automaticamente. Confira com suas referências.</p></div></div>
            <div className="lab-actions spread"><button className="button secondary" disabled={busy||index===0} onClick={()=>go(index-1)}><ArrowLeft size={16}/>Anterior</button>{index<activity.count-1?<button className="button secondary" disabled={busy} onClick={()=>go(index+1)}>Próxima<ArrowRight size={16}/></button>:activity.status!=='completed'&&<button className="button primary" disabled={busy||activity.answered!==activity.count} onClick={finish}><Trophy size={17}/>Concluir quiz</button>}</div>
          </div>}
          {activity.answered===activity.count&&activity.status!=='completed'&&index<activity.count-1&&<button className="button primary lab-finish" disabled={busy} onClick={finish}>Concluir e ver resultado<Trophy size={17}/></button>}
          {activity.sourceText&&<details className="lab-source"><summary>Consultar o material original</summary><p>{activity.sourceText}</p></details>}
        </>}
      </section>}

      <div className="lab-insights-grid"><section className="panel lab-evolution" aria-labelledby="lab-evolution-title"><div className="lab-section-heading"><div><span className="lab-kicker">CADA TENTATIVA CONTA</span><h2 id="lab-evolution-title">Sua evolução</h2></div><Target size={22}/></div>{summary.bySubject.length?summary.bySubject.map(subject=><div className="lab-subject" key={subject.subjectId||subject.name}><div><strong>{subject.name}</strong><span>{subject.accuracy}% · {subject.quizzes} avaliações</span></div><progress value={subject.accuracy} max={100} aria-label={`Acertos em ${subject.name}`}/><div className="lab-trend" aria-label={`Últimos resultados de ${subject.name}`}>{subject.points.map((point,i)=><button key={point.id} title={`${date(point.date)}: ${point.accuracy}%`} aria-label={`Revisar resultado ${i+1}: ${point.accuracy}%`} onClick={()=>open(point.id)} disabled={busy}><span style={{height:`${Math.max(4,point.accuracy)}%`}}/><small>{point.accuracy}%</small></button>)}</div></div>):<div className="lab-empty"><Target size={27}/><h3>Seu primeiro passo aparece aqui.</h3><p>Conclua um quiz para acompanhar os resultados por disciplina.</p></div>}</section>
      <section className="panel lab-difficulties" aria-labelledby="lab-difficulties-title"><div className="lab-section-heading"><div><span className="lab-kicker">UM CONVITE À REVISÃO</span><h2 id="lab-difficulties-title">Onde focar agora</h2></div><Lightbulb size={23}/></div><Link className="text-link" href="/laboratorio?aba=flashcards">Organizar revisões com flashcards<ArrowRight size={15}/></Link><LabFeedback review={overview.aiReview} busy={reviewBusy} error={reviewError} onAnalyze={(id,retry)=>void perform(()=>analyze(id,retry))} onOpen={open}/>{summary.difficulties.length?<><h3 className="lab-error-count-title">Erros e omissões nas avaliações</h3><ol>{summary.difficulties.map((item,i)=><li key={`${item.subjectName}-${item.topic}`}><span className="lab-difficulty-rank">{i+1}</span><div><strong>{item.topic}</strong><small>{item.subjectName}</small></div><span>{item.errors} {item.errors===1?'erro':'erros'}{item.unanswered?` · ${item.unanswered} em branco`:''}</span></li>)}</ol></>:<div className="lab-empty"><Lightbulb size={28}/><h3>Erros também ensinam.</h3><p>Os assuntos com mais erros nos quizzes concluídos aparecerão aqui.</p></div>}<p className="lab-caption">Estatísticas calculadas pelo sistema. A IA interpreta os resultados sem alterar suas notas.</p></section></div>

      <section className="panel lab-history" aria-labelledby="lab-history-title"><div className="lab-section-heading"><div><span className="lab-kicker">CONTINUE DE ONDE PAROU</span><h2 id="lab-history-title">Suas atividades</h2></div><button className="text-link" disabled={busy||mode==='demo'} onClick={()=>void perform(refresh)}><RotateCcw size={15}/>Atualizar</button></div>{overview.activities.length?<div className="lab-history-list">{overview.activities.map(item=><button key={item.id} className="lab-history-item" disabled={busy} onClick={()=>open(item.id)}><span className="lab-history-icon"><FlaskConical size={21}/></span><span><strong>{item.topic}</strong><small>{item.subjectName} · {item.count} {item.status==='failed'||item.status==='draft'||item.status==='generating'?'questões previstas':'questões'} · {date(item.createdAt)}</small></span><span className={`lab-history-status ${item.status}`}>{item.status==='completed'?`${item.score}/${item.count} acertos`:item.status==='ready'?'Continuar':item.status==='generating'?'Preparando':item.status==='failed'?'Falha na geração':'Abrir rascunho'}</span><ArrowRight size={17}/></button>)}</div>:<div className="lab-empty"><BookOpen size={27}/><h3>Seu histórico começa com uma pergunta.</h3><p>Suas atividades e respostas ficarão disponíveis para continuar e revisar.</p></div>}<p className="lab-caption">Os indicadores consideram todo o histórico das avaliações.</p>{overview.pagination&&<Pagination info={overview.pagination} label="Atividades" disabled={busy} onChange={setHistoryPage}/>}</section>
      <section className="lab-modes" aria-labelledby="lab-modes-title"><h2 id="lab-modes-title">Novas formas de aprender</h2><p>O quiz é o primeiro passo. As modalidades abaixo continuam em planejamento.</p><div>{studyModes.filter(item=>!item.available).map(item=><article key={item.id}><BookOpen size={18}/><strong>{item.label}</strong><span>Em planejamento</span></article>)}</div></section>
    </>}
    {(busy||opening)&&<p className="lab-busy" role="status" aria-live="polite">Processando atividade. Aguarde antes de enviar novamente.</p>}
  </div>;
}
