"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartSpecification } from './agent-api';

function isChartSpecification(value: unknown): value is ChartSpecification {
  if (!value || typeof value !== 'object') return false;
  const chart = value as Partial<ChartSpecification>;
  return typeof chart.type === 'string' && typeof chart.title === 'string' && Array.isArray(chart.data) && Array.isArray(chart.series) && chart.series.length > 0 && typeof chart.xAxis?.field === 'string' && typeof chart.yAxis?.field === 'string' && typeof chart.source?.tool === 'string' && typeof chart.datasetVersion === 'string';
}

export function AgentChart({ chart }: { chart: ChartSpecification }) {
  if (!isChartSpecification(chart)) return <p className="agent-chart-error">Nao foi possivel exibir este grafico.</p>;
  const data = chart.data;
  const series = chart.series.slice(0, 8);
  const axis = <><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/><XAxis dataKey={chart.xAxis.field} tickLine={false} axisLine={false} tick={{fill:'var(--muted-foreground)',fontSize:11}}/><YAxis tickLine={false} axisLine={false} width={34} tick={{fill:'var(--muted-foreground)',fontSize:11}}/><Tooltip contentStyle={{borderRadius:12,border:'1px solid var(--border)',boxShadow:'0 10px 30px #20253818',background:'var(--card)'}}/><Legend wrapperStyle={{fontSize: 11, color: 'var(--muted-foreground)'}}/></>;
  const chartBody = chart.type === 'bar' || chart.type === 'comparison' ? <BarChart data={data}>{axis}{series.map((item,index) => <Bar key={item.field} dataKey={item.field} name={item.label} fill={index%2?'#a99afb':'#6151e7'} radius={[5,5,0,0]}/>)}</BarChart> : chart.type === 'area' ? <AreaChart data={data}>{axis}{series.map(item => <Area key={item.field} type="monotone" dataKey={item.field} name={item.label} stroke="#6151e7" fill="#6151e7" fillOpacity={0.12} strokeWidth={2}/>)}</AreaChart> : <LineChart data={data}>{axis}{series.map((item,index) => <Line key={item.field} type="monotone" dataKey={item.field} name={item.label} stroke={index%2?'#a99afb':'#6151e7'} strokeWidth={2}/>)}</LineChart>;
  return <section className="agent-chart" aria-label={chart.title}><div className="agent-chart-heading"><div><span className="agent-section-kicker">ANALISE VISUAL</span><h3>{chart.title}</h3></div><span className="agent-chart-source">Dados do seu EduTrack</span></div>{chart.description&&<p>{chart.description}</p>}<div className="agent-chart-canvas"><ResponsiveContainer width="100%" height="100%">{chartBody}</ResponsiveContainer></div></section>;
}
