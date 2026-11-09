// Deterministic fixture only. Never imported by production modules.
import {randomUUID} from 'node:crypto';
export function labConfig(overrides={}){return {requestId:randomUUID(),subjectId:null,topic:'Adição',sourceText:'',count:5,difficulty:'mixed',alternatives:4,correction:'end',...overrides};}
export function labDocument(config){return {questions:Array.from({length:config.count},(_,i)=>{
  const answer=String(i+3),options=Array.from({length:config.alternatives},(_,j)=>String(i+3+j));
  return {prompt:`Quanto é ${i+1} + 2 na adição de números naturais?`,options,correctIndex:0,
    explanation:{answer,reason:`Somar duas unidades a ${i+1} resulta em ${answer}. A adição reúne as quantidades.`},
    difficulty:config.difficulty==='mixed'?['easy','medium','hard'][i%3]:config.difficulty,
    grounding:config.sourceText?'material':'general',sourceQuote:config.sourceText?config.sourceText.slice(0,100):'',
  };
})};}
export function labFixtureProvider(){return {async complete(request){
  if(request.responseFormat?.name==='study_flashcards_v1'){
    const count=Number(request.messages[0].content.match(/exatamente (\d+) cartões/)[1]);
    const cards=Array.from({length:count},(_,i)=>({front:'Como aplicar a cláusula SQL SELECT no cenário '+(i+1)+'?',back:'SELECT escolhe as colunas que serão retornadas por uma consulta SQL. Confira as condições e as tabelas do exemplo no seu material.',concept:'SELECT '+(i+1),grounding:JSON.parse(request.messages[1].content).material?'extra':'general',sourceQuote:''}));
    return {model:'fixture',content:JSON.stringify({cards})};
  }
  if(!request.responseFormat&&request.messages?.at(-1)?.role==='user'&&/flashcards|cartões/i.test(request.messages.at(-1).content))return {model:'fixture',content:null,toolCalls:[{id:'mock-flashcard-handoff',name:'prepare_study_flashcards',arguments:{prompt:request.messages.at(-1).content}}]};
  if(request.responseFormat?.name==='study_exam_batch_v1'){
    const context=JSON.parse(request.messages[1].content),instruction=request.messages[0].content;
    const output=await labFixtureProvider().complete({...request,responseFormat:{name:'study_quiz_assisted_v1'},messages:[request.messages[0],{role:'user',content:JSON.stringify({request:context.topic,candidates:context.discipline?[{id:'11111111-1111-4111-8111-111111111111',name:context.discipline.name}]:[]})}]});
    const document=JSON.parse(output.content),difficulty=instruction.match(/Dificuldade: (\w+)/)[1];
    document.questions.forEach((q,i)=>{q.prompt+=` Lote de prova ${context.batch}.`;q.difficulty=difficulty==='mixed'?['easy','medium','hard'][(i+(context.batch-1)*10)%3]:difficulty;});
    return {model:'fixture',content:JSON.stringify({questions:document.questions})};
  }
  if(request.responseFormat?.name==='study_review_v1'){
    const {evidence}=JSON.parse(request.messages[1].content),wrong=evidence.find(e=>!e.correct);
    return {model:'fixture',content:JSON.stringify({summary:'Seus quizzes mostram avanços e pontos específicos que merecem mais prática. Confira sempre os gabaritos com o material de estudo.',strengths:['Você está construindo uma rotina de prática e revisão.'],priorities:wrong?[{concept:wrong.concept,observation:'Foi observada uma resposta incorreta neste conceito nos quizzes analisados.',practice:'Reveja o exemplo do material e resolva dois exercícios semelhantes explicando cada passo.',evidenceIds:[wrong.id]}]:[]})};
  }
  if(request.responseFormat?.name==='agent_action_response_v1')return {model:'fixture',content:JSON.stringify({type:'action',action:request.messages.findLast(m=>m.role==='tool')?.name||'prepare_study_quiz',result:{}})};
  if(!request.responseFormat&&request.messages?.at(-1)?.role==='user'&&/simulado|prova/i.test(request.messages.at(-1).content))return {model:'fixture',content:null,toolCalls:[{id:'mock-exam-handoff',name:'prepare_study_exam',arguments:{prompt:request.messages.at(-1).content}}]};
  if(!request.responseFormat&&request.messages?.at(-1)?.role==='user'&&/quiz/i.test(request.messages.at(-1).content))return {model:'fixture',content:null,toolCalls:[{id:'mock-lab-handoff',name:'prepare_study_quiz',arguments:{prompt:request.messages.at(-1).content}}]};
  if(request.responseFormat?.name==='study_quiz_assisted_v1'){
    const instruction=request.messages[0].content,context=JSON.parse(request.messages[1].content),subject=context.candidates.find(s=>s.id===context.requiredSubjectId)||context.candidates[0];
    const config=labConfig({count:Number(instruction.match(/exatamente (\d+)/)[1]),alternatives:Number(instruction.match(/com (\d+) alternativas/)[1])});
    const samples=[['SELECT','Qual cláusula SQL escolhe as colunas retornadas por uma consulta?',['SELECT','WHERE','ORDER BY','GROUP BY','HAVING']],['WHERE','Qual cláusula filtra linhas antes de um agrupamento?',['WHERE','HAVING','ORDER BY','SELECT','LIMIT']],['JOIN','Qual operação relaciona linhas de tabelas distintas por uma condição?',['JOIN','DISTINCT','LIMIT','GROUP BY','ORDER BY']],['GROUP BY','Qual cláusula agrupa linhas antes de calcular agregações?',['GROUP BY','WHERE','ORDER BY','LIMIT','JOIN']],['HAVING','Qual cláusula filtra o resultado dos grupos de uma consulta?',['HAVING','WHERE','JOIN','LIMIT','SELECT']]];
    const questions=labDocument(config).questions.map((q,i)=>{const [concept,prompt,options]=samples[i%5];return {...q,concept,prompt:`${prompt} Considere o cenário ${i+1}.`,options:options.slice(0,config.alternatives),explanation:{answer:options[0],reason:`A cláusula ${options[0]} é a adequada para a operação descrita neste cenário de SQL.`},grounding:subject?'extra':'general',sourceQuote:''};});
    return {model:'fixture',content:JSON.stringify({subjectId:subject?.id||'',topic:'SQL aplicado às suas atividades',questions})};
  }
  if(request.responseFormat?.name!=='study_quiz_v1')return {model:'fixture',content:'Resposta simulada do agente.'};
  const instruction=request.messages[0].content;
  const config=labConfig({count:Number(instruction.match(/exatamente (\d+)/)[1]),alternatives:Number(instruction.match(/com (\d+) alternativas/)[1]),difficulty:instruction.match(/Dificuldade: (\w+)/)[1],sourceText:JSON.parse(request.messages[1].content).studyMaterial});
  return {model:'fixture',content:JSON.stringify(labDocument(config))};
}};}
