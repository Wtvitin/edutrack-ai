import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase} from '../server/database.mjs';
import {createStudyLab,buildQuizRequest} from '../server/study-lab.mjs';
import {quizConfigSchema,validateQuizDocument} from '../lib/lab-schemas.mjs';
import {labConfig,labDocument} from './fixtures/lab.mjs';

test('quiz contract rejects ambiguity, invalid keys, duplicate alternatives and unsupported references',async t=>{
  const config=labConfig();
  await t.test('all counts, alternative counts and difficulty modes are accepted',()=>{
    for(const count of [5,10,15,20])for(const alternatives of [4,5])for(const difficulty of ['easy','medium','hard','mixed']){
      const settings=labConfig({count,alternatives,difficulty});assert.ok(quizConfigSchema.safeParse(settings).success);assert.ok(validateQuizDocument(labDocument(settings),settings).success);
    }
  });
  await t.test('limits and forged identity/key fields are rejected',()=>{
    for(const delta of [{count:21},{count:7},{alternatives:3},{sourceText:'a'.repeat(12001)},{topic:'a'.repeat(161)},{userId:randomUUID()},{correctIndex:1},{subjectId:null,topic:'',sourceText:''}])assert.equal(quizConfigSchema.safeParse({...config,...delta}).success,false);
  });
  await t.test('exact count, unique questions/options and correctIndex match the explanation',()=>{
    for(const modify of [d=>d.questions.pop(),d=>d.questions.push(d.questions[0]),d=>{d.questions[0].options[1]='  ３ ';},d=>{d.questions[0].correctIndex=4;},d=>{d.questions[0].explanation.answer='999';},d=>{d.questions[1].prompt=d.questions[0].prompt;},d=>{d.questions[0].options.push('Outra');}]){
      const document=labDocument(config);modify(document);assert.equal(validateQuizDocument(document,config).success,false);
    }
  });
  await t.test('material provenance must be literal; extra content is explicitly marked',()=>{
    const settings=labConfig({sourceText:'A adição de números naturais reúne duas quantidades.'});
    const document=labDocument(settings);assert.ok(validateQuizDocument(document,settings).success);
    document.questions[0].sourceQuote='Uma citação que não existe.';assert.equal(validateQuizDocument(document,settings).success,false);
    document.questions[0].sourceQuote='';document.questions[0].grounding='extra';assert.ok(validateQuizDocument(document,settings).success);
    document.questions[0].grounding='general';assert.equal(validateQuizDocument(document,settings).success,false);
  });
  await t.test('prompts minimize context and never expose Tools, other subjects or private history',()=>{
    const request=buildQuizRequest(config,{name:'Matemática',description:'Adição',user_id:'private',privateField:'private'});
    assert.deepEqual(request.tools,[]);assert.equal(request.responseFormat.name,'study_quiz_v1');
    assert.doesNotMatch(JSON.stringify(request),/privateField|user_id/);assert.match(request.messages[0].content,/não confiável/);
  });
});

