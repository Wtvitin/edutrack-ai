import { z } from 'zod';
import { token,digest,hashPassword,checkPassword,sessionCookie,readSessionCookie } from './security.mjs';
import { createMailer } from './mail.mjs';
import { readData,saveData } from './data.mjs';
import {prepareReportAnalytics} from './report-analytics.mjs';
import {readNotifications} from './notifications.mjs';
import { readAgentConfig } from './agent-config.mjs';
import { agentChatInputSchema } from './agent-schemas.mjs';
import { createAgentProvider } from './agent-provider.mjs';
import { createAgentToolRegistry } from './agent-tools.mjs';
import { chatWithAgent } from './agent-orchestrator.mjs';
import {CLASSROOM_CALLBACK,readClassroomConfig,createClassroomService} from './classroom.mjs';
import { openApiSpec, swaggerHtml } from './openapi.mjs';
const email=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
const password=z.string().min(10).max(128);
const emailSchema=z.object({email});
const account=u=>({id:u.id,name:u.name,email:u.email,verified:!!u.email_verified_at});
const error=(message,status=400)=>Object.assign(new Error(message),{status});
function agentFailureDetails(failure,config){
  if(!failure?.code?.startsWith('provider-')&&failure?.code!=='model-not-configured')return null;
  const cause=failure.cause?.cause||failure.cause;
  const details={provider:config.provider,model:config.model,status:failure.status||500,code:failure.code};
  if(failure.providerStatus!==undefined)details.providerStatus=failure.providerStatus;
  if(failure.providerMessage)details.providerMessage=failure.providerMessage;
  if(failure.providerCode)details.providerCode=failure.providerCode;
  if(cause?.code||cause?.name)details.causeCode=cause.code||cause.name;
  return details;
}
function validate(schema,body){const p=schema.safeParse(body);if(!p.success)throw error('Confira os campos informados. A senha deve ter de 10 a 128 caracteres.');return p.data;}
export function createAPI(db,config) {
  const mail=config.mailer||createMailer(db,config);
  const agentConfig=config.agentConfig||readAgentConfig(config.env||process.env);
  const agentProvider=config.agentProvider||createAgentProvider(agentConfig,config.agentTransport);
  const agentTools=config.agentTools||createAgentToolRegistry(config.agentToolsOptions);
  const classroom=createClassroomService(db,config.classroomConfig||readClassroomConfig(config.env||process.env,config.origin,config.local),config.classroomTransport);
  const attempts=new Map();
  let dummyHash;
  async function limited(req,key,max=10){
    const now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
    if(attempts.size>10000)throw error('Muitas solicitações. Tente mais tarde.',429);
    const k=`${req.socket.remoteAddress}:${key}`;const v=attempts.get(k)||{count:0,until:now+15*60000};v.count++;attempts.set(k,v);if(v.count>max)throw error('Muitas tentativas. Aguarde 15 minutos.',429);
  }
  async function auth(req){const raw=readSessionCookie(req.headers.cookie);if(!raw)throw error('Entre na sua conta para continuar.',401);const u=(await db.query('SELECT u.* FROM users u JOIN auth_sessions s ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(raw)])).rows[0];if(!u)throw error('Sua sessão expirou. Entre novamente.',401);return u;}
  async function sendToken(user,purpose){
    const raw=token();
    await db.query('UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',[user.id,purpose]);
    await db.query(`INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+$4::interval)`,[digest(raw),user.id,purpose,purpose==='VERIFY'?'24 hours':'30 minutes']);
    const link=`${config.origin}/${purpose==='VERIFY'?'verificar-email':'nova-senha'}?token=${raw}`;
    await mail({to:user.email,subject:purpose==='VERIFY'?'Confirme seu e-mail — EduTrack':'Redefina sua senha — EduTrack',body:purpose==='VERIFY'?'Confirme seu endereço para ativar sua conta. O link expira em 24 horas. Se não foi você, ignore esta mensagem.':'Use o link para redefinir sua senha. Ele expira em 30 minutos. Se não foi você, ignore esta mensagem.',link});
  }
  async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2e6)throw error('Solicitação muito grande.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw error('JSON inválido.');}}
  return async(req,res)=>{
    const path=new URL(req.url,config.origin).pathname;
    if(!path.startsWith('/api/'))return false;
    function respond(code,value,cookie){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(value));}
    try{
      // Google returns through a cross-site navigation. Only this GET may bypass
      // the site guard, and it still requires a session-bound, one-use state.
      if(path===CLASSROOM_CALLBACK&&req.method==='GET'){
        let outcome='connected';
        try{const user=await auth(req);await classroom.callback(user,digest(readSessionCookie(req.headers.cookie)),new URL(req.url,config.origin).searchParams);}
        catch(e){
          const codes=['classroom-state','classroom-denied','classroom-scope','classroom-scope-response','classroom-scope-both','classroom-scope-courses','classroom-scope-coursework','classroom-scope-no-courses','classroom-scope-api-denied','classroom-reconnect','classroom-session'];
          outcome=e.status===401?'classroom-session':codes.includes(e.code)?e.code:'classroom-failed';
          // Do not log request URLs, authorization codes, credentials or raw errors.
          console.warn('[Classroom OAuth]',JSON.stringify({outcome,...(e.classroomDiagnostic||{})}));
        }
        res.writeHead(303,{Location:'/integracoes?classroom='+outcome,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end();return true;
      }
      if(req.headers['sec-fetch-site']==='cross-site')throw error('Origem não autorizada.',403);
      if(!['GET','HEAD'].includes(req.method)){
        if(req.headers.origin!==config.origin)throw error('Origem não autorizada.',403);
        if(!req.headers['content-type']?.startsWith('application/json'))throw error('Use JSON.',415);
      }
      const input=req.method==='GET'?{}:await body(req);
      if(path==='/api/health'&&req.method==='GET'){respond(200,{ok:true,localMailbox:config.local&&config.mailMode==='local'});return true;}
      if(['/api/docs','/api/swagger'].includes(path)&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(swaggerHtml);
        return true;
      }
      if(path==='/api/openapi.json'&&req.method==='GET'){respond(200,openApiSpec);return true;}
      if(path==='/api/dev/mail'&&req.method==='GET'){
        if(!config.local||config.mailMode!=='local')throw error('Não encontrado.',404);
        respond(200,{messages:(await db.query('SELECT id,recipient,subject,body,link,created_at FROM development_mail ORDER BY created_at DESC LIMIT 30')).rows});return true;
      }
      if(path==='/api/auth/register'&&req.method==='POST'){
        await limited(req,'register',6);const info=validate(z.object({name:z.string().trim().min(1).max(80),email,password}),input);
        const exists=(await db.query('SELECT * FROM users WHERE email=$1',[info.email])).rows[0];
        if(!exists){const hash=await hashPassword(info.password);const u=await db.transaction(async tx=>{const user=(await tx.query('INSERT INTO users(name,email,password_hash,updated_at) VALUES($1,$2,$3,now()) RETURNING *',[info.name,info.email,hash])).rows[0];await tx.query("INSERT INTO subjects(user_id,name,color,is_general,updated_at) VALUES($1,'Estudo livre','purple',true,now())",[user.id]);return user;});await sendToken(u,'VERIFY');}
        else if(!exists.email_verified_at)await sendToken(exists,'VERIFY');
        respond(200,{message:'Se o endereço estiver disponível, você receberá um link para confirmar sua conta.'});return true;
      }
      if(path==='/api/auth/login'&&req.method==='POST'){
        await limited(req,'login');const info=validate(z.object({email,password:z.string().min(1).max(128)}),input);
        const u=(await db.query('SELECT * FROM users WHERE email=$1',[info.email])).rows[0];
        dummyHash??=await hashPassword(token());const valid=await checkPassword(info.password,u?.password_hash||dummyHash);
        if(!u||!valid)throw error('E-mail ou senha incorretos.',401);
        if(!u.email_verified_at)throw error('Confirme seu e-mail antes de entrar. Você pode solicitar outro link.',403);
        const raw=token();await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'7 days\')',[digest(raw),u.id]);
        respond(200,{user:account(u)},sessionCookie(raw,config.origin));return true;
      }
      if(['/api/auth/request-reset','/api/auth/resend'].includes(path)&&req.method==='POST'){
        await limited(req,path,5);const info=validate(emailSchema,input);const u=(await db.query('SELECT * FROM users WHERE email=$1',[info.email])).rows[0];
        if(u&&(path.endsWith('request-reset')||!u.email_verified_at))await sendToken(u,path.endsWith('resend')?'VERIFY':'RESET');
        respond(200,{message:'Se houver uma conta elegível, você receberá um e-mail com as instruções.'});return true;
      }
      if(['/api/auth/verify','/api/auth/reset'].includes(path)&&req.method==='POST'){
        await limited(req,'token',20);const info=validate(z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:path.endsWith('reset')?password:z.string().optional()}),input);
        const purpose=path.endsWith('reset')?'RESET':'VERIFY';const hash=purpose==='RESET'?await hashPassword(info.password):null;
        await db.transaction(async tx=>{
          const entry=(await tx.query('SELECT * FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest(info.token),purpose])).rows[0];
          if(!entry)throw error('Link inválido, expirado ou já utilizado. Solicite outro.');
          if(purpose==='VERIFY')await tx.query('UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',[entry.user_id]);
          else{await tx.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[entry.user_id,hash]);await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[entry.user_id]);}
          await tx.query('UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',[entry.user_id,purpose]);
        });
        respond(200,{message:purpose==='VERIFY'?'E-mail confirmado! Agora você pode entrar.':'Senha atualizada. Entre novamente com a nova senha.'});return true;
      }
      if(path==='/api/auth/logout'&&req.method==='POST'){await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest(readSessionCookie(req.headers.cookie))]);respond(200,{ok:true},sessionCookie('',config.origin,true));return true;}
      const user=await auth(req);
      if(path==='/api/auth/session'&&req.method==='GET')respond(200,{user:account(user)});
      else if(path==='/api/integrations/classroom/status'&&req.method==='GET')respond(200,await classroom.status(user));
      else if(path==='/api/integrations/classroom/deliveries'&&req.method==='POST'){if(!z.object({}).strict().safeParse(input).success)throw error('Consulta de entregas inválida.');await limited(req,'classroom-deliveries:'+user.id,120);respond(200,await classroom.deliveries(user));}
      else if(path==='/api/integrations/classroom/connect'&&req.method==='POST'){await limited(req,'classroom-connect',20);respond(200,await classroom.connect(user,digest(readSessionCookie(req.headers.cookie))));}
      else if(path==='/api/integrations/classroom/courses'&&req.method==='GET'){await limited(req,'classroom-courses',40);respond(200,await classroom.courses(user));}
      else if(path==='/api/integrations/classroom/sync'&&req.method==='POST'){await limited(req,'classroom-sync',20);respond(200,await classroom.sync(user,input));}
      else if(path==='/api/integrations/classroom/disconnect'&&req.method==='POST'){await limited(req,'classroom-disconnect',10);respond(200,await classroom.disconnect(user));}
      else if(path==='/api/data'&&req.method==='GET')respond(200,await readData(db,user));
      else if(path==='/api/data'&&req.method==='PUT')respond(200,await saveData(db,user,input));
      else if(path==='/api/analytics'&&req.method==='GET'){
        const params=new URL(req.url,config.origin).searchParams;
        const days=Number(params.get('days')||7),subject=params.get('subject')||'all';
        if(![7,30,90].includes(days)||subject!=='all'&&!z.string().uuid().safeParse(subject).success)throw error('Filtro inválido.');
        const snapshot=await readData(db,user);
        if(subject!=='all'&&!snapshot.data.subjects.some(s=>s.id===subject))throw error('Disciplina não autorizada.',403);
        try{respond(200,await prepareReportAnalytics(snapshot.data,days,subject));}catch(cause){console.error('Reports analytics failed:',{code:cause.code,message:cause.message,python:cause.python,exitCode:cause.exitCode,stderr:cause.stderr,attempts:cause.attempts});throw error('Não foi possível preparar o relatório. Confira Python/Pandas e tente novamente.',503);}
      }
      else if(path==='/api/ai/chat'&&req.method==='POST'){
        const parsed=agentChatInputSchema.safeParse(input);
        if(!parsed.success)throw error('Mensagem inválida.',400);
        respond(200,await chatWithAgent({db,user,message:parsed.data.message,conversationId:parsed.data.conversationId,config:agentConfig,provider:agentProvider,tools:agentTools}));
      }
      else if(path==='/api/history'&&req.method==='GET')respond(200,{items:(await db.query('SELECT h.id,h.changed_at,h.changes_json,t.title FROM task_history h JOIN academic_tasks t ON t.id=h.task_id WHERE h.user_id=$1 ORDER BY h.changed_at DESC LIMIT 100',[user.id])).rows});
      else if(path==='/api/notifications'&&req.method==='GET')respond(200,await readNotifications(db,user));
      else if(path==='/api/notifications/read'&&req.method==='POST') {const info=validate(z.object({id:z.string().uuid().optional()}),input);await db.query("UPDATE notification_deliveries SET read_at=now() WHERE user_id=$1 AND status='SENT' AND ($2::uuid IS NULL OR id=$2)",[user.id,info.id||null]);respond(200,{ok:true});}
      else throw error('Não encontrado.',404);
    }catch(e){const diagnostic=agentFailureDetails(e,agentConfig);if(diagnostic)console.error('Agent provider failed:',diagnostic);else if(!e.status)console.error('API operation failed:',e.code||e.name);respond(e.status||500,{message:e.status?e.message:'Não foi possível concluir. Tente novamente.'});}
    return true;
  };
}
