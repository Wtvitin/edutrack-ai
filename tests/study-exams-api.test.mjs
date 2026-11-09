import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createAPI} from '../server/api.mjs';
import {digest,token} from '../server/security.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {labFixtureProvider} from './fixtures/lab.mjs';

test('exam HTTP API requires auth, explicit confirmation and immutable server-side grading',async t=>{
  const db=await openDatabase({url:'',directory:'memory://'});let api,calls=0;
  const server=createServer((req,res)=>void api(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const provider=labFixtureProvider();api=createAPI(db,{origin,local:true,mailMode:'local',env:{},agentConfig:readAgentConfig({}),agentProvider:{async complete(request){calls++;return provider.complete(request);}}});
  const user=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('API','exam-api@example.test','mock',now()) RETURNING id")).rows[0];
  const subject=(await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'Banco de Dados','SQL',now()) RETURNING id",[user.id])).rows[0];
  const raw=token();await db.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),user.id]);const cookie=`edutrack_session=${raw}`;
  async function call(path,input,auth=cookie,extra={}){const response=await fetch(origin+path,{method:input===undefined?'GET':'POST',headers:{Cookie:auth,Origin:origin,'Content-Type':'application/json',...extra},body:input===undefined?undefined:JSON.stringify(input)});return {status:response.status,body:await response.json()};}
  let draft,settings;
  try{
    await t.test('anonymous/cross-origin preparation and forged fields never reach AI',async()=>{
      const input={requestId:randomUUID(),prompt:'Simulado de SQL'};
      assert.equal((await call('/api/lab/exams',input,'')).status,401);assert.equal((await call('/api/lab/exams',input,cookie,{Origin:'https://evil.test'})).status,403);
      assert.equal((await call('/api/lab/exams',{...input,userId:user.id})).status,400);assert.equal(calls,0);
    });
    await t.test('preparation returns default configuration and confirmation is mandatory',async()=>{
      const response=await call('/api/lab/exams',{requestId:randomUUID(),prompt:'Simulado de SQL'});assert.equal(response.status,200);draft=response.body;
      assert.equal(draft.subjectId,subject.id);settings={subjectId:subject.id,topic:draft.topic,count:30,difficulty:'mixed',durationMinutes:0,reviewEnabled:true,alternatives:4};
      assert.equal((await call(`/api/lab/exams/${draft.id}/generate`,{settings})).status,400);assert.equal(calls,0);
    });
    await t.test('generation and saving answers keep the key hidden in all unfinished responses',async()=>{
      const generated=await call(`/api/lab/exams/${draft.id}/generate`,{confirmed:true,settings});assert.equal(generated.status,200);assert.equal(generated.body.questions.length,30);assert.equal(calls,3);
      assert.doesNotMatch(JSON.stringify(generated.body),/correctIndex|explanation|isCorrect/);
      const answer=await call(`/api/lab/exams/${draft.id}/answers`,{questionIndex:29,optionIndex:0,expectedRevision:0});assert.equal(answer.status,200);assert.equal(answer.body.questions[29].selectedIndex,0);assert.doesNotMatch(JSON.stringify(answer.body),/correctIndex|explanation|isCorrect/);
      assert.equal((await call(`/api/lab/exams/${draft.id}/marks`,{questionIndex:20,flagged:true,expectedRevision:0})).status,200);
    });
    await t.test('generic quiz endpoints cannot bypass explicit exam delivery',async()=>{
      assert.equal((await call(`/api/lab/quizzes/${draft.id}/finish`,{})).status,409);
      assert.equal((await call(`/api/lab/quizzes/${draft.id}/answers`,{questionIndex:0,optionIndex:0})).status,409);
      assert.equal((await call(`/api/lab/exams/${draft.id}/submit`,{})).status,400);
    });
    await t.test('delivery supports omissions, reveals correction and refuses changes afterwards',async()=>{
      const response=await call(`/api/lab/exams/${draft.id}/submit`,{confirmed:true});assert.equal(response.status,200);assert.equal(response.body.exam.results.total,30);assert.equal(response.body.exam.results.unanswered,29);assert.ok(response.body.questions[0].explanation);
      const repeated=await call(`/api/lab/exams/${draft.id}/submit`,{confirmed:true});assert.deepEqual(repeated.body.exam.results,response.body.exam.results);
      assert.equal((await call(`/api/lab/exams/${draft.id}/answers`,{questionIndex:0,optionIndex:0,expectedRevision:0})).status,409);assert.equal(calls,3);
    });
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
});