async function fixture(){
  const db=await openDatabase({url:'',directory:'memory://'});
  const a=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('A','lab-a@example.test','mock',now()) RETURNING *")).rows[0];
  const b=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('B','lab-b@example.test','mock',now()) RETURNING *")).rows[0];
  const subject=(await db.query("INSERT INTO subjects(user_id,name,updated_at) VALUES($1,'Matemática',now()) RETURNING *",[a.id])).rows[0];
  const state={calls:0,document:null,failure:null,toolCalls:null,gate:null};
  const provider={async complete(request){state.calls++;if(state.gate)await state.gate;if(state.failure)throw state.failure;
    const settings=JSON.parse(request.messages[1].content);const instruction=request.messages[0].content;
    const config=labConfig({count:Number(instruction.match(/exatamente (\d+)/)[1]),alternatives:Number(instruction.match(/com (\d+) alternativas/)[1]),difficulty:instruction.match(/Dificuldade: (\w+)/)[1],sourceText:settings.studyMaterial});
    return {model:'mock',content:state.document??JSON.stringify(labDocument(config)),toolCalls:state.toolCalls};
  }};
  const service=()=>createStudyLab(db,{provider,providerName:'google-gemini',model:'fixture'});
  return {db,a,b,subject,state,service,lab:service()};
}
test('laboratory persistence, isolation, concurrency and deterministic grading',async t=>{
  const f=await fixture(),{db,a,b,subject,lab,state}=f;
  const config=labConfig({subjectId:subject.id});let quiz;
  try{
    await t.test('generation persists but hides the key and follows subject ownership',async()=>{
      quiz=await lab.generate(a,config);assert.equal(quiz.questions.length,5);assert.equal(state.calls,1);
      assert.equal(quiz.subjectName,subject.name);assert.equal(quiz.questions[0].correctIndex,undefined);
      assert.equal(quiz.questions[0].explanation,undefined);assert.equal(quiz.questions[0].isCorrect,undefined);
      await assert.rejects(lab.generate(b,labConfig({subjectId:subject.id})),e=>e.status===403);assert.equal(state.calls,1);
    });
    await t.test('idempotency survives new service instances without another generation',async()=>{
      assert.equal((await f.service().generate(a,config)).id,quiz.id);assert.equal(state.calls,1);
      await assert.rejects(lab.generate(a,{...config,topic:'Outra configuração'}),e=>e.status===409);assert.equal(state.calls,1);
    });
    await t.test('ownership applies to read, answers, finish and overview',async()=>{
      for(const operation of [()=>lab.detail(b,quiz.id),()=>lab.answer(b,quiz.id,{questionIndex:0,optionIndex:0}),()=>lab.finish(b,quiz.id,{})])await assert.rejects(operation,e=>e.status===404);
      assert.equal((await lab.overview(b)).activities.length,0);
      await assert.rejects(db.query('INSERT INTO learning_answers(activity_id,user_id,question_index,option_index,is_correct) VALUES($1,$2,0,0,true)',[quiz.id,b.id]),/foreign key/);
    });
    await t.test('answers persist, cannot forge grading and end correction stays hidden in all endpoints',async()=>{
      await assert.rejects(lab.answer(a,quiz.id,{questionIndex:0,optionIndex:0,isCorrect:true}),e=>e.status===400);
      const next=await lab.answer(a,quiz.id,{questionIndex:0,optionIndex:1});assert.equal(next.answered,1);assert.equal(next.questions[0].isCorrect,undefined);
      const restored=await f.service().detail(a,quiz.id);assert.equal(restored.questions[0].selectedIndex,1);
      const overview=await lab.overview(a);assert.equal(overview.summary.answered,1);assert.equal(overview.summary.accuracy,0);assert.equal(overview.summary.difficulties.length,0);
      assert.doesNotMatch(JSON.stringify(overview),/correctIndex|source_text|questions_json/);
    });
    await t.test('concurrent duplicate answers are idempotent, conflicting answers are rejected',async()=>{
      const responses=await Promise.all([lab.answer(a,quiz.id,{questionIndex:1,optionIndex:0}),lab.answer(a,quiz.id,{questionIndex:1,optionIndex:0})]);
      assert.ok(responses.every(r=>r.answered===2));
      await assert.rejects(lab.answer(a,quiz.id,{questionIndex:1,optionIndex:2}),e=>e.status===409);
      assert.equal((await db.query('SELECT count(*) AS n FROM learning_answers WHERE activity_id=$1',[quiz.id])).rows[0].n,2);
    });
    await t.test('invalid options and early completion do not mutate answers',async()=>{
      await assert.rejects(lab.answer(a,quiz.id,{questionIndex:2,optionIndex:4}),e=>e.status===400);
      await assert.rejects(lab.finish(a,quiz.id,{}),e=>e.code==='lab-incomplete');assert.equal((await lab.detail(a,quiz.id)).answered,2);
    });
    await t.test('completion is atomic and repeatable with score, duration and statistics calculated by server',async()=>{
      for(let i=2;i<5;i++)await lab.answer(a,quiz.id,{questionIndex:i,optionIndex:0});
      const [first,second]=await Promise.all([lab.finish(a,quiz.id,{}),lab.finish(a,quiz.id,{})]);
      assert.equal(first.score,4);assert.equal(second.completedAt,first.completedAt);assert.equal(first.accuracy,80);assert.ok(first.durationSeconds>=0);
      assert.ok(first.questions.every(q=>q.explanation&&q.correctIndex===0));
      const {summary}=await lab.overview(a);assert.equal(summary.completed,1);assert.equal(summary.answered,5);assert.equal(summary.accuracy,80);assert.equal(summary.bySubject[0].points[0].accuracy,80);assert.equal(summary.difficulties[0].errors,1);
      await assert.rejects(lab.finish(a,quiz.id,{score:5}),e=>e.status===400);
    });
    await t.test('immediate feedback reveals only the answered question',async()=>{
      const next=await lab.generate(a,labConfig({correction:'immediate'}));
      const answer=await lab.answer(a,next.id,{questionIndex:0,optionIndex:0});assert.equal(answer.questions[0].isCorrect,true);assert.equal(answer.questions[1].correctIndex,undefined);
    });
    await t.test('concurrent generation executes the provider once and recovers through the request ID',async()=>{
      let release;state.gate=new Promise(resolve=>{release=resolve;});const request=labConfig();const before=state.calls;
      const first=lab.generate(a,request);while(state.calls===before)await new Promise(resolve=>setTimeout(resolve,5));
      try{
        const recovered=await lab.generate(a,request);assert.equal(recovered.status,'generating');
        await assert.rejects(lab.generate(a,labConfig()),e=>e.code==='lab-generation-pending');
      }finally{release();state.gate=null;}
      const ready=await first;assert.equal(state.calls,before+1);assert.equal((await lab.generate(a,request)).id,ready.id);
    });
    await t.test('deleting a subject preserves quiz history and its name, without touching other records',async()=>{
      await db.query('DELETE FROM subjects WHERE id=$1',[subject.id]);
      const restored=await lab.detail(a,quiz.id);assert.equal(restored.subjectId,null);assert.equal(restored.subjectName,'Matemática');assert.equal(restored.score,4);
      assert.equal((await db.query('SELECT count(*) AS n FROM study_sessions')).rows[0].n,0);assert.equal((await db.query('SELECT count(*) AS n FROM academic_tasks')).rows[0].n,0);
    });
  }finally{await db.close();}
});

