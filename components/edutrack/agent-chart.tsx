"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartSpecification } from './agent-api';

function isChartSpecification(value: unknown): value is ChartSpecification {
  if (!value || typeof value !== 'object') return false;
  const chart = value as Partial<ChartSpecification>;
  return typeof chart.type === 'string' && typeof chart.title === 'string' && Array.isArray(chart.data) && Array.isArray(chart.series) && chart.series.length > 0 && typeof chart.xAxis?.field === 'string' && typeof chart.yAxis?.field === 'string' && typeof chart.source?.tool === 'string' && typeof chart.datasetVersion === 'string';
}

export function AgentChart({ chart }: { chart: ChartSpecification }) {
  if (!isChartSpecification(chart)) return <p className="agent-chart-error">Nao foi possivel exibir este grafico.</p>;
  const data = chart.data;
  const hasVisual=['bar','comparison','line','area'].includes(chart.type);
  const series = chart.series.slice(0, 8);
  const axis = <><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/><XAxis dataKey={chart.xAxis.field} tickLine={false} axisLine={false} tick={{fill:'var(--muted-foreground)',fontSize:11}}/><YAxis tickLine={false} axisLine={false} width={34} tick={{fill:'var(--muted-foreground)',fontSize:11}}/><Tooltip contentStyle={{borderRadius:12,border:'1px solid var(--border)',boxShadow:'0 10px 30px #20253818',background:'var(--card)'}}/></>;
  const chartBody = chart.type === 'bar' || chart.type === 'comparison' ? <BarChart data={data} accessibilityLayer>{axis}{series.map((item,index) => <Bar isAnimationActive={false} key={item.field} dataKey={item.field} name={item.label} fill={index%2?'#a99afb':'#6151e7'} radius={[5,5,0,0]}/>)}</BarChart> : chart.type === 'area' ? <AreaChart data={data} accessibilityLayer>{axis}{series.map(item => <Area isAnimationActive={false} key={item.field} type="monotone" dataKey={item.field} name={item.label} stroke="#6151e7" fill="#6151e7" fillOpacity={0.12} strokeWidth={2}/>)}</AreaChart> : <LineChart data={data} accessibilityLayer>{axis}{series.map((item,index) => <Line isAnimationActive={false} key={item.field} type="monotone" dataKey={item.field} name={item.label} stroke={index%2?'#a99afb':'#6151e7'} strokeWidth={2}/>)}</LineChart>;
  if(!data.length)return <section className="agent-chart"><h3>{chart.title}</h3><p>Sem registros nos filtros consultados.</p></section>;
  return <section className="agent-chart" aria-label={chart.title}><div className="agent-chart-heading"><div><span className="agent-section-kicker">ANALISE VISUAL</span><h3>{chart.title}</h3></div><span className="agent-chart-source">Dados do seu EduTrack</span></div>{chart.description&&<p>{chart.description}</p>}{hasVisual&&<div className="agent-chart-canvas"><ResponsiveContainer width="100%" height="100%">{chartBody}</ResponsiveContainer></div>}<details open={!hasVisual} className="report-data-table"><summary>Consultar valores do gráfico</summary><div className="report-table-wrap"><table className="report-table"><caption>{chart.title} — {chart.yAxis.label}</caption><thead><tr><th scope="col">{chart.xAxis.label}</th>{series.map(s=><th scope="col" key={s.field}>{s.label}</th>)}</tr></thead><tbody>{data.map((row,i)=><tr key={i}><th scope="row">{String(row[chart.xAxis.field]??'—')}</th>{series.map(s=><td key={s.field}>{String(row[s.field]??'—')}</td>)}</tr>)}</tbody></table></div></details></section>;
}
