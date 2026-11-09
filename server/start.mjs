import { existsSync } from 'node:fs';
import { createServer,request } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.mjs';
import { createAPI } from './api.mjs';
import {listenHost} from './runtime-host.mjs';
import {connectUpgradeSockets} from './proxy-upgrade.mjs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(existsSync('.env.classroom.local'))process.loadEnvFile('.env.classroom.local');
const port=Number(process.env.PORT||4173),uiPort=Number(process.env.UI_PORT||4174);
const origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(new URL(origin).hostname);
const mailMode=process.env.MAIL_MODE||'local';
if(!local&&(!origin.startsWith('https:')||mailMode==='local'||!process.env.DATABASE_URL))throw new Error('Production requires HTTPS, external PostgreSQL and real mail configuration.');
if(!['local','smtp','resend'].includes(mailMode))throw new Error('MAIL_MODE must be local, smtp or resend.');
const smtpPort=Number(process.env.SMTP_PORT||587);
if(mailMode==='smtp'&&(!process.env.SMTP_HOST||!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD||!process.env.MAIL_FROM))throw new Error('Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM in .env.local.');
if(mailMode==='resend'&&(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM))throw new Error('Configure RESEND_API_KEY and MAIL_FROM in .env.local.');
const host=listenHost(origin,process.env.NODE_ENV);
const db=await openDatabase();const api=createAPI(db,{origin,local,mailMode,env:process.env});
const command=process.argv.includes('--dev')?'dev':'start';
process.env.NEXT_TELEMETRY_DISABLED ??= '1';
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),command,'--port',String(uiPort),'--hostname','127.0.0.1'],{stdio:'inherit',windowsHide:true});
const server=createServer(async(req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');
  if(await api(req,res))return;
  const proxy=request({hostname:'127.0.0.1',port:uiPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  req.on('error',()=>proxy.destroy());res.on('close',()=>proxy.destroy());
  proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('EduTrack está iniciando. Atualize em alguns segundos.');});req.pipe(proxy);
});
server.on('upgrade',(req,socket,head)=>{
  const proxy=request({hostname:'127.0.0.1',port:uiPort,path:req.url,headers:req.headers});
  socket.on('error',()=>proxy.destroy());socket.on('close',()=>proxy.destroy());
  proxy.on('upgrade',(response,upstream,buffer)=>connectUpgradeSockets(socket,upstream,head,buffer,response.headers));proxy.on('error',()=>socket.destroy());proxy.end();
});
server.listen(port,host,()=>console.log(`EduTrack: ${origin} | e-mails: ${mailMode} | sem Docker`));
async function close(){server.close();child.kill();await db.close();process.exit();}
process.on('SIGINT',close);process.on('SIGTERM',close);child.on('exit',code=>{if(code)console.error('Frontend exited:',code);void close();});
