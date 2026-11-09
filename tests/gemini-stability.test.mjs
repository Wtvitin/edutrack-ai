import test from 'node:test';
import assert from 'node:assert/strict';
import {readAgentConfig} from '../server/agent-config.mjs';
import {AgentProviderError,createAgentProvider,createFetchTransport} from '../server/agent-provider.mjs';
import {responseJsonSchemas,structuredResponseSchema,toolDefinitions,toolCallSchema} from '../server/agent-schemas.mjs';

const config=()=>({...readAgentConfig({GOOGLE_API_KEY:'mock-key-not-real',LLM_MODEL:'mock-gemini',LLM_TIMEOUT_MS:'1000'}),baseUrl:'https://gemini.invalid/models',retryBaseMs:0});
const request={messages:[{role:'user',content:'Mensagem fictícia'}]};
const ok=()=>({status:200,body:{candidates:[{finishReason:'STOP',content:{parts:[{text:'Resposta de teste'}]}}]}});
function setup(responses){const requests=[];return {requests,provider:createAgentProvider(config(),{async post(url,headers,body,timeout){requests.push({url,headers,body:structuredClone(body),timeout});const result=responses.shift();if(result instanceof Error)throw result;assert.ok(result,'Unexpected extra retry');return result;}})};}

for(const status of [429,500,502,503,504])test(`Gemini recovers HTTP ${status} with one bounded retry of the same request`,async()=>{
  const {provider,requests}=setup([{status,body:{error:{status:'UNAVAILABLE'}}},ok()]);
  assert.equal((await provider.complete(request)).content,'Resposta de teste');assert.equal(requests.length,2);
  assert.deepEqual(requests[0].body,requests[1].body);assert.ok(requests[1].timeout<=requests[0].timeout);
  assert.ok(requests.every(r=>r.url.startsWith('https://gemini.invalid/')));
});
for(const status of [400,401,403,404,501])test(`Gemini does not retry unrecoverable HTTP ${status}`,async()=>{
  const {provider,requests}=setup([{status,body:{error:{message:'secret-not-for-client'}}}]);
  await assert.rejects(provider.complete(request),e=>!e.transient&&e.providerStatus===status&&!JSON.stringify(e).includes('secret-not-for-client'));
  assert.equal(requests.length,1);
});
test('Gemini waits rather than immediately retrying a quota with a long retry-after',async()=>{
  const {provider,requests}=setup([{status:429,retryAfter:'120',body:{error:{status:'RESOURCE_EXHAUSTED'}}}]);
  await assert.rejects(provider.complete(request),e=>e.status===429&&e.retryAfterMs===120000);
  assert.equal(requests.length,1);
});
test('Gemini daily quota and RetryInfo are handled without consuming futile retries',async()=>{
  const daily=setup([{status:429,body:{error:{details:[{violations:[{quotaId:'GenerateRequestsPerDayPerProject'}]}]}}}]);
  await assert.rejects(daily.provider.complete(request),e=>e.code==='provider-quota-exhausted'&&!e.transient);assert.equal(daily.requests.length,1);
  const delay=setup([{status:503,body:{error:{details:[{retryDelay:'30s'}]}}}]);
  await assert.rejects(delay.provider.complete(request),e=>e.retryAfterMs===30000);assert.equal(delay.requests.length,1);
});
for(const reason of ['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII'])test(`Gemini ${reason} is not retried and partial calls are not returned`,async()=>{
  const {provider,requests}=setup([{status:200,body:{candidates:[{finishReason:reason,content:{parts:[{functionCall:{name:'create_task',args:{}}}]}}]}}]);
  await assert.rejects(provider.complete(request),e=>e.code==='provider-safety-blocked'&&e.status===422&&!e.transient);assert.equal(requests.length,1);
});
test('Gemini prompt block is distinguished from an empty response',async()=>{
  const {provider,requests}=setup([{status:200,body:{promptFeedback:{blockReason:'SAFETY'}}}]);
  await assert.rejects(provider.complete(request),e=>e.code==='provider-safety-blocked');assert.equal(requests.length,1);
});
for(const reason of ['MAX_TOKENS','MALFORMED_FUNCTION_CALL','UNEXPECTED_TOOL_CALL','LANGUAGE'])test(`Gemini does not execute/retry incomplete generation ${reason}`,async()=>{
  const {provider,requests}=setup([{status:200,body:{candidates:[{finishReason:reason,content:{parts:[{functionCall:{name:'create_task',args:{}}}]}}]}}]);
  await assert.rejects(provider.complete(request),e=>!e.transient&&e.code.startsWith('provider-'));assert.equal(requests.length,1);
});
test('Gemini retries whitespace/empty generations only once and never shows thought text',async()=>{
  const {provider,requests}=setup([{status:200,body:{candidates:[{content:{parts:[{text:'Internal thought',thought:true},{text:'   '}]}}]}},ok()]);
  assert.equal((await provider.complete(request)).content,'Resposta de teste');assert.equal(requests.length,2);
  const empty=setup([{status:200,body:{candidates:[]}},{status:200,body:{candidates:[]}}]);
  await assert.rejects(empty.provider.complete(request),e=>e.code==='provider-empty-response');assert.equal(empty.requests.length,2);
});
test('Gemini connection failures retry transport only, with no fallback provider',async()=>{
  const {provider,requests}=setup([new AgentProviderError('Connection failed',503,'provider-network',true),ok()]);
  await provider.complete(request);assert.equal(requests.length,2);
});
test('fetch timeout also covers response body and non-AbortError abort rejections',async()=>{
  const transport=createFetchTransport(async(url,options)=>({status:200,text:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new TypeError('Secret upstream message')),{once:true}))}));
  await assert.rejects(transport.post('https://gemini.invalid',{}, {},5),e=>e.code==='provider-timeout'&&e.status===504&&!e.message.includes('Secret'));
});
test('fetch network failure remains controlled and retry-after metadata is read',async()=>{
  await assert.rejects(createFetchTransport(async()=>{throw new TypeError('secret');}).post('https://gemini.invalid',{},{},10),e=>e.code==='provider-network');
  const response=await createFetchTransport(async()=>new Response('{}',{status:429,headers:{'retry-after':'2'}})).post('https://gemini.invalid',{},{},100);
  assert.equal(response.retryAfter,'2');
});
test('Gemini preserves signed parts, groups parallel responses and keeps real user turns',async()=>{
  const signed={role:'model',parts:[{text:'Non-public thought',thought:true,thoughtSignature:'text-signature'},{functionCall:{name:'list_tasks',args:{},id:'a'},thoughtSignature:'first-signature'},{functionCall:{name:'get_task',args:{taskId:'id'},id:'b'}}]};
  const {provider,requests}=setup([ok()]);
  await provider.complete({messages:[...request.messages,{role:'assistant',geminiContent:signed},{role:'tool',name:'list_tasks',tool_call_id:'a',content:'{"count":0}'},{role:'tool',name:'get_task',tool_call_id:'b',content:'null'}],responseFormat:{name:'action',schema:responseJsonSchemas.action}});
  const body=requests[0].body;assert.deepEqual(body.contents[0],{role:'user',parts:[{text:'Mensagem fictícia'}]});
  assert.deepEqual(body.contents[1],signed);assert.equal(body.contents[2].parts.length,2);assert.equal(body.contents.length,3);
  assert.deepEqual(body.contents[2].parts[1].functionResponse.response,{result:null});
  assert.equal(body.generationConfig.responseSchema,undefined);assert.equal(body.generationConfig.responseJsonSchema.properties.result.additionalProperties,true);
  assert.match(body.systemInstruction.parts.at(-1).text,/Não execute novas ações/);
});
test('Gemini schemas preserve nullable Tool fields and validate structured output locally',async()=>{
  const {provider,requests}=setup([ok()]);await provider.complete({...request,tools:toolDefinitions});
  const create=requests[0].body.tools[0].functionDeclarations.find(t=>t.name==='create_task');
  assert.equal(create.parameters.properties.dueDate.nullable,true);assert.equal(create.parameters.properties.estimatedMinutes.nullable,true);assert.equal(create.parameters.properties.subjectId.format,undefined);
  assert.equal(structuredResponseSchema.safeParse({type:'action',action:'execute_sql',result:{}}).success,false);
});
test('Gemini retains malformed argument arrays for rejection instead of silently coercing to an empty object',async()=>{
  const {provider}=setup([{status:200,body:{candidates:[{content:{parts:[{functionCall:{name:'list_tasks',args:[]}}]}}]}}]);
  const call=(await provider.complete(request)).toolCalls[0];assert.equal(toolCallSchema.safeParse(call).success,false);
});

test('Gemini never sends a synthetic response ID when the original call had no ID',async()=>{
  const signed={role:'model',parts:[{functionCall:{name:'list_tasks',args:{}},thoughtSignature:'exact-signature'}]};
  const {provider,requests}=setup([ok()]);
  await provider.complete({messages:[...request.messages,{role:'assistant',tool_calls:[{id:'internal-only',name:'list_tasks',arguments:{}}],geminiContent:signed},{role:'tool',name:'list_tasks',tool_call_id:'internal-only',content:'{"count":0}'}]});
  assert.deepEqual(requests[0].body.contents[1],signed);assert.equal(requests[0].body.contents[2].parts[0].functionResponse.id,undefined);
});

test('Gemini total request deadline prevents a second attempt after transport timeout',async()=>{
  let calls=0;
  const provider=createAgentProvider({...config(),timeoutMs:15},{async post(){calls++;await new Promise(resolve=>setTimeout(resolve,25));throw new AgentProviderError('Timeout',504,'provider-timeout',true);}});
  await assert.rejects(provider.complete(request),e=>e.code==='provider-timeout');assert.equal(calls,1);
});
