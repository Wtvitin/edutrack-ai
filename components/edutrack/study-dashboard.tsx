"use client";
import {useState} from 'react';
import {ArrowRight, CalendarDays, Check, Clock3, Plus, Target, TriangleAlert} from 'lucide-react';
import {dueLabel, formatMinutes, priorityLabels, type StudyData, type Task} from '@/lib/edutrack';
import {compareTasks, completionDay, isPending, priorities, shiftDay, taskCounts} from '@/lib/study-planning';
import {Progress} from '@/components/ui/progress';
import {Panel, PanelHeader, SubjectCards, TaskRow} from './app';
import {Choice} from './forms';
import {AnalyticsPanel} from './report-panel';
import {TaskDetails} from './task-details';
import Link from './link';
import {DeadlineBanner,PriorityGuide,useStudyDay} from './deadline-reminders';

export function StudyDashboard({data, toggle, newTask, editTask}: {data:StudyData; toggle:(id:string)=>void; newTask:()=>void; editTask:(task:Task)=>void}) {
  const [days,setDays] = useState(7), [subject,setSubject] = useState('all'), [slice,setSlice] = useState('pending');
  const [priority,setPriority] = useState('all'), [detailId,setDetailId] = useState('');
  const today = useStudyDay(), start = shiftDay(today, 1-days);
  const tasks = data.tasks.filter(t => subject === 'all' || t.subjectId === subject);
  const pending = tasks.filter(isPending).sort((a,b) => compareTasks(a,b,today));
  const counts = taskCounts(tasks,today);
  const done = tasks.filter(t => t.done && completionDay(t.completedAt) >= start && completionDay(t.completedAt) <= today);
  const minutes = data.sessions.filter(s => (subject === 'all' || s.subjectId === subject) && s.date >= start && s.date <= today).reduce((n,s)=>n+s.minutes,0);
  const displayed = (slice === 'done' ? done : pending.filter(t => slice === 'overdue' ? t.due && t.due < today : slice === 'upcoming' ? t.due && t.due >= today && t.due <= shiftDay(today,6) : true))
    .filter(t => priority === 'all' || t.priority === priority);
  const next = pending[0];
  const weekly = data.sessions.filter(s => s.date >= shiftDay(today,-6) && s.date <= today).reduce((n,s)=>n+s.minutes,0);
  const goal = data.profile.weeklyGoalMinutes || 0;
  const sliceLabels:Record<string,string> = {pending:'Pendentes',overdue:'Atrasadas',upcoming:'Próximos 7 dias',done:'Concluídas no período'};
  return <div className="dashboard-page study-dashboard-v2">
    <DeadlineBanner data={{...data,tasks}}/><PriorityGuide/>
    <div className="page-heading dashboard-heading"><div><div className="eyebrow">UM PASSO DE CADA VEZ</div><h1>Encontre seu foco de hoje<span className="heading-dot">.</span></h1><p>Olá, {data.profile.name.split(' ')[0]}. Seu tempo, suas prioridades, seu ritmo.</p></div><button className="button primary" onClick={newTask}><Plus size={18}/>Nova tarefa</button></div>
    <div className="dashboard-toolbar no-print"><Choice id="dashboard-subject" label="Disciplina do painel" value={subject} onChange={setSubject} options={[{value:'all',label:'Todas as disciplinas'},...data.subjects.map(s=>({value:s.id,label:s.name}))]}/><div><span className="field-label">Período de estudo e conclusões</span><div className="period-tabs" aria-label="Período do dashboard">{[7,30,90].map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{n} dias</button>)}</div></div>{data.profile.id&&<Link className="text-link" href="/laboratorio?aba=flashcards">Revisar com flashcards<ArrowRight size={16}/></Link>}<Link className="text-link" href="/relatorios">Relatório completo<ArrowRight size={16}/></Link></div>
    <div className="dashboard-metrics" aria-label="Resumo interativo"><Panel><span className="metric-icon purple"><Clock3 size={20}/></span><span>Tempo de estudo · {days} dias</span><strong>{formatMinutes(minutes)}</strong><Link className="text-link" href="/sessoes">Registrar uma sessão<ArrowRight size={15}/></Link></Panel>{[
      {id:'done',label:'Concluídas no período',value:done.length,Icon:Check,color:'green'},
      {id:'upcoming',label:'Entregas · próximos 7 dias',value:counts.upcoming,Icon:CalendarDays,color:'purple'},
      {id:'overdue',label:'Atrasadas agora',value:counts.overdue,Icon:TriangleAlert,color:'orange'},
    ].map(({id,label,value,Icon,color})=><button key={id} className={`dashboard-metric-button ${slice===id?'selected':''}`} aria-pressed={slice===id} onClick={()=>{setSlice(id);setPriority('all');}}><span className={`metric-icon ${color}`}><Icon size={20}/></span><span>{label}</span><strong>{value}</strong><small>Ver tarefas<ArrowRight size={14}/></small></button>)}</div>
    <div className="dashboard-grid"><div className="dashboard-main"><AnalyticsPanel data={data} compact period={days} subjectId={subject}/>
      <Panel className="dashboard-task-list"><PanelHeader title="Sua lista de foco"><Link className="text-link" href="/tarefas">Todas as tarefas<ArrowRight size={15}/></Link></PanelHeader>
        <div className="task-slice-tabs" aria-label="Filtrar lista do dashboard">{Object.entries(sliceLabels).map(([id,label])=><button key={id} aria-pressed={slice===id} onClick={()=>setSlice(id)}>{label}</button>)}</div>
        {priority!=='all' && <button className="active-filter" onClick={()=>setPriority('all')}>Prioridade {priorityLabels[priority as Task['priority']]} · limpar ×</button>}
        <p className="form-note">{displayed.length} {displayed.length===1?'tarefa':'tarefas'}{slice==='pending'?' · atrasadas → hoje/amanhã → 2–3 dias → demais; prioridade dentro de cada grupo':''}</p>
        {displayed.length ? displayed.slice(0,6).map(task=><div className="dashboard-task-item" key={task.id}><TaskRow task={task} data={data} toggle={toggle}/><button className="icon-button" aria-label={`Detalhes de ${task.title}`} onClick={()=>setDetailId(task.id)}><ArrowRight size={18}/></button></div>) : <div className="empty-state compact-empty"><Check size={24}/><h3>Nenhuma tarefa neste filtro</h3><p>Você pode mudar o filtro ou planejar uma nova atividade.</p></div>}
        {displayed.length>6 && <Link className="text-link" href="/tarefas">Ver mais {displayed.length-6} tarefas<ArrowRight size={15}/></Link>}
      </Panel></div>
      <aside className="dashboard-aside"><Panel className="next-step-panel"><span className="eyebrow"><Target size={15}/>SEU PRÓXIMO PASSO</span><h2>{next?.title || 'Um espaço para começar'}</h2><p>{next ? `${data.subjects.find(s=>s.id===next.subjectId)?.name||'Sem disciplina'} · ${dueLabel(next.due)}` : 'Registre uma tarefa ou reserve alguns minutos para estudar.'}</p>{next && <span className={`priority-tag priority-${next.priority}`}>{priorityLabels[next.priority]}</span>}
        {next ? <button className="button primary full-width" onClick={()=>setDetailId(next.id)}>Ver detalhes<ArrowRight size={17}/></button> : <button className="button primary full-width" onClick={newTask}><Plus size={17}/>Planejar tarefa</button>}<Link className="text-link" href="/sessoes">Começar uma sessão<ArrowRight size={15}/></Link></Panel>
        <Panel className="weekly-goal-panel"><PanelHeader title="Sua meta semanal"/><strong>{formatMinutes(weekly)}</strong>{goal ? <><p>de {formatMinutes(goal)} · últimos 7 dias</p><Progress value={Math.min(100,weekly/goal*100)} aria-label="Meta semanal de estudo"/><small>{weekly>=goal?'Meta alcançada. Cada sessão conta!':`${formatMinutes(goal-weekly)} para completar`}</small></> : <p>Defina uma meta de tempo que faça sentido para você.</p>}<Link className="text-link" href="/configuracoes">{goal?'Ajustar meta':'Definir meta'}<ArrowRight size={15}/></Link><span className="form-note">Todas as disciplinas, independente do filtro.</span></Panel>
        <Panel className="priority-distribution"><PanelHeader title="Prioridades atuais"/>{priorities.map(p=><button key={p} className={`priority-filter-row ${priority===p?'selected':''}`} aria-pressed={priority===p} onClick={()=>{setSlice('pending');setPriority(priority===p?'all':p);}}><span className={`priority-dot priority-${p}`}/><span>{priorityLabels[p]}</span><strong>{pending.filter(t=>t.priority===p).length}</strong><ArrowRight size={15}/></button>)}<Link className="text-link" href="/calendario">Organizar no calendário<ArrowRight size={15}/></Link></Panel>
      </aside></div>
    <section className="subjects-section"><PanelHeader title="Minhas disciplinas" href="/disciplinas"/><SubjectCards data={{...data,subjects:data.subjects.filter(s=>subject==='all'||s.id===subject)}}/></section>
    <TaskDetails data={data} task={data.tasks.find(t=>t.id===detailId)} onClose={()=>setDetailId('')} editTask={editTask} toggle={toggle}/>
  </div>;
}
