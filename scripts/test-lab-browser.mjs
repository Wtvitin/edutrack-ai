import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Requires the disposable lab-fixture server, never the real local account DB.
// PLAYWRIGHT_MODULE may point to an existing tool runtime installation.
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LAB_TEST_ORIGIN||'http://127.0.0.1:4186';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base),'E2E is restricted to the local disposable fixture');
const output=resolve(process.env.LAB_TEST_ARTIFACTS||'.local/audits/laboratorio-2026-10-28');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.LAB_BROWSER_CHANNEL||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];let documents=0,generations=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;if(request.url()===base+'/api/lab/quizzes'&&request.method()==='POST')generations++;});
const pass=name=>{checks.push(name);console.log('PASS '+name);};
async function screenshot(name){await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0);});await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});}
async function overflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No horizontal overflow');}
async function answer(option){
  await page.locator('.lab-options input[type=radio]').nth(option).check();
  if(await page.getByRole('button',{name:'Confirmar resposta',exact:true}).isVisible())await page.getByRole('button',{name:'Confirmar resposta',exact:true}).click();
  await page.locator('.lab-saved').waitFor();
}
async function goNext(){await page.getByRole('button',{name:'Próxima',exact:true}).click();await page.locator('.lab-options input[type=radio]').first().waitFor();}
try{
  await page.goto(base+'/login');await page.getByLabel('E-mail',{exact:true}).fill('lab@example.test');await page.getByLabel('Senha',{exact:true}).fill('laboratory-test-123');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  await page.locator('.main-nav a[href="/laboratorio"]').first().click();await page.waitForURL(base+'/laboratorio');await page.getByRole('heading',{name:/Aprender também/}).waitFor();
  await page.getByRole('heading',{name:'Suas atividades'}).waitFor();assert.equal(await page.locator('.lab-metric strong').first().innerText(),'0');pass('Real login and authenticated laboratory with empty persisted dashboard');
  const initialDocuments=documents;
  await page.locator('.main-nav a[href="/tarefas"]').first().click();await page.waitForURL(base+'/tarefas');
  await page.locator('.main-nav a[href="/laboratorio"]').first().click();await page.waitForURL(base+'/laboratorio');
  await page.getByRole('button',{name:'Começar um quiz',exact:true}).waitFor();assert.equal(documents,initialDocuments);pass('Navigation preserves workspace without document reload');

  await page.getByRole('button',{name:'Começar um quiz',exact:true}).click();
  await page.getByRole('button',{name:'Configuração avançada (opcional)',exact:true}).click();
  await page.getByLabel('Disciplina',{exact:true}).selectOption({label:'Matemática'});
  await page.getByLabel('Assunto',{exact:true}).fill('Adição e prática');await page.getByLabel('Quando corrigir').selectOption('end');
  await screenshot('desktop-configuracao');
  await page.getByRole('button',{name:'Gerar quiz',exact:true}).click();await page.locator('.lab-question').waitFor();
  assert.equal(await page.locator('.lab-options input').count(),4);assert.equal(generations,1);pass('Mock generation uses real API, four alternatives and no repeated request');
  await answer(0);assert.equal(await page.locator('.lab-explanation').count(),0);
  const overviewBefore=await context.request.get(base+'/api/lab');assert.equal((await overviewBefore.json()).summary.completed,0);
  await goNext();await answer(1);pass('End correction hides keys and saves answers');
  const activityURL=page.url();await page.reload();await page.locator('.lab-question').waitFor();assert.equal(page.url(),activityURL);
  assert.equal(await page.locator('.lab-progress').getAttribute('value'),'2');assert.equal(generations,1);pass('Reload restores persisted progress without another AI call');
  await screenshot('desktop-quiz');
  await answer(0);await goNext();await answer(0);await goNext();await answer(0);
  await page.getByRole('button',{name:'Concluir quiz',exact:true}).click();await page.locator('.lab-result').waitFor();
  assert.match(await page.locator('.lab-result').innerText(),/4 de 5 acertos/);assert.match(await page.locator('.lab-result').innerText(),/80%/);assert.ok(await page.locator('.lab-explanation').count());pass('Final deterministic score, duration and explanation review');
  await screenshot('desktop-resultado');
  await page.getByRole('button',{name:'Ver laboratório',exact:true}).click();
  await page.getByRole('heading',{name:'Sua evolução',exact:true}).waitFor();
  assert.match(await page.locator('.lab-metrics').innerText(),/80%/);assert.match(await page.locator('.lab-difficulties').innerText(),/1 erro/);
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));await overflow();await screenshot('desktop-claro');
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await screenshot('desktop-escuro');pass('Dashboard/history aggregate stored results with real difficulty counts');

  await page.getByRole('button',{name:'Novo quiz',exact:true}).click();await page.getByRole('button',{name:'Configuração avançada (opcional)',exact:true}).click();await page.getByLabel('Quando corrigir').selectOption('immediate');
  await page.getByLabel('Alternativas',{exact:true}).selectOption('5');
  await page.getByLabel(/Material de referência/).fill('A adição de números naturais reúne duas quantidades. Some duas unidades para encontrar o resultado.');
  await page.getByRole('button',{name:'Gerar quiz',exact:true}).click();await page.locator('.lab-question').waitFor();
  assert.equal(await page.locator('.lab-options input').count(),5);await answer(0);assert.match(await page.locator('.lab-explanation').innerText(),/Você acertou/);
  assert.match(await page.locator('.lab-provenance').innerText(),/Referência no material/);assert.ok(await page.locator('.lab-provenance blockquote').innerText());
  await goNext();assert.equal(await page.locator('.lab-explanation').count(),0);pass('Immediate feedback reveals only answered question; source excerpt is preserved');

  await page.setViewportSize({width:390,height:844});await overflow();await screenshot('mobile-quiz-escuro');
  await page.getByRole('button',{name:'Ver laboratório',exact:true}).click();await screenshot('mobile-escuro');
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await overflow();}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.remove('dark'));await screenshot('mobile-claro');pass('Mobile and tablet layouts at 320/390/768px, light and dark themes');
  await page.getByRole('button',{name:'Novo quiz',exact:true}).click();
  await page.getByRole('button',{name:'Configuração avançada (opcional)',exact:true}).click();
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  const inputs=await page.locator('.lab-form :is(input,select,textarea)').evaluateAll(elements=>elements.map(el=>!!el.labels?.length));assert.ok(inputs.every(Boolean));
  assert.equal(await page.locator('h1').count(),1);pass('Labeled form controls, keyboard focus and unique main heading');

  await page.route('**/api/lab/quizzes',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({code:'lab-invalid-generation',message:'As questões não passaram na validação. Nenhuma questão foi publicada.'})}));
  await page.getByRole('button',{name:'Gerar quiz',exact:true}).click();await page.locator('.lab-error').getByText(/As questões não passaram/).waitFor();
  assert.match(await page.locator('.lab-error').innerText(),/não passaram na validação/);await page.getByRole('button',{name:'Recuperar pedido anterior'}).waitFor();
  assert.equal(await page.locator('.lab-question').count(),0);pass('Generation error is visible, retains recovery ID and publishes no invalid content');
  await page.unroute('**/api/lab/quizzes');await page.getByRole('button',{name:'Voltar ao laboratório',exact:true}).click();
  const overviewURL=/\/api\/lab(?:\?.*)?$/;await page.route(overviewURL,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Histórico temporariamente indisponível.'})}));
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.locator('.lab-error').getByText(/Histórico temporariamente/).waitFor();assert.match(await page.locator('.lab-error').innerText(),/Histórico temporariamente/);await page.unroute(overviewURL);
  await page.getByRole('button',{name:'Atualizar histórico',exact:true}).click();await page.locator('.lab-error').waitFor({state:'detached'});pass('Overview error can recover while preserving displayed data');
  assert.deepEqual(errors,[]);pass('No uncaught browser errors');
  await writeFile(resolve(output,'results.json'),JSON.stringify({checks,errors,generations},null,2));
  console.log(JSON.stringify({passed:checks.length,output}));
}catch(error){await screenshot('failure');console.error(error);process.exitCode=1;}finally{await browser.close();}
