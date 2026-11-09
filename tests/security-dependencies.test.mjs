import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import {createMailer} from '../server/mail.mjs';
import {structuredResponseSchema} from '../lib/agent-response-schemas.mjs';
import {toolArgumentSchemas,toolCallSchema} from '../server/agent-schemas.mjs';
const require=createRequire(import.meta.url);
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const atLeast=(actual,minimum)=>{const a=actual.split('.').map(Number),b=minimum.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false;}return true;};

test('installed runtime and lockfile contain patched direct dependencies and no vulnerable nested Zod',()=>{
  for(const [name,minimum] of Object.entries({next:'16.4.1',nodemailer:'10.1.4',zod:'4.6.6'})){
    assert.equal(realpathSync(require.resolve(`${name}/package.json`)),realpathSync(fileURLToPath(new URL(`../node_modules/${name}/package.json`,import.meta.url))),'Dependencies must resolve from this installation, never an ancestor workspace');
    const installed=require(`${name}/package.json`).version;assert.ok(atLeast(installed,minimum),`${name} ${installed}`);
    assert.equal(installed,lock.packages[`node_modules/${name}`].version);
  }
  for(const [path,value] of Object.entries(lock.packages))if(/(^|\/)node_modules\/zod$/.test(path))assert.ok(atLeast(value.version,'4.6.6'),path);
});

test('Zod 4 shared responses preserve dynamic records and reject invalid structured fields',()=>{
  const responses=[{type:'text',content:'OK',metadata:{duration:2}},{type:'analysis',analysis:'OK',metrics:{minutes:15,nested:{value:true}},metadata:{test:true}},{type:'action',action:'create_task',result:{id:randomUUID(),dueDate:null,title:'Mock'}}];
  for(const response of responses)assert.deepEqual(structuredResponseSchema.parse(response),response);
  assert.equal(structuredResponseSchema.safeParse({type:'analysis',analysis:'OK',metrics:[]}).success,false);
  assert.equal(structuredResponseSchema.safeParse({...responses[0],forged:true}).success,false);
  assert.equal(structuredResponseSchema.safeParse({type:'analysis',analysis:'OK'}).success,false);
});

test('Zod 4 Tools keep UUID, optional/null, strictness and unknown argument values',()=>{
  const id=randomUUID();
  assert.equal(toolArgumentSchemas.create_task.safeParse({subjectId:id,title:'Mock',dueDate:null,estimatedMinutes:null}).success,true);
  assert.equal(toolArgumentSchemas.list_tasks.safeParse({}).success,true);
  assert.equal(toolArgumentSchemas.list_tasks.safeParse({status:null}).success,true);
  assert.equal(toolArgumentSchemas.create_task.safeParse({subjectId:id,title:'Mock',userId:id}).success,false);
  assert.equal(toolArgumentSchemas.create_task.safeParse({subjectId:id,title:'Mock',dueDate:'2026-02-30'}).success,false);
  assert.equal(toolCallSchema.safeParse({id:'call',name:'list_tasks',arguments:{status:undefined}}).success,true);
  assert.equal(z.array(z.string()).max(3).safeParse(Array(1000).fill('mock')).success,false);
});

const parser=require('nodemailer/lib/addressparser');
function addresses(items){return items.flatMap(item=>item.group?addresses(item.group):item.address?[item.address]:[]);}
test('Nodemailer keeps nested comments from becoming recipients (GHSA-8c8m-p3m8-cjg8)',()=>{
  assert.deepEqual(addresses(parser('Victim (x(y) <evil@evil.test>) <v@victim.test>')),['v@victim.test']);
});
test('Nodemailer keeps quoted/comment semicolons inside address groups (GHSA-m943-m63m-w62w)',()=>{
  assert.deepEqual(addresses(parser('G: (a; <evil@evil.test>) <v@victim.test>;')),['v@victim.test']);
});
test('Nodemailer keeps quoted local-part angle brackets from changing destination domain (GHSA-85x2-q946-cp5h)',()=>{
  const recipients=addresses(parser('<"a@evil.test>"@good.test>'));
  assert.equal(recipients.length,1);assert.equal(recipients[0].split('@').at(-1),'good.test');
});
test('transactional SMTP-compatible mail renders through the real Nodemailer without network or credentials',async()=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});let result;
  const smtpTransport={async sendMail(input){result=await transport.sendMail(input);return {accepted:result.envelope.to};}};
  const mail=createMailer(null,{mailMode:'smtp',env:{MAIL_FROM:'EduTrack Test <sender@example.test>'}},{smtpTransport});
  await mail({to:'student@example.test',subject:'Mock verification',body:'Verify your account',link:'https://example.test/verify?token=fake'});
  assert.equal(result.envelope.from,'sender@example.test');assert.deepEqual(result.envelope.to,['student@example.test']);assert.match(result.message.toString(),/token=fake/);
});
