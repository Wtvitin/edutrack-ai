import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createStudyLab} from '../server/study-lab.mjs';
import {collectLabContext,shuffleQuiz} from '../server/lab-assisted.mjs';
import {createAgentToolRegistry} from '../server/agent-tools.mjs';
import {chatWithAgent} from '../server/agent-orchestrator.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {labConfig,labDocument,labFixtureProvider} from './fixtures/lab.mjs';

async function fixture(){
  const db=await openDatabase({url:'',directory:'memory://'});
  const a=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('A','assisted-a@example.test','fixture',now()) RETURNING id")).rows[0];
  const b=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('B','assisted-b@example.test','fixture',now()) RETURNING id")).rows[0];
  const subject=(await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'Banco de Dados','SQL, JOIN e GROUP BY',now()) RETURNING id",[a.id])).rows[0];
  await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'História','Fontes e períodos',now())",[a.id]);
  const foreign=(await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'SQL privado','SECRET-ALIEN',now()) RETURNING id",[b.id])).rows[0];
  await db.query("INSERT INTO academic_tasks(user_id,subject_id,title,description,updated_at) VALUES($1,$2,'SQL: consultas com JOIN','Pratique filtros e agrupamentos.',now())",[a.id,subject.id]);
  await db.query("INSERT INTO academic_tasks(user_id,subject_id,title,description,updated_at) VALUES($1,$2,'SECRET-ALIEN-TASK','Não compartilhar',now())",[b.id,foreign.id]);
  const raw=labFixtureProvider(),state={calls:[],badSubject:false,badReview:false,failure:null,reviewGate:null};
  const provider={async complete(request){state.calls.push(request);if(state.reviewGate&&request.responseFormat?.name==='study_review_v1'){const gate=state.reviewGate;state.reviewGate=null;await gate;}if(state.failure)throw state.failure;const result=await raw.complete(request);
    if(state.badSubject&&request.responseFormat?.name==='study_quiz_assisted_v1'){const document=JSON.parse(result.content);document.subjectId=foreign.id;result.content=JSON.stringify(document);}
    if(state.badReview&&request.responseFormat?.name==='study_review_v1'){const document=JSON.parse(result.content);document.priorities=[{concept:'JOIN',observation:'Uma observação sem sustentação suficiente.',practice:'Pratique outro exemplo de relacionamento entre tabelas.',evidenceIds:[foreign.id+':0']}];result.content=JSON.stringify(document);}
    return result;
  }};
  const lab=createStudyLab(db,{provider,providerName:'google-gemini',model:'fixture',draw:()=>0});
  async function complete(user,id,oneWrong=true){
    const row=(await db.query('SELECT questions_json FROM learning_activities WHERE id=$1 AND user_id=$2',[id,user.id])).rows[0];
    for(const [index,q]of row.questions_json.questions.entries())await lab.answer(user,id,{questionIndex:index,optionIndex:oneWrong&&index===0?(q.correctIndex+1)%q.options.length:q.correctIndex});
    return lab.finish(user,id,{});
  }
  return {db,a,b,subject,foreign,lab,provider,state,complete};
}

