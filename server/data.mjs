import { z } from 'zod';
import {validCalendarDay} from '../lib/calendar-date.mjs';
const date=z.string().refine(validCalendarDay);
const id = z.string().uuid();
export const snapshotSchema = z.object({
  revision:z.number().int().nonnegative(), data:z.object({
    version:z.literal(1), profile:z.object({ name:z.string().trim().min(1).max(80), goal:z.string().max(300), weeklyGoalMinutes:z.number().int().min(0).max(10080).optional(), notificationsEnabled:z.boolean().optional(), theme:z.enum(['system','light','dark']).optional() }),
    subjects:z.array(z.object({ id,name:z.string().trim().min(1).max(60),color:z.enum(['blue','purple','green','rose','orange']),description:z.string().max(200) })).max(500),
    tasks:z.array(z.object({ id,title:z.string().trim().min(1).max(140),subjectId:z.union([id,z.literal('')]),due:date,done:z.boolean(),priority:z.enum(['baixa','normal','alta','urgente']),description:z.string().max(1500),status:z.enum(['TODO','IN_PROGRESS','COMPLETED','CANCELLED']).optional(),difficulty:z.enum(['EASY','MEDIUM','HARD']).optional(),estimatedMinutes:z.number().int().min(1).max(10080).nullable().optional(),completedAt:z.string().nullable().optional() })).max(5000),
    sessions:z.array(z.object({id,subjectId:z.union([id,z.literal('')]),date:date.refine(v=>v!==''),minutes:z.number().int().min(1).max(1440)})).max(20000),
  }),
});
const priorities={baixa:'LOW',normal:'MEDIUM',alta:'HIGH',urgente:'URGENT'};
const displayPriority={LOW:'baixa',MEDIUM:'normal',HIGH:'alta',URGENT:'urgente'};
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'});
const day=value=>value?dayFormatter.format(new Date(value)):'';
const iso = value => value ? new Date(value).toISOString() : null;
export async function readData(db, user) {
  return db.transaction(async tx=>{
  await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  user=(await tx.query('SELECT * FROM users WHERE id=$1',[user.id])).rows[0];
  if(!user)throw Object.assign(new Error('Conta não encontrada.'),{status:401});
  const subjects=(await tx.query('SELECT * FROM subjects WHERE user_id=$1 ORDER BY created_at,id',[user.id])).rows;
  const tasks=(await tx.query('SELECT * FROM academic_tasks WHERE user_id=$1 ORDER BY created_at,id',[user.id])).rows;
  const sessions=(await tx.query('SELECT * FROM study_sessions WHERE user_id=$1 ORDER BY started_at,id',[user.id])).rows;
  return {revision:user.revision,data:{version:1,profile:{id:user.id,name:user.name,goal:user.goal,weeklyGoalMinutes:user.weekly_goal_minutes,email:user.email,notificationsEnabled:user.notifications_enabled,theme:user.theme},
    subjects:subjects.map(s=>({id:s.id,name:s.name,color:s.color,description:s.description||''})),
    tasks:tasks.map(t=>({id:t.id,title:t.title,subjectId:t.subject_id,due:day(t.due_date),done:t.status==='COMPLETED',status:t.status,priority:displayPriority[t.priority],description:t.description||'',difficulty:t.difficulty,estimatedMinutes:t.estimated_minutes,completedAt:iso(t.completed_at)})),
    sessions:sessions.map(s=>({id:s.id,subjectId:s.subject_id,date:day(s.started_at),minutes:Math.floor(s.duration_seconds/60)})),
  }};
  });
}

