export type Subject = { id: string; name: string; color: string; description: string; teacher?: string; hours?: number };
export type Task = { id: string; title: string; subjectId: string; due: string; done: boolean; priority: "baixa" | "normal" | "alta" | "urgente"; description: string; status?: "TODO"|"IN_PROGRESS"|"COMPLETED"|"CANCELLED"; difficulty?: "EASY"|"MEDIUM"|"HARD"; estimatedMinutes?: number|null; completedAt?: string|null };
export type StudySession = { id: string; subjectId: string; minutes: number; date: string };
export type StudyData = { version: 1; profile: { id?: string; name: string; goal: string; weeklyGoalMinutes?: number; email?: string; notificationsEnabled?: boolean; theme?: "system"|"light"|"dark" }; subjects: Subject[]; tasks: Task[]; sessions: StudySession[] };
export const priorityLabels={baixa:"Baixa",normal:"Normal",alta:"Alta",urgente:"Urgente"};
export const priorityRank={baixa:0,normal:1,alta:2,urgente:3};
export function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
export function shiftedDate(days: number) { const date = new Date(); date.setDate(date.getDate()+days); return dateKey(date); }
export function seedData(): StudyData { return {
  version: 1, profile: { name: "Victor", goal: "Criar uma rotina de estudos consistente" },
  subjects: [
    { id:"mat", name:"Matemática", color:"blue", description:"Um problema de cada vez." },
    { id:"his", name:"História", color:"rose", description:"Conectando passado e presente." },
    { id:"bio", name:"Biologia", color:"green", description:"Descobrindo como a vida funciona." },
    { id:"ing", name:"Inglês", color:"purple", description:"Novas palavras, novas possibilidades." },
  ],
  tasks: [
    { id:"t1", title:"Revisar funções do 2º grau", subjectId:"mat", due:shiftedDate(0), done:false, priority:"alta", description:"Rever as anotações e resolver cinco exercícios." },
    { id:"t2", title:"Resumo da Revolução Industrial", subjectId:"his", due:shiftedDate(1), done:false, priority:"normal", description:"Organizar os principais acontecimentos e suas consequências." },
    { id:"t3", title:"Exercícios de genética", subjectId:"bio", due:shiftedDate(2), done:false, priority:"normal", description:"Praticar a primeira lei de Mendel." },
    { id:"t4", title:"Praticar compreensão de texto", subjectId:"ing", due:shiftedDate(3), done:false, priority:"normal", description:"Ler um artigo curto e anotar vocabulário." },
    ...Array.from({length:6},(_,i): Task=>({id:`done${i}`,title:["Revisão de equações","Leitura: Idade Moderna","Estudar células","Praticar vocabulário","Lista de frações","Revisar tempos verbais"][i],subjectId:["mat","his","bio","ing"][i%4],due:shiftedDate(-i),done:true,priority:"normal",description:""})),
  ],
  sessions:[70,100,55,120,90,45,60].map((minutes,i)=>({id:`s${i}`,subjectId:["mat","his","bio","ing"][i%4],minutes,date:shiftedDate(-6+i)})),
}; }
export function formatMinutes(minutes:number){const m=Math.floor(minutes);return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}min`;}
export function dueLabel(due:string){if(!due)return "Sem prazo";if(due===dateKey())return "Hoje";if(due===shiftedDate(1))return "Amanhã";return new Date(`${due}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});}
export function lastSevenDays(sessions:StudySession[]){return Array.from({length:7},(_,i)=>{const date=shiftedDate(i-6);return {date,label:new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"short"}).replace(".",""),minutes:sessions.filter(s=>s.date===date).reduce((sum,s)=>sum+s.minutes,0)};});}
