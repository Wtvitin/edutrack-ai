import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LAB_TEST_ORIGIN||'http://127.0.0.1:4186';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const output=resolve(process.env.LAB_TEST_ARTIFACTS||'.local/audits/laboratorio-assistido-2026-10-28');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),page=await context.newPage();
const checks=[],errors=[];let generations=0,reviews=0;
page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>{if(/\/api\/lab\/quizzes\/[^/]+\/generate$/.test(req.url()))generations++;if(/\/api\/lab\/quizzes\/[^/]+\/review$/.test(req.url()))reviews++;});
const pass=message=>{checks.push(message);console.log('PASS '+message);};
async function screenshot(name){await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});}
async function expectedAnswer(){
  const prompt=await page.locator('.lab-question>h3').innerText();
  if(prompt.includes('escolhe as colunas'))return 'SELECT';if(prompt.includes('filtra linhas'))return 'WHERE';if(prompt.includes('relaciona linhas'))return 'JOIN';if(prompt.includes('agrupa linhas'))return 'GROUP BY';return 'HAVING';
}
async function choose(correct=true){
  const expected=await expectedAnswer();const options=await page.locator('.lab-options label>span:nth-child(3)').allTextContents();
  const index=options.findIndex(text=>correct?text===expected:text!==expected);assert.ok(index>=0);
  await page.locator('.lab-options input').nth(index).check();await page.locator('.lab-saved').waitFor();
  assert.equal(await page.getByRole('button',{name:'Confirmar resposta',exact:true}).count(),0);
}
try{
  await page.goto(base+'/login');await page.getByLabel('E-mail',{exact:true}).fill('lab@example.test');await page.getByLabel('Senha',{exact:true}).fill('laboratory-test-123');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  await page.locator('.main-nav a[href="/agente"]').first().click();await page.getByLabel('Mensagem para o Assistente EduTrack').fill('Monte um quiz de SQL com base na minha matéria e atividades');await page.getByRole('button',{name:'Enviar mensagem'}).click();
  await page.waitForURL(/\/laboratorio\?atividade=/);await page.locator('.lab-question').waitFor();
  assert.equal(generations,1);assert.match(await page.locator('.lab-runner .lab-section-heading').innerText(),/Banco de Dados/);pass('Agent prepares an audited quiz and automatically opens the Laboratory with the right discipline');
  const id=new URL(page.url()).searchParams.get('atividade'),response=await context.request.get(base+'/api/lab/quizzes/'+id),activity=await response.json();
  assert.equal(activity.automatic,true);assert.ok([5,10,15,20].includes(activity.count));assert.ok([4,5].includes(activity.alternatives));assert.equal(activity.correction,'immediate');assert.ok(activity.contextSummary.taskCount>0);assert.ok(activity.questions.every(q=>q.correctIndex===undefined));
  assert.equal(await page.getByLabel('Quantidade de perguntas',{exact:true}).count(),0);pass('Configuration is automatic, randomized and based on owned assignments without exposing the key');
  await choose(false);assert.equal(await page.locator('.lab-options label.incorrect').count(),1);assert.equal(await page.locator('.lab-options label.correct').count(),1);assert.match(await page.locator('.lab-saved').innerText(),/Incorreto/);await screenshot('desktop-correcao-imediata');pass('Wrong selection is saved immediately and renders red alongside the correct green alternative');
  await page.getByRole('button',{name:'Próxima',exact:true}).click();await choose();assert.equal(await page.locator('.lab-options label.incorrect').count(),0);assert.equal(await page.locator('.lab-options label.correct').count(),1);pass('Correct selection receives green feedback without a confirmation step');
  await page.reload();await page.locator('.lab-question').waitFor();assert.equal(generations,1);assert.equal(await page.locator('.lab-progress').getAttribute('value'),'2');pass('Reload resumes randomized questions and saved answers without another generation');
  for(let i=2;i<activity.count;i++){await choose();if(i<activity.count-1)await page.getByRole('button',{name:'Próxima',exact:true}).click();}
  await page.getByRole('button',{name:'Concluir quiz',exact:true}).click();await page.locator('.lab-result').waitFor();await page.locator('.lab-review-priorities article').first().waitFor();
  assert.match(await page.locator('.lab-result').innerText(),new RegExp(`${activity.count-1} de ${activity.count} acertos`));assert.equal(reviews,1);pass('Completion preserves deterministic grading and automatically requests one evidence-based AI analysis');
  await page.getByRole('button',{name:'Ver laboratório',exact:true}).click();await screenshot('desktop-pontos-fracos');await page.reload();await page.locator('.lab-review-priorities article').first().waitFor();assert.equal(reviews,1);pass('Personalized weak points and exercises remain cached after navigation and reload');
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));await screenshot('mobile-analise-escuro');
  await page.getByRole('button',{name:'Novo quiz',exact:true}).click();await page.getByLabel('Seu pedido de estudo').fill('Quero praticar SQL com base nas minhas atividades');await screenshot('mobile-pedido-automatico');pass('Single-prompt interface and personalized analysis work on mobile/tablet and dark theme');
  await page.getByRole('button',{name:'Criar quiz com IA',exact:true}).click();await page.locator('.lab-question').waitFor();assert.equal(generations,2);pass('Laboratory also creates a contextual quiz directly from one prompt without the chat');
  assert.deepEqual(errors,[]);pass('No uncaught browser errors in the complete assisted flow');
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,generations,reviews},null,2));
}catch(error){await screenshot('failure');console.error(error);process.exitCode=1;}finally{await browser.close();}
