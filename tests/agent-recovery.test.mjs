import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {createAgentProvider,AgentProviderError} from '../server/agent-provider.mjs';
import {chatWithAgent} from '../server/agent-orchestrator.mjs';

async function fixture(t){
  const db=await openDatabase({url:'',directory:'memory://'});t.after(()=>db.close());
  const user={id:randomUUID()},subjectId=randomUUID();
  await db.query("INSERT INTO users(id,name,email,password_hash,updated_at) VALUES($1,'Mock','recovery@example.test','fake',now())",[user.id]);
  await db.query("INSERT INTO subjects(id,user_id,name,updated_at) VALUES($1,$2,'Mock',now())",[subjectId,user.id]);
  const config={...readAgentConfig({GOOGLE_API_KEY:'mock-only',LLM_MODEL:'mock',LLM_TIMEOUT_MS:'3000'}),baseUrl:'https://gemini.invalid/models',retryBaseMs:0};
  return {db,user,subjectId,config};
}
const final={type:'action',action:'create_task',result:{title:'Model-invented title',id:'Model-invented ID'}};
const answer=value=>({status:200,body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value),thoughtSignature:'final-signature'}]}}]}});
const tool=(subjectId,id='create-1')=>({status:200,body:{candidates:[{content:{parts:[{text:'opaque thought',thought:true,thoughtSignature:'text-signature'},{functionCall:{id,name:'create_task',args:{subjectId,title:'Real task'}},thoughtSignature:'call-signature'}]}}]}});

test('Gemini recovery after create_task retries only final generation, executes one write, and returns authoritative result',async t=>{
  const ctx=await fixture(t),requests=[];const responses=[tool(ctx.subjectId),{status:503,body:{}},answer(final)];
  const provider=createAgentProvider(ctx.config,{async post(url,headers,body){requests.push(structuredClone(body));return responses.shift();}});
  const result=await chatWithAgent({...ctx,message:'Crie uma tarefa',provider});
  assert.equal(requests.length,3);assert.equal((await ctx.db.query('SELECT id FROM academic_tasks')).rows.length,1);
  assert.equal((await ctx.db.query("SELECT id FROM ai_tool_executions WHERE status='SUCCESS'")).rows.length,1);
  assert.deepEqual(requests[1],requests[2]);assert.equal(result.response.result.title,'Real task');assert.notEqual(result.response.result.id,'Model-invented ID');
  assert.equal(requests[1].contents[1].parts[0].thoughtSignature,'text-signature');
  assert.ok(requests[1].contents[1].parts[0].thought);
  assert.equal(result.response.type,'action');
  const restored=createAgentProvider(ctx.config,{async post(url,headers,body){
    assert.ok(body.contents.some(c=>c.parts.some(p=>p.thoughtSignature==='final-signature')));
    return answer({type:'text',content:'Contexto preservado'});
  }});
  await chatWithAgent({...ctx,conversationId:result.conversationId,message:'O que foi feito?',provider:restored});
});
test('permanent safety failure after a successful Tool returns conversation and applied-action metadata without replay',async t=>{
  const ctx=await fixture(t);let requests=0;
  const provider=createAgentProvider(ctx.config,{async post(){requests++;return requests===1?tool(ctx.subjectId):{status:200,body:{promptFeedback:{blockReason:'SAFETY'}}};}});
  await assert.rejects(chatWithAgent({...ctx,message:'Crie uma tarefa',provider}),e=>e.code==='provider-safety-blocked'&&e.actionsApplied===true&&/^[0-9a-f-]{36}$/.test(e.conversationId));
  assert.equal(requests,2);assert.equal((await ctx.db.query('SELECT id FROM academic_tasks')).rows.length,1);
});

