"use client";
import { useEffect,useState,type ReactNode,type CSSProperties } from "react";
import {usePathname} from 'next/navigation';
import Link from "./link";
import { ArrowRight,ArrowUpRight,BookOpen,CalendarDays,CircleHelp,Clock3,FlaskConical,LayoutDashboard,Link2,ListTodo,Search,Settings2,Sparkles,TrendingUp } from "lucide-react";
import { Sidebar,SidebarContent,SidebarFooter,SidebarHeader,SidebarProvider,SidebarTrigger,useSidebar } from "@/components/ui/sidebar";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "sonner";
import { dueLabel,priorityLabels,formatMinutes,lastSevenDays,type StudyData,type Task } from "@/lib/edutrack";
import {DeadlineProvider,NotificationBell,TaskDeadlineMessage} from './deadline-reminders';
const publicPages=["inicio","login","cadastro","recuperar-senha","nova-senha","verificar-email","privacidade","termos","emails-locais"];
import { TaskDialog,SubjectDialog } from "./forms";
import { Tasks,Subjects,CalendarView,Sessions,ProfileView,HelpView } from "./views";
import { AgentView } from "./agent-view";
import { Landing,Onboarding,InformationPage } from "./public-pages";
import { AuthPage,LocalMailbox } from "./auth-pages";
import { useStudyStore } from "./account-store";
import { UserMenu,AccountSettings,Notifications,HistoryView,Reports } from "./account-views";
import { ThemeToggle } from "./theme";
import { useTheme } from "next-themes";
import {StudyDashboard as Dashboard} from './study-dashboard';
import {IntegrationsView} from './integrations-view';
import {ClassroomTaskBadge,useClassroomDeliveryPolling} from './classroom-deliveries';
import {LabView} from './lab-view';

