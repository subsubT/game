import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const site='https://subsubt.github.io/game/';
test('published Pages dependencies, exclusions and three legacy games', {skip:process.env.MATH3_PAGES_TEST!=='1',timeout:180000},async()=>{
 const evidence={checkedAt:new Date().toISOString(),http:[],legacy:[]};
 const files=['index.html','1math1.html','1math2.html','1math3.html','teacher/','teacher/index.html','teacher/dashboard.js','teacher/dashboard.css','src/student/1math3.bundle.js','src/student/1math3.css','firebase-config.js','1math2-config.json'];
 for(const file of files){
  const r=await fetch(site+file);assert.equal(r.status,200,file);const body=await r.text();
  if(file.endsWith('.js'))assert.match(r.headers.get('content-type'),/javascript/);
  if(file.endsWith('.css'))assert.match(r.headers.get('content-type'),/text\/css/);
  if(['index.html','1math1.html'].includes(file))assert.equal(createHash('sha256').update(body).digest('hex'),createHash('sha256').update(await readFile(file)).digest('hex'));
  evidence.http.push({file,status:r.status,mime:r.headers.get('content-type')});
 }
 for(const file of ['references/','docs/DEVELOPMENT_STATE.md','functions/index.js','worker/src/index.js','tests/live-config.js','tools/cp5-live-integration.mjs','.env.local','.dev.vars','.cp5-test-artifacts/live-status.json','config/pages-public.json','firebase-config.example.js']){
  assert.equal((await fetch(site+file)).status,404,file);
 }
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 try{for(const file of ['index.html','1math1.html','1math2.html']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],badResponses=[];
  page.on('response',r=>{if(r.status()>=400)badResponses.push({status:r.status(),path:new URL(r.url()).origin+new URL(r.url()).pathname});});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push({message:e.text().replace(/https?:\/\/\S+/g,'[URL]'),path:e.location().url.split('?')[0]});});
  await page.goto(site+file);
  if(file==='1math2.html'){
   await page.locator('#nickname').fill('CP5합성검증');
   await page.locator('#startBtn').click();await page.locator('.question-card').waitFor();
   if(await page.getByLabel('숫자 답 입력').count())await page.getByLabel('숫자 답 입력').fill('1');
   await page.locator('#answerArea button').first().click();
   await page.locator('#feedback').filter({hasText:/정답|아쉬|좋|잘|맞|틀/}).waitFor();
  }else{
   if(file==='1math1.html')await page.locator('#nickname-input').fill('CP5합성검증');
   await page.locator('#start-btn').click();await page.locator('#game-screen.active').waitFor();
   const answer=await page.evaluate(()=>currentProblem.answer);
   for(const digit of String(answer))await page.locator(`.key-btn[onclick="appendInput('${digit}')"]`).click();
   await page.locator('.action-submit').click();await page.locator('#correct-display').getByText('1개').waitFor();
  }
  // Close before finish/quit/timer; no legacy production score is written.
  assert.deepEqual(badResponses,[],file);assert.deepEqual(errors,[],file);evidence.legacy.push({file,render:true,start:true,errors:0,productionScoreWritten:false});await context.close();
 }}finally{await browser.close();}
 await writeFile('.cp5-test-artifacts/final/pages-smoke.json',JSON.stringify(evidence,null,2));
});