test('one invalid final JSON can be repaired within iteration limit without repeating a write',async t=>{
  const ctx=await fixture(t);let calls=0;
  const provider={async complete(req){calls++;if(calls===1)return {toolCalls:[{id:'write-once',name:'create_task',arguments:{subjectId:ctx.subjectId,title:'Real task'}}]};assert.equal(req.tools,undefined);if(calls===2)return {content:'invalid JSON'};return {content:JSON.stringify(final)};}};
  const result=await chatWithAgent({...ctx,message:'Crie uma tarefa',provider});
  assert.equal(calls,3);assert.equal(result.response.result.title,'Real task');assert.equal((await ctx.db.query('SELECT id FROM academic_tasks')).rows.length,1);
});
test('new write Tool calls during finalization are audited as rejected and never executed',async t=>{
  const ctx=await fixture(t);let requests=0;
  const provider={async complete(){requests++;return {toolCalls:[{id:`new-${requests}`,name:'create_task',arguments:{subjectId:ctx.subjectId,title:'Real task'}}]};}};
  await assert.rejects(chatWithAgent({...ctx,message:'Crie uma tarefa',provider}),e=>e.code==='iteration-limit'&&e.actionsApplied);
  assert.equal((await ctx.db.query('SELECT id FROM academic_tasks')).rows.length,1);
  const rejected=(await ctx.db.query("SELECT output_json FROM ai_tool_executions WHERE status='FAILED'")).rows;
  assert.equal(rejected.length,2);assert.ok(rejected.every(row=>row.output_json.code==='unexpected-tool-call'));
});
test('invalid structured output after a Tool is reported without retrying any side effect',async t=>{
  const ctx=await fixture(t);let requests=0;
  const provider={async complete(){requests++;return requests===1?{toolCalls:[{id:'once',name:'create_task',arguments:{subjectId:ctx.subjectId,title:'Real task'}}]}:{content:'not-json'};}};
  await assert.rejects(chatWithAgent({...ctx,message:'Crie uma tarefa',provider}),e=>e.code==='invalid-structured-output'&&e.actionsApplied);
  assert.equal(requests,3);assert.equal((await ctx.db.query('SELECT id FROM academic_tasks')).rows.length,1);
});
test('history window keeps recent complete Tool exchanges and microsecond boundaries',async t=>{
  const ctx=await fixture(t),conversationId=randomUUID();
  await ctx.db.query("INSERT INTO ai_conversations(id,user_id,updated_at) VALUES($1,$2,now())",[conversationId,ctx.user.id]);
  const rows=[['USER','old input'],['ASSISTANT','old output'],['USER','latest user turn'],['ASSISTANT',JSON.stringify({content:null,toolCalls:[{id:'a',name:'list_tasks',arguments:{}},{id:'b',name:'get_task',arguments:{taskId:randomUUID()}}]})],['TOOL',JSON.stringify({name:'list_tasks',toolCallId:'a',result:{count:0}})],['TOOL',JSON.stringify({name:'get_task',toolCallId:'b',result:{}})],['ASSISTANT',JSON.stringify({type:'text',content:'Latest answer'})]];
  for(const [index,[role,content]] of rows.entries())await ctx.db.query('INSERT INTO ai_messages(conversation_id,role,content,created_at) VALUES($1,$2,$3,$4)',[conversationId,role,content,`2026-10-01T00:00:00.12300${index}Z`]);
  let seen;
  const provider={async complete(req){seen=req.messages;return {content:'Continuação segura'};}};
  await chatWithAgent({...ctx,config:{...ctx.config,maxHistory:4},conversationId,message:'continue',provider});
  assert.equal(seen[1].content,'latest user turn');assert.ok(seen.some(m=>m.tool_calls?.length===2));assert.equal(seen.filter(m=>m.role==='tool').length,2);assert.ok(!seen.some(m=>m.content==='old input'));assert.equal(seen.at(-1).content,'continue');
});
test('first-turn provider error preserves conversation ID for a manual continuation',async t=>{
  const ctx=await fixture(t);let conversationId;
  await assert.rejects(chatWithAgent({...ctx,message:'Mensagem original',provider:{async complete(){throw new AgentProviderError('Unavailable',503,'provider-network',true);}}}),e=>{conversationId=e.conversationId;return !!conversationId&&!e.actionsApplied;});
  await chatWithAgent({...ctx,conversationId,message:'Continue sem criar nada',provider:{async complete(req){assert.ok(req.messages.some(m=>m.content==='Mensagem original'));return {content:'OK'};}}});
  assert.equal((await ctx.db.query('SELECT id FROM ai_conversations')).rows.length,1);
});
