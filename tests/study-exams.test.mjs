import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createStudyLab} from '../server/study-lab.mjs';
import {gradeExam,suggestExamSubject} from '../server/lab-exams.mjs';
import {createAgentToolRegistry} from '../server/agent-tools.mjs';
import {chatWithAgent} from '../server/agent-orchestrator.mjs';
import {readAgentConfig} from '../server/agent-config.mjs';
import {difficultyDistribution,examGenerateSchema} from '../lib/exam-schemas.mjs';
import {labFixtureProvider,labConfig} from './fixtures/lab.mjs';

async function fixture(){
  const db=await openDatabase({url:'',directory:'memory://'}),raw=labFixtureProvider();
  const user=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('Exam','exam@example.test','mock',now()) RETURNING id")).rows[0];
  const other=(await db.query("INSERT INTO users(name,email,password_hash,updated_at) VALUES('Other','other-exam@example.test','mock',now()) RETURNING id")).rows[0];
  const sql=(await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'Banco de Dados','SQL: SELECT, JOIN, GROUP BY e HAVING',now()) RETURNING id",[user.id])).rows[0];
  const math=(await db.query("INSERT INTO subjects(user_id,name,updated_at) VALUES($1,'Matemática',now()) RETURNING id",[user.id])).rows[0];
  const foreign=(await db.query("INSERT INTO subjects(user_id,name,description,updated_at) VALUES($1,'Disciplina privada','SECRET-ALIEN',now()) RETURNING id",[other.id])).rows[0];
  await db.query("INSERT INTO academic_tasks(user_id,subject_id,title,description,updated_at) VALUES($1,$2,'Revisar SQL','Consultar JOIN e agregações',now())",[user.id,sql.id]);
  const state={calls:[],invalidBatch:0,duplicateBatch:0,gate:null};
  const provider={async complete(request){state.calls.push(request);if(state.gate){const gate=state.gate;state.gate=null;await gate;}
    const output=await raw.complete(request);if(request.responseFormat?.name==='study_exam_batch_v1'){
      const batch=JSON.parse(request.messages[1].content).batch,doc=JSON.parse(output.content);
      if(batch===state.invalidBatch)doc.questions.pop();
      if(batch===state.duplicateBatch)doc.questions[0].prompt=JSON.parse(request.messages[1].content).previousPrompts[0];
      output.content=JSON.stringify(doc);
    }return output;
  }};
  const lab=createStudyLab(db,{provider,providerName:'google-gemini',model:'mock',draw:()=>0});
  const settings=draft=>({subjectId:draft.subjectId,topic:draft.topic,count:draft.count,difficulty:draft.difficulty,durationMinutes:draft.exam.durationMinutes,reviewEnabled:draft.exam.reviewEnabled,alternatives:draft.alternatives});
  async function prepare(){return lab.prepareExam(user,{requestId:randomUUID(),prompt:'Prepare um simulado sobre a matéria que mais preciso revisar.'});}
  return {db,user,other,sql,math,foreign,state,lab,provider,settings,prepare};
}
test('exam distribution and grading distinguish errors from unanswered questions',()=>{
  assert.deepEqual(difficultyDistribution(30),{easy:10,medium:10,hard:10});
  assert.deepEqual(difficultyDistribution(10,'hard'),{easy:0,medium:0,hard:10});
  assert.equal(examGenerateSchema.safeParse({confirmed:false,settings:{}}).success,false);
  const questions=Array.from({length:30},(_,i)=>({correctIndex:i%4,concept:i<15?'JOIN':'SELECT'}));
  const answers=[{question_index:0,option_index:0},{question_index:1,option_index:1},{question_index:2,option_index:0}];
  const result=gradeExam(questions,answers,{startedAt:'2026-01-01T10:00:00Z',submittedAt:'2026-01-01T10:02:00Z'});
  assert.equal(result.total,30);assert.equal(result.correct,2);assert.equal(result.wrong,1);assert.equal(result.unanswered,27);assert.equal(result.grade,0.67);assert.equal(result.accuracy,6.7);assert.equal(result.durationSeconds,120);
  assert.equal(result.byConcept[0].unanswered,12);assert.equal(result.byConcept[1].unanswered,15);
});
test('simulated exam lifecycle shares persistence, access control and analysis with the laboratory',async t=>{
  const f=await fixture(),{db,user,other,sql,math,foreign,lab,state}=f;let draft,ready,submitted;
  try{
    await t.test('automatic selection explains pending activities without pretending to have performance history',async()=>{
      const suggestion=await suggestExamSubject(db,user,'Matéria que mais preciso revisar');assert.equal(suggestion.subjectId,sql.id);assert.match(suggestion.reason,/1 atividades pendentes/);
      await assert.rejects(suggestExamSubject(db,user,'SQL',foreign.id),e=>e.status===403);
    });
    await t.test('defaults prepare 30 mixed questions, unlimited time and review without any generation call',async()=>{
      draft=await f.prepare();assert.equal(draft.mode,'exam');assert.equal(draft.status,'draft');assert.equal(draft.count,30);assert.equal(draft.difficulty,'mixed');assert.equal(draft.correction,'end');
      assert.equal(draft.exam.durationMinutes,0);assert.equal(draft.exam.reviewEnabled,true);assert.equal(draft.questions.length,0);assert.equal(state.calls.length,0);
      await assert.rejects(lab.generateExam(user,draft.id,{settings:f.settings(draft)}),e=>e.status===400);assert.equal(state.calls.length,0);
      await assert.rejects(lab.generatePrepared(user,draft.id,{}),e=>e.code==='exam-confirmation-required');assert.equal(state.calls.length,0);
    });
    await t.test('generation requires confirmation, validates three batches and preserves balanced difficulty',async()=>{
      ready=await lab.generateExam(user,draft.id,{confirmed:true,settings:f.settings(draft)});
      assert.equal(state.calls.length,3);assert.equal(ready.questions.length,30);assert.equal(ready.exam.expiresAt,null);assert.ok(ready.startedAt);
      const distribution={easy:0,medium:0,hard:0};for(const q of ready.questions){distribution[q.difficulty]++;assert.equal(q.concept,undefined);assert.equal(q.correctIndex,undefined);assert.equal(q.explanation,undefined);assert.equal(q.isCorrect,undefined);}
      assert.ok((await db.query('SELECT questions_json FROM learning_activities WHERE id=$1',[ready.id])).rows[0].questions_json.questions.every(q=>q.concept));
      assert.deepEqual(distribution,{easy:10,medium:10,hard:10});assert.equal(new Set(ready.questions.map(q=>q.prompt)).size,30);
      for(const call of state.calls){assert.deepEqual(call.tools,[]);assert.doesNotMatch(call.messages[1].content,/SECRET-ALIEN|other-exam/);}
    });
    await t.test('repeated generation is idempotent and cannot change the confirmed configuration',async()=>{
      const again=await lab.generateExam(user,draft.id,{confirmed:true,settings:f.settings(draft)});assert.equal(again.id,ready.id);assert.equal(state.calls.length,3);
      await assert.rejects(lab.generateExam(user,draft.id,{confirmed:true,settings:{...f.settings(draft),count:10}}),e=>e.code==='exam-config-locked');
    });
    await t.test('ownership is enforced for reads, answers, marks and submission',async()=>{
      for(const operation of [()=>lab.detail(other,ready.id),()=>lab.answerExam(other,ready.id,{questionIndex:0,optionIndex:0,expectedRevision:0}),()=>lab.markExam(other,ready.id,{questionIndex:0,flagged:true,expectedRevision:0}),()=>lab.submitExam(other,ready.id,{confirmed:true})])await assert.rejects(operation,e=>e.status===404);
      await assert.rejects(lab.answer(user,ready.id,{questionIndex:0,optionIndex:0}),e=>e.code==='exam-operation-required');
      await assert.rejects(lab.finish(user,ready.id,{}),e=>e.code==='exam-operation-required');
    });
    await t.test('answers persist and can change before submission without exposing correction',async()=>{
      const first=await lab.answerExam(user,ready.id,{questionIndex:0,optionIndex:0,expectedRevision:0});assert.equal(first.questions[0].revision,1);assert.equal(first.questions[0].correctIndex,undefined);
      const changed=await lab.answerExam(user,ready.id,{questionIndex:0,optionIndex:3,expectedRevision:1});assert.equal(changed.questions[0].revision,2);assert.equal(changed.questions[0].selectedIndex,3);assert.equal(changed.questions[0].isCorrect,undefined);
      const restored=await lab.detail(user,ready.id);assert.equal(restored.questions[0].selectedIndex,3);assert.equal(restored.questions[0].revision,2);
      await assert.rejects(lab.answerExam(user,ready.id,{questionIndex:0,optionIndex:2,expectedRevision:1}),e=>e.code==='exam-answer-conflict');
      await assert.rejects(lab.answerExam(user,ready.id,{questionIndex:0,optionIndex:3,expectedRevision:2,isCorrect:true}),e=>e.status===400);
    });
    await t.test('concurrent duplicate responses create one record, and conflicting writes are protected',async()=>{
      await Promise.all([lab.answerExam(user,ready.id,{questionIndex:1,optionIndex:3,expectedRevision:0}),lab.answerExam(user,ready.id,{questionIndex:1,optionIndex:3,expectedRevision:0})]);
      const conflicts=await Promise.allSettled([lab.answerExam(user,ready.id,{questionIndex:2,optionIndex:0,expectedRevision:0}),lab.answerExam(user,ready.id,{questionIndex:2,optionIndex:1,expectedRevision:0})]);
      assert.equal(conflicts.filter(r=>r.status==='fulfilled').length,1);assert.equal(conflicts.filter(r=>r.status==='rejected').length,1);
      assert.equal((await db.query('SELECT count(*) AS n FROM learning_answers WHERE activity_id=$1',[ready.id])).rows[0].n,3);
    });
    await t.test('review flags persist independently of answers and use optimistic concurrency',async()=>{
      const marked=await lab.markExam(user,ready.id,{questionIndex:29,flagged:true,expectedRevision:0});assert.deepEqual(marked.exam.reviewMarks,[29]);assert.equal(marked.exam.markRevision,1);
      assert.equal((await lab.markExam(user,ready.id,{questionIndex:29,flagged:true,expectedRevision:0})).exam.markRevision,1);
      await assert.rejects(lab.markExam(user,ready.id,{questionIndex:3,flagged:true,expectedRevision:0}),e=>e.code==='exam-mark-conflict');
      const unmarked=await lab.markExam(user,ready.id,{questionIndex:29,flagged:false,expectedRevision:1});assert.deepEqual(unmarked.exam.reviewMarks,[]);
      assert.equal((await lab.detail(user,ready.id)).answered,3);
    });
    await t.test('explicit submission allows pending questions and deterministically grades all 30',async()=>{
      await assert.rejects(lab.submitExam(user,ready.id,{}),e=>e.status===400);
      await assert.rejects(lab.submitExam(user,ready.id,{confirmed:true,score:30}),e=>e.status===400);
      submitted=await lab.submitExam(user,ready.id,{confirmed:true});const result=submitted.exam.results;
      assert.equal(result.total,30);assert.equal(result.answered,3);assert.equal(result.unanswered,27);assert.equal(result.correct+result.wrong,3);assert.equal(result.grade,Math.round(result.correct/30*1000)/100);
      assert.equal(submitted.questions[29].selectedIndex,null);assert.equal(submitted.questions[29].isCorrect,null);assert.ok(submitted.questions.every(q=>q.explanation&&q.correctIndex!==undefined));
      assert.ok(submitted.durationSeconds>=0);assert.equal(submitted.score,result.correct);assert.equal(result.byConcept.reduce((n,s)=>n+s.total,0),30);
    });
    await t.test('finalization is idempotent under concurrency and locks answers and flags',async()=>{
      const results=await Promise.all([lab.submitExam(user,ready.id,{confirmed:true}),lab.submitExam(user,ready.id,{confirmed:true})]);
      for(const result of results){assert.equal(result.completedAt,submitted.completedAt);assert.deepEqual(result.exam.results,submitted.exam.results);}
      await assert.rejects(lab.answerExam(user,ready.id,{questionIndex:0,optionIndex:3,expectedRevision:2}),e=>e.code==='exam-state');
      await assert.rejects(lab.markExam(user,ready.id,{questionIndex:0,flagged:true,expectedRevision:2}),e=>e.code==='exam-state');
      const overview=await lab.overview(user);assert.equal(overview.summary.accuracy,submitted.exam.results.accuracy);assert.equal(overview.summary.bySubject[0].total,30);
    });
    await t.test('AI feedback can use omissions but never changes score or result',async()=>{
      const reviewed=await lab.review(user,ready.id,{});assert.equal(reviewed.review.state,'ready');assert.deepEqual(reviewed.exam.results,submitted.exam.results);
      const analysis=state.calls.at(-1);assert.equal(analysis.responseFormat.name,'study_review_v1');assert.equal(JSON.parse(analysis.messages[1].content).evidence.length,30);
      assert.ok(JSON.parse(analysis.messages[1].content).evidence.some(e=>e.answered===false));
    });
    await t.test('automatic suggestion uses completed performance while keeping explicit subject choice',async()=>{
      const selection=await suggestExamSubject(db,user,'Matéria que mais preciso revisar');assert.equal(selection.subjectId,sql.id);assert.match(selection.reason,/questões ficaram sem acerto/);
      assert.equal((await suggestExamSubject(db,user,'SQL',math.id)).subjectId,math.id);
    });
    await t.test('agent can only prepare and audit a draft, never generate or submit a proof',async()=>{
      const registry=createAgentToolRegistry({prepareExam:(user,input)=>lab.prepareExam(user,input)}),before=state.calls.length;
      const reply=await chatWithAgent({db,user,message:'Prepare um simulado de 30 questões sobre a matéria que mais preciso revisar.',config:readAgentConfig({}),provider:f.provider,tools:registry});
      assert.equal(reply.response.action,'prepare_study_exam');const id=reply.response.result.id;assert.equal((await lab.detail(user,id)).status,'draft');assert.equal(state.calls.length,before+2);
      assert.equal(registry.has('submit_exam'),false);assert.equal(registry.has('answer_exam'),false);assert.equal(registry.has('generate_exam'),false);
    });
  }finally{await db.close();}
});
test('exam batching fails safely, custom configuration and timed boundaries remain server-controlled',async t=>{
  const f=await fixture(),{db,user,lab,state}=f;
  try{
    await t.test('a failed second batch never publishes a partial proof or repeats automatically',async()=>{
      const draft=await f.prepare();state.invalidBatch=2;await assert.rejects(lab.generateExam(user,draft.id,{confirmed:true,settings:f.settings(draft)}),e=>e.code==='lab-invalid-generation');
      assert.equal(state.calls.length,2);const restored=await lab.detail(user,draft.id);assert.equal(restored.status,'failed');assert.equal(restored.questions.length,0);
      await lab.generateExam(user,draft.id,{confirmed:true,settings:f.settings(draft)});assert.equal(state.calls.length,2);state.invalidBatch=0;
    });
    await t.test('literal duplicates across batches are refused before publication',async()=>{
      const draft=await f.prepare();state.duplicateBatch=2;await assert.rejects(lab.generateExam(user,draft.id,{confirmed:true,settings:f.settings(draft)}),e=>e.code==='lab-invalid-generation');assert.equal((await lab.detail(user,draft.id)).questions.length,0);state.duplicateBatch=0;
    });
    await t.test('concurrent confirmation calls reserve one generation and allow customizing before start',async()=>{
      const draft=await f.prepare(),settings={...f.settings(draft),count:10,difficulty:'hard',durationMinutes:15,reviewEnabled:false,alternatives:5};let release;
      const before=state.calls.length;state.gate=new Promise(resolve=>{release=resolve;});const first=lab.generateExam(user,draft.id,{confirmed:true,settings});
      while(state.calls.length===before)await new Promise(resolve=>setTimeout(resolve,5));
      try{assert.equal((await lab.generateExam(user,draft.id,{confirmed:true,settings})).status,'generating');}finally{release();}
      const ready=await first;assert.equal(state.calls.length,before+1);assert.equal(ready.questions.length,10);assert.ok(ready.questions.every(q=>q.difficulty==='hard'&&q.options.length===5));assert.ok(ready.exam.expiresAt);
      await assert.rejects(lab.markExam(user,draft.id,{questionIndex:0,flagged:true,expectedRevision:0}),e=>e.code==='exam-mark-disabled');
      await lab.answerExam(user,draft.id,{questionIndex:0,optionIndex:0,expectedRevision:0});
      await db.query("UPDATE learning_activities SET started_at=now()-interval '20 minutes',expires_at=now()-interval '5 minutes' WHERE id=$1",[draft.id]);
      await assert.rejects(lab.answerExam(user,draft.id,{questionIndex:1,optionIndex:0,expectedRevision:0}),e=>e.code==='exam-expired');
      const submitted=await lab.submitExam(user,draft.id,{confirmed:true});assert.equal(submitted.exam.results.durationSeconds,900);assert.equal(submitted.exam.results.unanswered,9);
    });
  }finally{await db.close();}
});