test('assisted quiz collects authorized context, randomizes the exam and caches evidence-based reviews',async t=>{
  const f=await fixture(),{db,a,b,subject,foreign,lab,state}=f;let draft,ready;
  const input={requestId:randomUUID(),prompt:'Monte um quiz SQL com base na minha matéria e atividades.'};
  try{
    await t.test('context ranks matching tasks and never includes another account',async()=>{
      const context=await collectLabContext(db,a,input.prompt);assert.equal(context[0].id,subject.id);assert.match(JSON.stringify(context),/consultas com JOIN/);assert.doesNotMatch(JSON.stringify(context),/SECRET-ALIEN|example.test/);
      await assert.rejects(collectLabContext(db,a,input.prompt,foreign.id),e=>e.status===403);
    });
    await t.test('preparation fills all settings without an AI call and persists a recoverable draft',async()=>{
      draft=await lab.prepare(a,input);assert.equal(draft.status,'draft');assert.equal(draft.count,5);assert.equal(draft.alternatives,4);assert.equal(draft.correction,'immediate');assert.equal(draft.automatic,true);assert.equal(state.calls.length,0);
      assert.equal((await lab.prepare(a,input)).id,draft.id);assert.equal((await lab.detail(a,draft.id)).status,'draft');
      await assert.rejects(lab.prepare(a,{...input,prompt:'Outro pedido'}),e=>e.status===409);
      await assert.rejects(lab.prepare(a,{...input,count:20}),e=>e.status===400);
    });
    await t.test('another user cannot generate the draft and concurrent recovery does not repeat AI calls',async()=>{
      await assert.rejects(lab.generatePrepared(b,draft.id,{}),e=>e.status===404);
      await Promise.all([lab.generatePrepared(a,draft.id,{}),lab.generatePrepared(a,draft.id,{})]);ready=await lab.detail(a,draft.id);
      assert.equal(ready.status,'ready');assert.equal(ready.subjectId,subject.id);assert.equal(state.calls.length,1);assert.deepEqual(state.calls[0].tools,[]);
      const schema=state.calls[0].responseFormat.schema;assert.equal(schema.properties.questions.minItems,5);assert.equal(schema.properties.questions.maxItems,5);assert.equal(schema.properties.questions.items.properties.options.maxItems,4);assert.ok(schema.properties.subjectId.enum.includes(subject.id));assert.ok(!schema.properties.subjectId.enum.includes(foreign.id));
      assert.match(state.calls[0].messages[1].content,/Pratique filtros/);assert.doesNotMatch(state.calls[0].messages[1].content,/SECRET-ALIEN/);
    });
    await t.test('shuffle preserves answer/explanation consistency while hiding unanswered keys',async()=>{
      const before=(await db.query('SELECT questions_json FROM learning_activities WHERE id=$1',[draft.id])).rows[0].questions_json;
      for(const q of before.questions){assert.equal(q.options[q.correctIndex],q.explanation.answer);assert.notEqual(q.correctIndex,0);}
      assert.ok(ready.questions.every(q=>q.correctIndex===undefined));await lab.generatePrepared(a,draft.id,{});assert.equal(state.calls.length,1);
      assert.deepEqual((await db.query('SELECT questions_json FROM learning_activities WHERE id=$1',[draft.id])).rows[0].questions_json,before);
    });
    await t.test('selection produces immediate red/green feedback and immutable answers',async()=>{
      const wrong=await lab.answer(a,draft.id,{questionIndex:0,optionIndex:0});assert.equal(wrong.questions[0].isCorrect,false);assert.equal(wrong.questions[0].correctIndex,3);
      assert.equal(wrong.questions[1].correctIndex,undefined);await assert.rejects(lab.answer(a,draft.id,{questionIndex:0,optionIndex:3}),e=>e.status===409);
      for(let index=1;index<5;index++)await lab.answer(a,draft.id,{questionIndex:index,optionIndex:3});
      const completed=await lab.finish(a,draft.id,{});assert.equal(completed.score,4);assert.equal(completed.accuracy,80);
      const overview=await lab.overview(a);assert.equal(overview.summary.difficulties.length,1);assert.equal(overview.summary.difficulties[0].topic,ready.questions[0].concept);
    });
    await t.test('analysis uses completed evidence only, is idempotent and has auditable references',async()=>{
      const before=state.calls.length;await Promise.all([lab.review(a,draft.id,{}),lab.review(a,draft.id,{})]);
      const reviewed=await lab.detail(a,draft.id);assert.equal(reviewed.review.state,'ready');assert.equal(state.calls.length,before+1);
      const analysis=state.calls.at(-1);assert.equal(analysis.responseFormat.name,'study_review_v1');assert.deepEqual(analysis.tools,[]);assert.doesNotMatch(analysis.messages[1].content,/SECRET-ALIEN|example.test/);
      const priority=reviewed.review.content.priorities[0];assert.equal(priority.concept,ready.questions[0].concept);assert.equal(priority.evidenceIds[0],draft.id+':0');
      await lab.review(a,draft.id,{});await lab.overview(a);assert.equal(state.calls.length,before+1);
      await assert.rejects(lab.review(b,draft.id,{}),e=>e.status===404);
      const saved=await lab.detail(a,draft.id);assert.equal(saved.score,4);assert.equal(saved.accuracy,80);
    });
    await t.test('agent Tool handoff is audited and prepares one quiz without changing academic tasks',async()=>{
      const tools=createAgentToolRegistry({prepareQuiz:(user,input)=>lab.prepare(user,input)}),before=state.calls.length;
      assert.equal(tools.has('prepare_study_quiz'),true);assert.equal(tools.validate('prepare_study_quiz',{prompt:'SQL',userId:b.id}).success,false);
      const config={...readAgentConfig({}),maxHistory:24};
      const response=await chatWithAgent({db,user:a,message:'Monte um quiz de SQL conforme minhas atividades',config,provider:f.provider,tools});
      assert.equal(response.response.action,'prepare_study_quiz');const id=response.response.result.id;
      assert.equal(response.response.result.destination,`/laboratorio?atividade=${id}`);assert.equal((await lab.detail(a,id)).status,'draft');
      assert.equal(state.calls.length,before+1);assert.equal((await db.query("SELECT count(*) AS n FROM ai_tool_executions WHERE user_id=$1 AND tool_name='prepare_study_quiz' AND status='SUCCESS'",[a.id])).rows[0].n,1);
      assert.equal((await db.query('SELECT count(*) AS n FROM academic_tasks WHERE user_id=$1',[a.id])).rows[0].n,1);
    });
    await t.test('server-selected settings cover larger exams without manual fields',async()=>{
      const other=createStudyLab(db,{provider:f.provider,draw:max=>max-1});const draft=await other.prepare(a,{requestId:randomUUID(),prompt:'Pratique SQL'});
      assert.equal(draft.count,20);assert.equal(draft.alternatives,5);
    });
  }finally{await db.close();}
});