export const navigation=[
 {id:"hoje",label:"Visão geral",href:"/",icon:LayoutDashboard},
 {id:"disciplinas",label:"Disciplinas",href:"/disciplinas",icon:BookOpen},
 {id:"tarefas",label:"Tarefas",href:"/tarefas",icon:ListTodo},
 {id:"calendario",label:"Calendário",href:"/calendario",icon:CalendarDays},
 {id:"sessoes",label:"Sessões de estudo",href:"/sessoes",icon:Clock3},
 {id:"laboratorio",label:"Laboratório de Estudos",href:"/laboratorio",icon:FlaskConical},
 {id:"relatorios",label:"Relatórios",href:"/relatorios",icon:TrendingUp},
 {id:"integracoes",label:"Integrações",href:"/integracoes",icon:Link2},
 {id:"agente",label:"Agente de IA",href:"/agente",icon:Sparkles},
];
export function Brand(){return <Link href="/" className="brand" aria-label="EduTrack AI, visão geral"><span className="brand-mark"><Sparkles size={23}/></span><span>EduTrack<span className="brand-ai"> AI</span></span></Link>;}
export function ButtonLink({href,children,secondary=false}:{href:string;children:ReactNode;secondary?:boolean}){return <Link className={`button ${secondary?"secondary":"primary"}`} href={href}>{children}</Link>;}
export function Panel({children,className=""}:{children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{children}</section>;}
export function PanelHeader({title,href,children}:{title:string;href?:string;children?:ReactNode}){return <div className="panel-heading"><h2>{title}</h2>{href?<Link href={href} className="text-link">Ver todas <ArrowRight size={15}/></Link>:children}</div>;}
function AppSidebar({page}:{page:string}){const {setOpenMobile}=useSidebar();return <Sidebar className="edu-sidebar"><SidebarHeader className="sidebar-brand"><Brand/><span className="workspace-label">SEU ESPAÇO DE ESTUDOS</span></SidebarHeader><SidebarContent><nav className="main-nav" aria-label="Navegação principal">{navigation.map(({id,label,href,icon:Icon})=><Link key={id} href={href} className={`nav-item ${page===id?"active":""}`} aria-current={page===id?"page":undefined} onClick={()=>setOpenMobile(false)}><Icon size={20}/><span>{label}</span>{id==="agente"&&<span className="tiny-badge">AI</span>}</Link>)}</nav><div className="sidebar-motivation"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><Sparkles className="lime-star" size={25}/><p>Um pouco hoje.<br/><strong>Um novo amanhã.</strong></p><span>Cada sessão conta.</span></div></SidebarContent><SidebarFooter onClick={() => setOpenMobile(false)}><nav className="main-nav"><Link className={`nav-item ${page==="configuracoes"?"active":""}`} href="/configuracoes"><Settings2 size={19}/>Configurações</Link><Link className="nav-item" href="/ajuda"><CircleHelp size={19}/>Ajuda e suporte</Link></nav><Link href="/inicio" className="sidebar-bottom">Conheça o EduTrack <ArrowUpRight size={15}/></Link></SidebarFooter></Sidebar>;}
export function StudyChart({data}:{data:StudyData}){const days=lastSevenDays(data.sessions);const max=Math.max(120,...days.map(d=>d.minutes));return <div className="study-chart" role="img" aria-label={`Tempo estudado nos últimos sete dias: ${days.map(d=>`${d.label}, ${d.minutes} minutos`).join("; ")}`}><div className="chart-scale"><span>{formatMinutes(max)}</span><span>{formatMinutes(max/2)}</span><span>0h</span></div><div className="chart-bars">{days.map((day,i)=><div className="chart-column" key={day.date}><div className="bar-space"><div className={`chart-bar ${i===6?"current":""}`} style={{height:`${Math.max(0,day.minutes/max*100)}%`}}><span>{formatMinutes(day.minutes)}</span></div></div><span className={i===6?"today-label":""}>{day.label}</span></div>)}</div></div>;}
export function TaskRow({task,data,toggle}:{task:Task;data:StudyData;toggle:(id:string)=>void}){const subject=data.subjects.find(s=>s.id===task.subjectId);return <div className={`task-row ${task.done?"completed":""}`}><Checkbox checked={task.done} onCheckedChange={()=>toggle(task.id)} aria-label={`${task.done?"Reabrir":"Concluir"} ${task.title}`} className="task-checkbox"/><div className="task-copy"><strong>{task.title}</strong><span><span className={`subject-dot ${subject?.color||"blue"}`}/>{subject?.name||"Geral"}<span className="separator-dot">·</span>{dueLabel(task.due)}</span><TaskDeadlineMessage task={task}/><ClassroomTaskBadge taskId={task.id}/></div>{!task.done&&task.status!=="CANCELLED"&&<span className={`priority-tag priority-${task.priority}`}>{priorityLabels[task.priority]}</span>}{task.status==="IN_PROGRESS"&&<span className="pill purple">Em andamento</span>}{task.status==="CANCELLED"&&<span className="pill">Cancelada</span>}{task.done&&<span className="pill green">Concluída no EduTrack</span>}</div>;}
export function SubjectCards({data}:{data:StudyData}){return <div className="subject-grid">{data.subjects.map(subject=>{const tasks=data.tasks.filter(t=>t.subjectId===subject.id&&t.status!=="CANCELLED");const done=tasks.filter(t=>t.done).length;return <Link href={`/disciplinas/${subject.id}`} key={subject.id} className="subject-card"><span className={`subject-icon ${subject.color}`}><BookOpen size={21}/></span><ArrowUpRight size={16} className="subject-arrow"/><h3>{subject.name}</h3><span className="muted small">{tasks.length-done} {tasks.length-done === 1 ? "tarefa pendente" : "tarefas pendentes"}</span><Progress value={tasks.length?done/tasks.length*100:0} className={`subject-progress ${subject.color}`} aria-label={`Tarefas concluídas de ${subject.name}`}/><span className="subject-caption">{done} de {tasks.length} concluídas</span></Link>;})}</div>;}

export default function EduTrack({initialPage="hoje"}:{initialPage?:string}){

const pathname=usePathname();
const currentPage=pathname?pathname.slice(1)||'hoje':initialPage;
const page=currentPage.split("/")[0];
const {data,setData,ready,mode,saving,reload}=useStudyStore(!publicPages.includes(page),page==="demo"||page==="primeiros-passos");
useClassroomDeliveryPolling(ready&&mode==='account'&&!publicPages.includes(page));
const {setTheme}=useTheme();
useEffect(()=>{if(ready&&data.profile.theme)setTheme(data.profile.theme);},[ready,data.profile.theme,setTheme]);
const [taskOpen,setTaskOpen]=useState(false);const [editingTask,setEditingTask]=useState<Task|undefined>();const [subjectOpen,setSubjectOpen]=useState(false);
function toggle(id:string){setData(prev=>({...prev,tasks:prev.tasks.map(t=>t.id===id?{...t,done:!t.done,status:t.done?"TODO":"COMPLETED",completedAt:t.done?null:new Date().toISOString()}:t)}));}
function editTask(task?:Task){setEditingTask(task);setTaskOpen(true);}
useEffect(()=>{
 type Context={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
 const context=(document as Document&{modelContext?:Context}).modelContext;if(!context?.registerTool||mode!=="demo"||!ready||publicPages.includes(page))return;
 const controller=new AbortController();
 const registration=context.registerTool({name:"list_local_study_tasks",description:"List tasks visible in this device-local EduTrack demonstration. No backend or AI access.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(input===null||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new Error("Expected an empty object.");return {mode:"local-demo",tasks:data.tasks.map(t=>({id:t.id,title:t.title,due:t.due,done:t.done}))};}},{signal:controller.signal});
 void Promise.resolve(registration).catch(()=>{});return ()=>controller.abort();
},[data.tasks,mode,ready,page]);
const props={data,setData,toggle,editTask,newSubject:()=>setSubjectOpen(true),page:currentPage};
const toastView=<Toaster position="bottom-right" richColors closeButton/>;
if(page==="inicio")return <><Landing/>{toastView}</>;
if(["login","cadastro","recuperar-senha","nova-senha","verificar-email"].includes(page))return <><AuthPage key={page} page={page}/>{toastView}</>;
if(page==="emails-locais")return <><LocalMailbox/>{toastView}</>;
if(!publicPages.includes(page)&&!ready)return <main className="loading-screen" role="status">Carregando seu espaço…{toastView}</main>;
if(page==="primeiros-passos")return <><Onboarding data={data} setData={setData}/>{toastView}</>;
if(["privacidade","termos"].includes(page))return <InformationPage page={page}/>;
let content:ReactNode;
switch(page){
 case "tarefas":content=<Tasks {...props}/>;break;
 case "disciplinas":content=<Subjects {...props}/>;break;
 case "calendario":content=<CalendarView {...props}/>;break;
 case "sessoes":content=<Sessions {...props}/>;break;
 case "laboratorio":content=<LabView data={data} mode={mode}/>;break;
 case "progresso":case "relatorios":content=<Reports {...props}/>;break;
 case "notificacoes":content=<Notifications {...props}/>;break;
 case "historico":content=<HistoryView {...props}/>;break;
 case "integracoes":content=<IntegrationsView mode={mode} saving={saving} onImported={reload}/>;break;
 case "agente":content=<AgentView {...props} onDataChanged={reload}/>;break;
 case "perfil":content=<ProfileView key={ready?"loaded":"loading"} {...props}/>;break;
 case "configuracoes":content=<AccountSettings {...props}/>;break;
 case "ajuda":content=<HelpView/>;break;
 default:content=<Dashboard data={data} toggle={toggle} newTask={()=>editTask()} editTask={editTask}/>;
}
return <DeadlineProvider data={data}><SidebarProvider style={{"--sidebar-width":"248px"} as CSSProperties}><a className="skip-link" href="#main-content">Pular para o conteúdo</a><AppSidebar page={page==="progresso"?"relatorios":page}/><div className="app-frame"><header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu" aria-label="Abrir menu"/><span className="breadcrumb">Meu espaço <span>/</span> <strong>{navigation.find(n=>n.id===(page==="progresso"?"relatorios":page))?.label||({perfil:"Meu perfil",configuracoes:"Configurações",ajuda:"Ajuda"} as Record<string,string>)[page]||"EduTrack"}</strong></span></div><div className="topbar-actions"><ThemeToggle onTheme={theme=>setData(p=>({...p,profile:{...p.profile,theme}}))}/><Link href="/tarefas" className="icon-button" aria-label="Buscar tarefas"><Search size={20}/></Link><NotificationBell/><span className="topbar-divider"/><UserMenu data={data} mode={mode}/></div></header><main id="main-content" className="main-content" tabIndex={-1} key={currentPage}>{content}<footer className="app-footer"><span>{mode==="demo"?"Demonstração · Dados neste navegador":saving?"Salvando alterações…":"Conta · Dados no servidor"}</span><span>EduTrack AI <span className="footer-dot">✦</span> Seu tempo. Seu ritmo.</span></footer></main><nav className="mobile-bottom" aria-label="Navegação móvel"><Link href="/" aria-current={page==="hoje"?"page":undefined}><LayoutDashboard size={20}/>Hoje</Link><Link href="/tarefas" aria-current={page==="tarefas"?"page":undefined}><ListTodo size={20}/>Tarefas</Link><Link href="/calendario" aria-current={page==="calendario"?"page":undefined}><CalendarDays size={20}/>Agenda</Link><Link href="/sessoes" aria-current={page==="sessoes"?"page":undefined}><Clock3 size={20}/>Estudar</Link><Link href="/agente" aria-current={page==="agente"?"page":undefined}><Sparkles size={20}/>IA</Link></nav></div>{taskOpen&&<TaskDialog data={data} task={editingTask} subjectId={page==="disciplinas"?currentPage.split("/")[1]:undefined} open onClose={()=>setTaskOpen(false)} onSave={task=>setData(prev=>({...prev,tasks:prev.tasks.some(t=>t.id===task.id)?prev.tasks.map(t=>t.id===task.id?task:t):[...prev.tasks,task]}))}/>} {subjectOpen&&<SubjectDialog open onClose={()=>setSubjectOpen(false)} onSave={subject=>setData(prev=>({...prev,subjects:[...prev.subjects,subject]}))}/>} {toastView}</SidebarProvider></DeadlineProvider>;
}