export async function saveData(db,user,input) {
  const parsed=snapshotSchema.safeParse(input);
  if(!parsed.success) throw Object.assign(new Error('Confira os campos: há dados inválidos.'),{status:400});
  const {data,revision}=parsed.data;
  return db.transaction(async tx=>{
    const current=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
    if(current.revision!==revision) throw Object.assign(new Error('Outra aba alterou os dados. Atualize a página antes de tentar novamente.'),{status:409});
    for(const [table,rows] of [['subjects',data.subjects],['academic_tasks',data.tasks],['study_sessions',data.sessions]]) {
      if(new Set(rows.map(r=>r.id)).size!==rows.length) throw Object.assign(new Error('Identificadores duplicados.'),{status:400});
      const alien=await tx.query(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[]) AND user_id<>$2`,[rows.map(r=>r.id),user.id]);
      if(alien.rows.length) throw Object.assign(new Error('Registro não autorizado.'),{status:403});
    }
    const ownedSubjects=new Set(data.subjects.map(s=>s.id));
    const general=(await tx.query('SELECT id FROM subjects WHERE user_id=$1 AND is_general=true',[user.id])).rows[0]?.id;
    if(!general||!ownedSubjects.has(general)) throw Object.assign(new Error('Mantenha a disciplina Estudo livre.'),{status:400});
    if([...data.tasks,...data.sessions].some(t=>t.subjectId&&!ownedSubjects.has(t.subjectId))) throw Object.assign(new Error('Escolha uma disciplina da sua conta.'),{status:400});
    const existingSubjects=new Map((await tx.query('SELECT id,name,color,description FROM subjects WHERE user_id=$1',[user.id])).rows.map(s=>[s.id,s]));
    for(const s of data.subjects) {const old=existingSubjects.get(s.id);if(old&&old.name===s.name&&old.color===s.color&&(old.description||'')===s.description)continue;await tx.query(`INSERT INTO subjects(id,user_id,name,color,description,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(id) DO UPDATE SET name=$3,color=$4,description=$5,updated_at=now() WHERE subjects.user_id=$2`,[s.id,user.id,s.name,s.color,s.description]);}
    const previous=(await tx.query('SELECT * FROM academic_tasks WHERE user_id=$1',[user.id])).rows;
    const previousById=new Map(previous.map(t=>[t.id,t]));
    const imported=new Set((await tx.query('SELECT task_id FROM classroom_task_links WHERE user_id=$1 AND task_id IS NOT NULL',[user.id])).rows.map(r=>r.task_id));
    for(const t of data.tasks) {
      const old=previousById.get(t.id);
      const status=t.done?'COMPLETED':t.status==='COMPLETED'?'TODO':t.status||'TODO';
      // The form edits days, not hours. Keep the Google UTC deadline if its day
      // was not changed; unrelated snapshot saves must not move an imported deadline.
      const due=old&&imported.has(t.id)&&t.due===day(old.due_date)?iso(old.due_date):t.due?`${t.due}T23:59:59-03:00`:null;
      const complete=status==='COMPLETED'?(old?.status==='COMPLETED'?iso(old.completed_at):new Date().toISOString()):null;
      const priority=priorities[t.priority];

      const changes={};
      for(const [key,before,after] of [['status',old?.status,status],['priority',old?.priority,priority],['due',day(old?.due_date),t.due],['title',old?.title,t.title],['description',old?.description||'',t.description],['subject',old?.subject_id,t.subjectId||general],['difficulty',old?.difficulty,t.difficulty||'MEDIUM'],['estimatedMinutes',old?.estimated_minutes??null,t.estimatedMinutes??null]]) if(before!==after) changes[key]={from:before??null,to:after};
      if(!old)changes.created=true;
      if(Object.keys(changes).length){
      await tx.query(`INSERT INTO academic_tasks(id,user_id,subject_id,title,description,status,priority,difficulty,due_date,estimated_minutes,completed_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(id) DO UPDATE SET subject_id=$3,title=$4,description=$5,status=$6,priority=$7,difficulty=$8,due_date=$9,estimated_minutes=$10,completed_at=$11,updated_at=now() WHERE academic_tasks.user_id=$2`,[t.id,user.id,t.subjectId||general,t.title,t.description,status,priority,t.difficulty||'MEDIUM',due,t.estimatedMinutes??null,complete]);
      await tx.query('INSERT INTO task_history(task_id,user_id,from_status,to_status,from_priority,to_priority,from_due_date,to_due_date,changes_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[t.id,user.id,old?.status||null,status,old?.priority||null,priority,old?.due_date||null,due,JSON.stringify(changes)]);
      }
    }
    const previousSessions=new Map((await tx.query('SELECT id,subject_id,started_at,duration_seconds FROM study_sessions WHERE user_id=$1',[user.id])).rows.map(s=>[s.id,s]));
    for(const s of data.sessions) {
      if(s.date>day(new Date()))throw Object.assign(new Error('Sessões não podem estar no futuro.'),{status:400});
      const old=previousSessions.get(s.id);if(old&&old.subject_id===(s.subjectId||general)&&day(old.started_at)===s.date&&Math.floor(old.duration_seconds/60)===s.minutes)continue;
      const start=`${s.date}T00:00:00-03:00`;
      await tx.query(`INSERT INTO study_sessions(id,user_id,subject_id,started_at,ended_at,duration_seconds) VALUES($1,$2,$3,$4,$4::timestamptz+($5::integer * interval '1 second'),$5) ON CONFLICT(id) DO UPDATE SET subject_id=$3,started_at=$4,ended_at=$4::timestamptz+($5::integer * interval '1 second'),duration_seconds=$5 WHERE study_sessions.user_id=$2`,[s.id,user.id,s.subjectId||general,start,s.minutes*60]);
    }
    for(const [table,rows] of [['academic_tasks',data.tasks],['study_sessions',data.sessions],['subjects',data.subjects]])await tx.query(`DELETE FROM ${table} WHERE user_id=$1 AND NOT(id=ANY($2::uuid[]))`,[user.id,rows.map(r=>r.id)]);
    await tx.query('UPDATE users SET name=$2,goal=$3,theme=$4,notifications_enabled=$5,weekly_goal_minutes=$6,revision=revision+1,updated_at=now() WHERE id=$1',[user.id,data.profile.name,data.profile.goal,data.profile.theme??current.theme,data.profile.notificationsEnabled??current.notifications_enabled,data.profile.weeklyGoalMinutes??current.weekly_goal_minutes]);
    return {revision:revision+1};
  });
}
