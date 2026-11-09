import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createAPI} from '../server/api.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {token,digest} from '../server/security.mjs';
import {labConfig,labDocument,labFixtureProvider} from './fixtures/lab.mjs';
import {isStudyPath,canNavigateWithinStudy} from '../lib/navigation.mjs';

test('laboratory is part of client navigation without replacing the agent or existing routes',()=>{
  assert.equal(isStudyPath('/laboratorio'),true);assert.equal(canNavigateWithinStudy('/laboratorio?atividade='+randomUUID(),'http://localhost:4175/tarefas'),true);
  assert.equal(isStudyPath('/laboratorio/unrecognized'),false);assert.equal(isStudyPath('/agente'),true);
});

test('laboratory reuses Gemini, Groq and OpenRouter transports without Tools or implicit fallback',async()=>{
  const db=await openDatabase({url:'',directory:'memory://'});
  const user=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('Transport','lab-transport@example.test','mock',now()) RETURNING id")).rows[0];
  const raw=token();await db.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),user.id]);
  let api;const server=createServer((req,res)=>void api(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const provider of ['google-gemini','groq','openrouter']){
      let calls=0;
      const config=labConfig();
      api=createAPI(db,{origin,local:true,mailMode:'local',env:{},agentConfig:readAgentConfig({LLM_PROVIDER:provider,LLM_MODEL:'mock',GROQ_MODEL:'mock',LLM_FALLBACK_MODEL:'never-use',LLM_TIMEOUT_MS:'120000',GOOGLE_API_KEY:'mock-key',GROQ_API_KEY:'mock-key',OPENROUTER_API_KEY:'mock-key'}),agentTransport:{async post(url,headers,body,timeout){
        calls++;assert.ok(timeout<=45000);assert.ok(!body.tools?.length);
        assert.doesNotMatch(JSON.stringify(body),/never-use/);
        const content=JSON.stringify(labDocument(config));
        return {status:200,body:provider==='google-gemini'?{candidates:[{content:{role:'model',parts:[{text:content}]},finishReason:'STOP'}]}:{choices:[{message:{content},finish_reason:'stop'}]}};
      }}});
      const response=await fetch(origin+'/api/lab/quizzes',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:`edutrack_session=${raw}`},body:JSON.stringify(config)});
      assert.equal(response.status,200);assert.equal((await response.json()).questions.length,5);assert.equal(calls,1);
    }
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
});

test('laboratory API enforces auth, CSRF, input validation, user ownership and recovery',async t=>{
  const db=await openDatabase({url:'',directory:'memory://'});let api,calls=0,invalid=false;
  const fixture=labFixtureProvider();
  const server=createServer((req,res)=>void api(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  api=createAPI(db,{origin,local:true,mailMode:'local',env:{},agentConfig:readAgentConfig({}),agentProvider:{async complete(request){calls++;if(invalid)throw Object.assign(new Error('secret-token-and-internal-payload'),{code:'provider-safety-blocked',status:503});return fixture.complete(request);}}});
  async function account(email){
    const user=(await db.query('INSERT INTO users(name,email,password_hash,email_verified_at,updated_at) VALUES($1,$2,$3,now(),now()) RETURNING id',['Test',email,'fixture-only'])).rows[0];const raw=token();
    await db.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),user.id]);return `edutrack_session=${raw}`;
  }
  async function call(path,input,cookie='',extra={}){
    const response=await fetch(origin+path,{method:input===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},body:input===undefined?undefined:JSON.stringify(input)});
    return {status:response.status,body:await response.json()};
  }
  const a=await account('lab-api-a@example.test'),b=await account('lab-api-b@example.test');let id;
  try{
    await t.test('anonymous requests and cross-site generation never call AI',async()=>{
      assert.equal((await call('/api/lab')).status,401);assert.equal((await call('/api/lab/quizzes',labConfig())).status,401);
      assert.equal((await call('/api/lab/quizzes',labConfig(),a,{Origin:'https://evil.test'})).status,403);assert.equal(calls,0);
    });
    await t.test('strict input rejects forged owners or answer keys before generating',async()=>{
      assert.equal((await call('/api/lab/quizzes',{...labConfig(),userId:randomUUID()},a)).status,400);assert.equal(calls,0);
    });
    await t.test('authenticated generation can recover on another HTTP request with same request ID',async()=>{
      const config=labConfig();const result=await call('/api/lab/quizzes',config,a);assert.equal(result.status,200);id=result.body.id;
      assert.equal((await call('/api/lab/quizzes',config,a)).body.id,id);assert.equal(calls,1);
      assert.equal((await call(`/api/lab/quizzes/${id}`,undefined,a)).body.questions.length,5);
      assert.equal((await call(`/api/lab/quizzes/${id}`,undefined,b)).status,404);
    });
    await t.test('answers and completion persist and reject key manipulation or another user',async()=>{
      assert.equal((await call(`/api/lab/quizzes/${id}/answers`,{questionIndex:0,optionIndex:0},b)).status,404);
      assert.equal((await call(`/api/lab/quizzes/${id}/answers`,{questionIndex:0,optionIndex:0,correctIndex:0},a)).status,400);
      for(let i=0;i<5;i++)assert.equal((await call(`/api/lab/quizzes/${id}/answers`,{questionIndex:i,optionIndex:0},a)).status,200);
      const completed=await call(`/api/lab/quizzes/${id}/finish`,{},a);assert.equal(completed.status,200);assert.equal(completed.body.score,5);
      const overview=await call('/api/lab',undefined,a);assert.equal(overview.body.summary.accuracy,100);assert.equal(overview.body.summary.completed,1);
      assert.equal((await call('/api/lab',undefined,b)).body.summary.completed,0);
    });
    await t.test('provider errors carry safe machine codes without raw messages',async()=>{
      invalid=true;const result=await call('/api/lab/quizzes',labConfig(),a);assert.equal(result.status,503);assert.equal(result.body.code,'provider-safety-blocked');assert.doesNotMatch(JSON.stringify(result.body),/secret-token|internal-payload/);
    });
    await t.test('invalid session IDs and unknown routes are safe',async()=>{
      assert.equal((await call('/api/lab/quizzes/not-a-uuid',undefined,a)).status,400);assert.equal((await call('/api/lab/unknown',{},a)).status,404);
    });
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
});
