"use client";
import {useEffect, useMemo, useState} from 'react';
import {ArrowRight, BarChart3, CalendarDays, Download, RefreshCw, Target} from 'lucide-react';
import {Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {dateKey, formatMinutes, priorityLabels, type StudyData} from '@/lib/edutrack';
import {csvCell, demoReport, shiftDay, type StudyMetrics} from '@/lib/study-planning';
import {Progress} from '@/components/ui/progress';
import {Panel, PanelHeader} from './app';
import {Choice} from './forms';
import {api} from './account-store';
import Link from './link';

const displayDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', {day:'2-digit',month:'short'});
function downloadReport(metrics: StudyMetrics, subject: string) {
  const rows: unknown[][] = [
    ['EduTrack — relatório de estudos'], ['Filtro de disciplina', subject], ['Início', metrics.start], ['Fim', metrics.end],
    ['Minutos estudados', metrics.minutes], ['Minutos no período anterior', metrics.previousMinutes], ['Variação (%)', metrics.changePercent ?? 'Sem base anterior'],
    ['Sessões', metrics.sessions], ['Dias ativos', metrics.activeDays], ['Concluídas no período', metrics.completed], ['Concluídas no período anterior', metrics.previousCompleted],
    ['Concluídas dentro do prazo', metrics.onTimeCompleted], ['Conclusões com prazo informado', metrics.completedWithDeadline],
    ['Pendentes atuais', metrics.pending], ['Atrasadas atuais', metrics.overdue], ['Urgentes atuais', metrics.urgent], ['Carga estimada (min)', metrics.estimatedMinutes], ['Pendentes sem estimativa', metrics.unestimatedTasks], [],
    ['Disciplina', 'Minutos', 'Minutos anteriores', 'Sessões', 'Concluídas', 'Pendências', 'Atrasadas', 'Carga estimada (min)'],
    ...metrics.subjects.map(s => [s.name, s.minutes, s.previousMinutes, s.sessions, s.completed, s.pending, s.overdue, s.estimatedMinutes]), [],
    ['Prioridade', 'Pendências atuais', 'Carga estimada (min)'], ...metrics.priorities.map(p => [priorityLabels[p.priority], p.count, p.estimatedMinutes]), [],
    ['Data', 'Minutos', 'Minutos no dia equivalente do período anterior'], ...metrics.daily.map(d => [d.date, d.minutes, d.previousMinutes]),
  ];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = `edutrack-relatorio-${metrics.start}-${metrics.end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AnalyticsPanel({data, compact = false, period, subjectId, onSubjectChange}: {
  data: StudyData; compact?: boolean; period?: number; subjectId?: string; onSubjectChange?: (id: string) => void;
}) {
  const [ownDays, setDays] = useState(7), [ownSubject, setSubject] = useState('all');
  const days = period ?? ownDays, subject = subjectId ?? ownSubject;
  const [result, setResult] = useState<{source: StudyData; days: number; subject: string; retry: number; metrics?: StudyMetrics; error?: string} | null>(null);
  const [retry, setRetry] = useState(0), [compare, setCompare] = useState(true), [selectedDay, setSelectedDay] = useState('');
  const [order, setOrder] = useState('minutes'), [detailSubject, setDetailSubject] = useState<string | null>(null);
  const today = dateKey();
  const demo = useMemo(() => data.profile.id ? null : demoReport(data, days, subject, today), [data, days, subject, today]);
  const current = result?.source === data && result.days === days && result.subject === subject && result.retry === retry;
  const metrics = data.profile.id ? current ? result.metrics || null : null : demo;
  const error = current ? result.error || '' : '';
  useEffect(() => {
    if (!data.profile.id) return;
    let live = true;
    void (async () => {await window.edutrackFlush?.(); const metrics = await api<StudyMetrics>(`/analytics?days=${days}&subject=${encodeURIComponent(subject)}`); if (live) setResult({source:data,days,subject,retry,metrics});})()
      .catch(e => {if (live) setResult({source:data,days,subject,retry,error:e instanceof Error ? e.message : 'Não foi possível carregar.'});});
    return () => {live = false;};
  }, [data, days, subject, retry]);
  const currentDay = metrics?.daily.some(d => d.date === selectedDay) ? selectedDay : '';
  const selectedSessions = data.sessions.filter(s => s.date === currentDay && (subject === 'all' || s.subjectId === subject));
  const detail = metrics?.subjects.find(s => s.id === detailSubject);
  const subjectName = data.subjects.find(s => s.id === subject)?.name || 'Todas as disciplinas';
  const sortedSubjects = [...(metrics?.subjects || [])].sort((a, b) => order === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : order === 'pending' ? b.pending - a.pending : b.minutes - a.minutes);
  const weekly = data.sessions.filter(s => s.date >= shiftDay(dateKey(), -6) && s.date <= dateKey()).reduce((n, s) => n+s.minutes, 0);
  const goal = data.profile.weeklyGoalMinutes || 0;
  return <Panel className={`analytics-panel report-v2 ${compact ? 'compact-report' : ''}`}>
    <PanelHeader title={compact ? 'Seu ritmo de estudo' : 'Relatório de estudos'}>{period === undefined && <div className="period-tabs no-print" aria-label="Período do relatório">{[7,30,90].map(n => <button key={n} aria-pressed={days===n} onClick={() => setDays(n)}>{n} dias</button>)}</div>}</PanelHeader>
    {subjectId === undefined && <Choice label="Disciplina" id={compact ? 'chart-subject' : 'report-subject'} value={subject} onChange={setSubject} options={[{value:'all',label:'Todas as disciplinas'}, ...data.subjects.map(s => ({value:s.id,label:s.name}))]}/>}
    {error ? <div className="report-feedback" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setRetry(n => n+1)}><RefreshCw size={17}/>Tentar novamente</button></div>
      : !metrics ? <div className="report-loading" role="status"><div className="loading-chart"/>Preparando seus registros…</div>
      : <>
        <div className="report-period-summary"><div><span className="eyebrow">{subjectName}</span><h3>{formatMinutes(metrics.minutes)}</h3><p>{displayDate(metrics.start)} a {displayDate(metrics.end)} · {metrics.sessions} sessões</p></div>
          <span className={`comparison-badge ${metrics.changePercent !== null && metrics.changePercent < 0 ? 'less' : ''}`}>{metrics.changePercent === null ? 'Sem base anterior' : `${metrics.changePercent > 0 ? '+' : ''}${metrics.changePercent}% de tempo`}</span></div>
        <div className="chart-controls no-print"><label className="comparison-switch"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/>Comparar com os {days} dias anteriores</label><span>Minutos por dia</span></div>
        <div className="interactive-chart" aria-label="Gráfico de minutos estudados por dia">
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={metrics.daily} accessibilityLayer onClick={state => {const label = state?.activeLabel; if (typeof label === 'string') setSelectedDay(label);}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/>
            <XAxis dataKey="date" tickFormatter={displayDate} minTickGap={40} stroke="var(--muted-foreground)" tick={{fontSize:11}}/>
            <YAxis allowDecimals={false} width={45} stroke="var(--muted-foreground)" tick={{fontSize:11}}/>
            <Tooltip formatter={(value, name) => [`${value} min`, name === 'previousMinutes' ? 'Período anterior' : 'Período atual']} labelFormatter={v => displayDate(String(v))} contentStyle={{background:'var(--card)',borderColor:'var(--border)',color:'var(--foreground)',borderRadius:12}}/>
            <Area isAnimationActive={false} type="monotone" dataKey="minutes" stroke="#8874f2" fill="#8874f2" fillOpacity={.18} strokeWidth={3}/>
            {compare && <Line isAnimationActive={false} type="monotone" dataKey="previousMinutes" stroke="#7b9aa5" strokeDasharray="5 5" strokeWidth={2} dot={false}/>}
          </ComposedChart></ResponsiveContainer>
        </div>
        <div className="chart-legend-v2"><span><i/>Período atual</span>{compare && <span><i className="previous"/>Período anterior (dias equivalentes)</span>}</div>
        <details className="report-data-table"><summary>Consultar dados do gráfico em tabela</summary><div className="report-table-wrap"><table className="report-table"><caption>Tempo de estudo em minutos por dia. Selecione uma data para detalhar as sessões.</caption><thead><tr><th scope="col">Data atual</th><th scope="col">Minutos atuais</th>{compare&&<th scope="col">Minutos no dia equivalente anterior</th>}</tr></thead><tbody>{metrics.daily.map(d=><tr key={d.date}><th scope="row"><button className="text-link" aria-pressed={currentDay===d.date} onClick={()=>setSelectedDay(d.date)}>{displayDate(d.date)}</button></th><td>{d.minutes}</td>{compare&&<td>{d.previousMinutes}</td>}</tr>)}</tbody></table></div></details><div className="day-detail-picker no-print"><CalendarDays size={17}/><label htmlFor={compact ? 'dashboard-day' : 'report-day'}>Detalhar um dia</label><select id={compact ? 'dashboard-day' : 'report-day'} value={currentDay} onChange={e => setSelectedDay(e.target.value)}><option value="">Selecione um dia</option>{metrics.daily.map(d => <option key={d.date} value={d.date}>{displayDate(d.date)} · {formatMinutes(d.minutes)}</option>)}</select></div>
        {currentDay && <div className="report-drilldown" aria-live="polite"><strong>{displayDate(currentDay)} · {formatMinutes(selectedSessions.reduce((n,s) => n+s.minutes,0))}</strong>
          {selectedSessions.length ? selectedSessions.map(s => <div key={s.id}><span>{data.subjects.find(sub => sub.id === s.subjectId)?.name || 'Sem disciplina'}</span><span>{formatMinutes(s.minutes)}</span></div>) : <p>Nenhuma sessão registrada nesse dia.</p>}</div>}
        {compact ? <Link className="text-link report-link" href="/relatorios">Abrir relatório completo<ArrowRight size={16}/></Link> : <>
          <div className="report-stats">{[
            [`${metrics.activeDays}/${days}`, 'Dias com estudo'], [metrics.sessions, 'Sessões registradas'], [formatMinutes(metrics.averageSession), 'Média por sessão'],
            [metrics.completed, 'Concluídas no período'], [metrics.pending, 'Pendentes agora'], [metrics.overdue, 'Atrasadas agora'], [metrics.urgent, 'Urgentes agora'], [formatMinutes(metrics.estimatedMinutes), 'Carga pendente estimada'],
          ].map(([value,label]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div>
          <div className="report-insights"><article><Target size={20}/><div><h3>Sua meta semanal</h3>{goal ? <><p>{formatMinutes(weekly)} de {formatMinutes(goal)} nos últimos 7 dias — todas as disciplinas.</p><Progress value={Math.min(100,weekly/goal*100)} aria-label="Progresso da meta semanal"/><small>{Math.round(weekly/goal*100)}% da meta · {weekly >= goal ? 'Meta alcançada!' : `${formatMinutes(goal-weekly)} para completar`}</small></> : <p>Defina uma meta possível e acompanhe seu ritmo.</p>}<Link href="/configuracoes" className="text-link">Ajustar meta<ArrowRight size={14}/></Link></div></article>
            <article><BarChart3 size={20}/><div><h3>Entregas e planejamento</h3><p>{metrics.onTimeRate === null ? 'Ainda não há conclusões com prazo neste período.' : `${metrics.onTimeCompleted} de ${metrics.completedWithDeadline} entregas concluídas dentro do prazo (${metrics.onTimeRate}%).`}</p><p>{metrics.unestimatedTasks ? `${metrics.unestimatedTasks} pendências sem estimativa: a carga informada é parcial.` : 'Todas as pendências têm estimativa, ou não há pendências.'}</p><small>{metrics.completed} conclusões agora · {metrics.previousCompleted} no período anterior.</small></div></article></div>
          <section className="report-priorities" aria-label="Pendências por prioridade"><h3>O que pede atenção agora</h3><div>{metrics.priorities.map(p => <article key={p.priority} className={`priority-summary priority-${p.priority}`}><span>{priorityLabels[p.priority]}</span><strong>{p.count}</strong><small>{formatMinutes(p.estimatedMinutes)} estimadas</small></article>)}</div></section>
          <div className="report-table-heading"><h3>Por disciplina</h3><div className="no-print"><Choice id="report-sort" label="Ordenar disciplinas" value={order} onChange={setOrder} options={[{value:'minutes',label:'Mais tempo estudado'},{value:'pending',label:'Mais pendências'},{value:'name',label:'Nome da disciplina'}]}/></div></div>
          <div className="report-table-wrap"><table className="report-table"><caption className="sr-only">Detalhamento por disciplina. Selecione uma disciplina para ver mais informações.</caption><thead><tr><th scope="col">Disciplina</th><th scope="col">Estudo</th><th scope="col">Anterior</th><th scope="col">Concluídas</th><th scope="col">Pendências</th><th scope="col">Atrasadas</th><th scope="col">Carga estimada</th></tr></thead><tbody>{sortedSubjects.map(s => <tr key={s.id}><th scope="row"><button className="text-link" aria-pressed={detailSubject===s.id} onClick={() => {setDetailSubject(s.id); onSubjectChange?.(s.id);}}>{s.name}<ArrowRight size={14}/></button></th><td>{formatMinutes(s.minutes)}</td><td>{formatMinutes(s.previousMinutes)}</td><td>{s.completed}</td><td>{s.pending}</td><td>{s.overdue}</td><td>{formatMinutes(s.estimatedMinutes)}</td></tr>)}</tbody></table></div>
          {detail && <div className="report-drilldown" aria-live="polite"><strong>{detail.name}</strong><p>{detail.sessions} sessões · {detail.completed} conclusões no período · {detail.urgent} pendências urgentes atuais.</p>{detail.id && <Link className="text-link" href={`/disciplinas/${detail.id}`}>Abrir disciplina<ArrowRight size={15}/></Link>}</div>}
          <div className="inline-actions wrap no-print"><button className="button secondary" onClick={() => downloadReport(metrics, subjectName)}><Download size={17}/>Exportar CSV</button><button className="button secondary" onClick={() => window.print()}>Imprimir / salvar PDF</button></div>
          <details className="report-method"><summary>Como ler este relatório</summary><p>Tempo, sessões e conclusões seguem o período selecionado. Conclusões usam a data real no fuso de Brasília. Pendências, prioridades e atrasos mostram a situação atual, não um histórico. A linha tracejada compara dias equivalentes do período anterior, não as mesmas datas. A meta usa todas as disciplinas nos últimos sete dias. Carga estimada considera apenas tarefas com tempo preenchido. Os cálculos são determinísticos; não há uso de IA neste relatório. Tempo estudado não mede domínio do assunto.</p></details>
        </>}
      </>}
  </Panel>;
}
