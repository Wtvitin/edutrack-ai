// Explicit disposable E2E fixture. Uses memory-only PostgreSQL and a mock AI.
// Run after npm run build. Never loads .env or starts the production server.
import {createServer,request} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../server/database.mjs';
import {createAPI} from '../server/api.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {hashPassword} from '../server/security.mjs';
import {labFixtureProvider} from '../tests/fixtures/lab.mjs';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const uiPort=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'',DATA_DIR:'memory://'};
for(const key of Object.keys(env))if(/(?:API_KEY|SMTP_|CLASSROOM_|RESEND_|GOOGLE_)/.test(key))delete env[key];
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'start','--port',String(uiPort),'--hostname','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));
const db=await openDatabase({url:'',directory:'memory://'});let api;
const server=createServer(async(req,res)=>{
  if(await api(req,res))return;
  const proxy=request({hostname:'127.0.0.1',port:uiPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Fixture UI not ready');});req.pipe(proxy);
});
const port=Number(process.env.LAB_TEST_PORT||4186),origin=`http://127.0.0.1:${port}`;
api=createAPI(db,{origin,local:true,mailMode:'local',env:{},agentConfig:readAgentConfig({}),agentProvider:labFixtureProvider()});
const user=(await db.query('INSERT INTO users(name,email,password_hash,email_verified_at,updated_at) VALUES($1,$2,$3,now(),now()) RETURNING id',['Estudante de teste','lab@example.test',await hashPassword('laboratory-test-123')])).rows[0];
await db.query("INSERT INTO subjects(user_id,name,color,updated_at) VALUES($1,'Matemática','purple',now())",[user.id]);
const sqlSubject=(await db.query("INSERT INTO subjects(user_id,name,description,color,updated_at) VALUES($1,'Banco de Dados','SQL: consultas, filtros, JOIN, agrupamento e HAVING.','blue',now()) RETURNING id",[user.id])).rows[0];
await db.query("INSERT INTO academic_tasks(user_id,subject_id,title,description,updated_at) VALUES($1,$2,'Lista de SQL: JOIN e GROUP BY','Praticar consultas relacionais, filtros e agregação por categoria.',now())",[user.id,sqlSubject.id]);

if(process.env.LAB_AUDIT_LOAD==='1'){
  await db.query("INSERT INTO subjects(user_id,name,color,is_general,updated_at) VALUES($1,'Estudo livre','purple',true,now())",[user.id]);
  await db.query("DELETE FROM academic_tasks WHERE user_id=$1",[user.id]);
  await db.query("INSERT INTO academic_tasks(user_id,subject_id,title,description,updated_at) SELECT $1,$2,'Atividade de auditoria '||g,'Dados fictícios para homologação visual.',now() FROM generate_series(1,500) g",[user.id,sqlSubject.id]);
  await db.query("INSERT INTO study_sessions(user_id,subject_id,started_at,ended_at,duration_seconds) SELECT $1,$2,now()-g*interval '1 day',now()-g*interval '1 day'+interval '25 minutes',1500 FROM generate_series(1,60) g",[user.id,sqlSubject.id]);
  for(let d=0;d<25;d++){
    const deck=(await db.query("INSERT INTO flashcard_decks(user_id,subject_id,subject_name,topic,request_id,request_hash,status,card_count) VALUES($1,$2,'Banco de Dados','Baralho sintético '||$3,gen_random_uuid(),'audit','ready',20) RETURNING id",[user.id,sqlSubject.id,String(d)])).rows[0];
    await db.query("INSERT INTO flashcards(user_id,deck_id,position,front,back,concept,grounding,due_at) SELECT $1,$2,g,'Como revisar o conceito SQL '||g||'?','Explicação de referência fictícia. Confira seu material.','SQL '||g,'general',now()-interval '2 days' FROM generate_series(0,19) g",[user.id,deck.id]);
  }
}

await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
let closed=false;
async function close(){if(closed)return;closed=true;child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
child.on('exit',()=>{if(!closed)void close();});
console.log(`LAB FIXTURE ${origin} | mock provider, in-memory database, no credentials`);

// Parent-driven cleanup for isolated browser regression runs.
process.on("message",message=>{if(message==="shutdown")void close().finally(()=>process.disconnect?.());});
