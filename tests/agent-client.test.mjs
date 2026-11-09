import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentRequestError,chatWithAgent} from '../components/edutrack/agent-api.ts';
const id='11111111-1111-4111-8111-111111111111';
test('agent frontend shows safe errors and retains conversation/actions without retry',async()=>{
  let calls=0;
  await assert.rejects(chatWithAgent({message:'fake'},async()=>{calls++;return Response.json({code:'provider-safety-blocked',message:'Upstream secret',conversationId:id,actionsApplied:true},{status:422});}),error=>{
    assert.ok(error instanceof AgentRequestError);assert.equal(error.conversationId,id);assert.ok(error.actionsApplied);assert.match(error.message,/segurança/);assert.match(error.message,/já foi aplicada/);assert.doesNotMatch(error.message,/Upstream secret/);return true;
  });assert.equal(calls,1);
});
test('agent frontend handles HTML, malformed JSON and network errors without exposing payloads',async()=>{
  for(const fetchImpl of [async()=>new Response('<html>private diagnostic</html>',{status:502}),async()=>Response.json(null),async()=>{throw new Error('secret endpoint');}])await assert.rejects(chatWithAgent({message:'fake'},fetchImpl),e=>e instanceof AgentRequestError&&!/private|secret|Unexpected token/.test(e.message));
});
test('agent frontend handles rate limits and authentication errors explicitly',async()=>{
  await assert.rejects(chatWithAgent({message:'fake'},async()=>Response.json({code:'provider-http-error'},{status:429})),/limite de uso/);
  await assert.rejects(chatWithAgent({message:'fake'},async()=>Response.json({},{status:401})),/sessão expirou/);
});
test('agent frontend preserves successful text, analysis and action contracts',async()=>{
  for(const response of [{type:'text',content:'OK'},{type:'analysis',analysis:'OK',metrics:{}},{type:'action',action:'create_task',result:{id}}])assert.deepEqual((await chatWithAgent({message:'fake'},async()=>Response.json({conversationId:id,response}))).response,response);
});

test('agent frontend rejects invalid structured fields before rendering',async()=>{
  for(const response of [{type:'analysis',analysis:'OK',metrics:null},{type:'text',content:12},{type:'action',action:'create_task',result:null},{type:'action',action:'execute_sql',result:{}},{type:'analysis',analysis:'OK',metrics:{},chart:{data:[]}}])await assert.rejects(chatWithAgent({message:'fake'},async()=>Response.json({conversationId:id,response})),e=>e instanceof AgentRequestError);
});