test('assisted failures reject forged context/evidence and never silently regenerate',async t=>{
  const f=await fixture(),{a,b,db,lab,state}=f;let first,second;
  try{
    await t.test('foreign subject returned by the model cannot be persisted',async()=>{
      first=await lab.prepare(a,{requestId:randomUUID(),prompt:'Quiz de SQL'});state.badSubject=true;
      await assert.rejects(lab.generatePrepared(a,first.id,{}),e=>e.code==='lab-invalid-generation');const before=state.calls.length;
      assert.equal((await lab.generatePrepared(a,first.id,{})).status,'failed');assert.equal(state.calls.length,before);state.badSubject=false;
    });
    await t.test('invalid recommendations cannot publish fabricated evidence or change scores',async()=>{
      second=await lab.prepare(a,{requestId:randomUUID(),prompt:'Quiz SQL com JOIN'});await lab.generatePrepared(a,second.id,{});await f.complete(a,second.id);
      state.badReview=true;await assert.rejects(lab.review(a,second.id,{}),e=>e.code==='lab-invalid-generation');const before=state.calls.length;
      const failed=await lab.review(a,second.id,{});assert.equal(failed.review.state,'failed');assert.equal(failed.review.content,null);assert.equal(state.calls.length,before);assert.equal(failed.score,4);
      state.badReview=false;const recovered=await lab.review(a,second.id,{retry:true});assert.equal(recovered.review.state,'ready');assert.equal(recovered.review.attempts,2);
    });
    await t.test('analysis of an unfinished quiz is refused without exposing a key',async()=>{
      const draft=await lab.prepare(b,{requestId:randomUUID(),prompt:'Quiz SQL'});const before=state.calls.length;
      await assert.rejects(lab.review(b,draft.id,{}),e=>e.code==='lab-review-state');assert.equal(state.calls.length,before);
    });
    await t.test('all-correct evidence cannot support a fabricated weak point',async()=>{
      const draft=await lab.prepare(b,{requestId:randomUUID(),prompt:'Quiz de SQL'});await lab.generatePrepared(b,draft.id,{});await f.complete(b,draft.id,false);
      const reviewed=await lab.review(b,draft.id,{});assert.equal(reviewed.score,5);assert.deepEqual(reviewed.review.content.priorities,[]);
    });
    await t.test('late analysis cannot overwrite a newer retry after interrupted processing',async()=>{
      const draft=await lab.prepare(b,{requestId:randomUUID(),prompt:'Quiz SQL para revisão'});await lab.generatePrepared(b,draft.id,{});await f.complete(b,draft.id);
      let release;state.reviewGate=new Promise(resolve=>{release=resolve;});const before=state.calls.length,old=lab.review(b,draft.id,{});
      while(state.calls.length===before)await new Promise(resolve=>setTimeout(resolve,5));
      try{
        await db.query("UPDATE learning_activities SET review_started_at=now()-interval '4 minutes' WHERE id=$1",[draft.id]);
        assert.equal((await lab.review(b,draft.id,{})).review.state,'failed');
        const fresh=await lab.review(b,draft.id,{retry:true});assert.equal(fresh.review.attempts,2);
        await new Promise(resolve=>setTimeout(resolve,10));release();await old;
        assert.deepEqual((await lab.detail(b,draft.id)).review.content,fresh.review.content);
      }finally{release();}
    });
    await t.test('bounded shuffling never mutates an input document',()=>{
      const source=labDocument(labConfig()),snapshot=structuredClone(source);const shuffled=shuffleQuiz(source,()=>0);
      assert.deepEqual(source,snapshot);assert.equal(shuffled.questions.length,5);assert.ok(shuffled.questions.every(q=>q.explanation.answer===q.options[q.correctIndex]));
    });
  }finally{await db.close();}
});