test('generation failures, paid-call limits and additive migration integrity on a disposable database',async t=>{
  const f=await fixture(),{db,a,b,lab,state}=f;
  try{
    await t.test('invalid/incomplete JSON is rejected once and failed requests never regenerate implicitly',async()=>{
      state.document='{"questions":[';const config=labConfig();
      await assert.rejects(lab.generate(a,config),e=>e.code==='lab-invalid-generation');const calls=state.calls;
      const failed=await lab.generate(a,config);assert.equal(failed.status,'failed');assert.equal(state.calls,calls);assert.equal(failed.questions.length,0);state.document=null;
    });
    await t.test('tool requests are rejected without academic side effects',async()=>{
      state.toolCalls=[{name:'create_task',arguments:{title:'forged'}}];await assert.rejects(lab.generate(a,labConfig()),e=>e.code==='lab-invalid-generation');
      assert.equal((await db.query('SELECT count(*) AS n FROM academic_tasks')).rows[0].n,0);state.toolCalls=null;
    });
    await t.test('provider safety/quota errors are distinguished and sanitized',async()=>{
      for(const [code,status] of [['provider-safety-blocked',503],['provider-quota-exhausted',429]]){
        state.failure=Object.assign(new Error('SECRET provider payload'),{code,status});
        await assert.rejects(lab.generate(a,labConfig()),e=>e.code===code&&!e.message.includes('SECRET'));
      }state.failure=null;
    });
    await t.test('persistent per-user quotas include failures and do not call provider when exhausted',async()=>{
      const before=state.calls;await assert.rejects(f.service().generate(a,labConfig()),e=>e.status===429&&e.code==='lab-rate-limit');assert.equal(state.calls,before);
      assert.equal((await lab.generate(b,labConfig())).status,'ready');
    });
    await t.test('stale generation is marked interrupted on recovery without repeating a call',async()=>{
      const config=labConfig();const request=await lab.generate(b,config);const before=state.calls;
      await db.query("UPDATE learning_activities SET status='generating',questions_json=NULL,created_at=now()-interval '4 minutes' WHERE id=$1",[request.id]);
      const stale=await lab.detail(b,request.id);assert.equal(stale.status,'failed');assert.equal(stale.errorCode,'lab-generation-interrupted');assert.equal(state.calls,before);
    });
    await t.test('incremental migrations preserve prior assessments and legacy rollback remains manual',async()=>{
      const before=Number((await db.query('SELECT count(*) AS n FROM learning_activities')).rows[0].n);
      const rollback=await readFile(new URL('../database/rollback/009_study_lab.sql',import.meta.url),'utf8');assert.match(rollback,/MANUAL ONLY/);
      for(const name of ['009_study_lab.sql','010_lab_assisted.sql','011_study_exams.sql','012_flashcards.sql'])assert.equal((await db.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rows.length,1);
      const foreignKeys=(await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='flashcard_decks'::regclass AND contype='f'")).rows;
      assert.ok(foreignKeys.some(k=>k.definition.includes('learning_activities(user_id, id)')));
      assert.equal((await db.query('SELECT count(*) AS n FROM users')).rows[0].n,2);
      assert.ok(before>0);assert.equal(Number((await db.query('SELECT count(*) AS n FROM learning_activities')).rows[0].n),before);
    });}finally{await db.close();}
});
