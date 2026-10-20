// Opt-in real Firebase/Worker/Pages QA, labelled synthetic students only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {FINAL_BANK} from '../src/games/1math3/final-stage.js';
import {answerOf} from '../tools/checkpoint-c-live.mjs';
const dir='.cp5-test-artifacts/final-stage',site='https://subsubt.github.io/game';
test('real final stage: fifty questions, pause/other PIN device, ten actual server minutes and one combined rank',{skip:process.env.MATH3_FINAL_LIVE!=='1',timeout:1100000},async()=>{
 const fixture=JSON.parse(await readFile(dir+'/fixture.json','utf8')),published=process.env.MATH3_PAGES_TEST==='1';
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),contexts=[],errors=[],serverErrors=[];
 let session,final,studentId,dropFinalSave=false;const saveIds=[];
 const name=(published?'최종공개':'최종후보')+Date.now().toString(36).slice(-4),pin='4826';
 async function newPage() {
  const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);
  if(!published)await c.route(site+'/**',async route=>{const rel=new URL(route.request().url()).pathname.slice('/game/'.length),file=resolve('dist-pages',rel);assert.ok(file.startsWith(resolve('dist-pages')));await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)],body:await readFile(file)});});
  const p=await c.newPage();p.on('pageerror',()=>errors.push('pageerror'));
  p.on('response',async r=>{if(!r.url().includes('.workers.dev/api/'))return;try{const j=await r.json();if(r.status()>=500)serverErrors.push(new URL(r.url()).pathname);const s=j.result?.session||j.result;if(s?.sessionId&&s.questions)session=s;if(j.result?.finalStage)final=j.result.finalStage;if(j.result?.students)studentId=j.result.students.find(s=>s.privateName===name)?.studentId||studentId;}catch{}});
  await p.route('**/api/saveFinalStage',async route=>{saveIds.push(JSON.parse(route.request().postData()).data.requestId);if(dropFinalSave){dropFinalSave=false;await route.fetch();await route.abort();return;}await route.continue();});return p;
 }
 async function roster(p){await p.goto(site+'/1math3.html');await p.getByRole('button',{name:'학급 참여하기',exact:true}).click();await p.getByLabel('학급 코드',{exact:true}).fill(fixture.cls.code);await p.getByRole('button',{name:'우리 반 이름 보기'}).click();await p.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).waitFor();}
 async function enterPin(p){await p.getByLabel('숫자 4자리 비밀번호',{exact:true}).fill(pin);}
 try{
  const a=await newPage();await roster(a);await a.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).click();await a.getByLabel('내 이름',{exact:true}).fill(name);await enterPin(a);await a.getByLabel('비밀번호 한 번 더').fill(pin);await a.getByRole('button',{name:'등록하기',exact:true}).click();await a.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
  await a.getByRole('heading',{name:'100까지의 수',exact:true}).waitFor();await a.screenshot({path:resolve(dir,published?'public-portal.png':'candidate-portal.png'),fullPage:true});
  await a.locator('.game-tile').filter({has:a.getByRole('heading',{name:'100까지의 수',exact:true})}).getByRole('button',{name:'게임 고르기'}).click();await a.waitForURL('**/1math2.html');assert.ok((await a.title()).includes('100'));await a.goBack();await a.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
  await a.locator('.game-tile').filter({has:a.getByRole('heading',{name:'덧셈과 뺄셈(1)',exact:true})}).getByRole('button',{name:'게임 고르기'}).click();await a.getByRole('button',{name:'시작하기',exact:true}).click();
  for(let n=1;n<=50;n++){
   await a.getByText(n+' / 50',{exact:true}).waitFor();let q=session.questions[session.currentIndex];
   if(q.step==='pair'){const pair=[[0,1],[0,2],[1,2]].find(([x,y])=>q.operands[x]+q.operands[y]===10);for(const i of pair)await a.locator('[data-action="card"][data-index="'+i+'"]').click();await a.getByRole('button',{name:'고른 카드 확인'}).click();await a.getByRole('heading',{name:'좋은 짝을 골랐어요!'}).waitFor();await a.getByRole('button',{name:'이제 합을 입력할게요'}).click();q=session.questions[session.currentIndex];}
   await a.keyboard.type(String(answerOf(q)));await a.getByRole('button',{name:'확인',exact:true}).click();await a.getByRole('heading',{name:'맞았어요! 별 하나!',exact:true}).waitFor();await a.getByRole('button',{name:n===50?'결과 보기':'다음 문제',exact:true}).click();if(n%10===0&&n<50)await a.getByRole('button',{name:'계속 풀기',exact:true}).click();
  }
  await a.getByRole('heading',{name:'최종 스테이지',exact:true}).waitFor();assert.equal(session.result.score,500);console.log('Real fifty-question learning and final unlock PASS');
  await a.getByRole('button',{name:'10분 도전 시작'}).click();await a.locator('[data-action="final-answer"]').waitFor();const firstDeadline=final.deadlineAt;
  async function answerFinal(p){let q=final.question,bank=FINAL_BANK.find(b=>q.id.endsWith(b.bankId));assert.ok(bank);if(q.step==='pair'){for(const i of bank.validPairs[0])await p.locator('[data-action="final-card"][data-index="'+i+'"]').click();await p.locator('[data-action="final-answer"]').click();await p.getByText('좋은 짝이에요! 이제 세 수의 합을 입력해요.').waitFor();}await p.locator('[data-action="final-clear"]').click();await p.keyboard.type(String(bank.answer));await p.locator('[data-action="final-answer"]').click();await p.getByRole('heading',{name:'맞았어요! 별 하나!',exact:true}).waitFor();await p.locator('[data-action="final-next"]').click();}
  await answerFinal(a);await answerFinal(a);
  if(final.question.step==='pair')await a.locator('[data-action="final-card"][data-index="0"]').click();else await a.locator('[data-action="final-digit"][data-value="1"]').click();
  dropFinalSave=true;await a.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await a.getByText('서버 응답을 확인하지 못했어요.',{exact:false}).waitFor();await a.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await a.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();assert.equal(saveIds[0],saveIds[1]);const saved=structuredClone(final);
  await a.screenshot({path:resolve(dir,'live-final-paused.png'),fullPage:true});await a.getByRole('button',{name:'저장하고 로그아웃'}).click();
  const b=await newPage();await roster(b);assert.ok(studentId);await b.locator('[data-action="choose-student"][data-id="'+studentId+'"]').click();await enterPin(b);await b.getByRole('button',{name:'들어가기',exact:true}).click();await b.getByRole('button',{name:'최종 스테이지',exact:true}).click();await b.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();assert.equal(final.remainingMs,saved.remainingMs);assert.equal(final.score,20);
  await b.getByRole('button',{name:'남은 시간부터 이어하기'}).click();await b.locator('[data-action="final-answer"]').waitFor();assert.ok(final.remainingMs<=saved.remainingMs);assert.ok(final.deadlineAt>firstDeadline);
  if(saved.question.step==='pair'){assert.equal(await b.locator('.card-choice[aria-pressed="true"]').count(),1);await b.locator('[data-action="final-card"][data-index="0"]').click();}else assert.equal(await b.locator('#final-answer-display').textContent(),'1');
  await answerFinal(b);await b.reload();await b.getByRole('button',{name:'최종 스테이지',exact:true}).click();await b.locator('[data-action="final-answer"]').waitFor();assert.equal(final.score,30);assert.ok(final.remainingMs<saved.remainingMs);
  const evidence={sessionId:session.sessionId,studentId,privateName:name,pin,cls:fixture.cls,startedAt:new Date().toISOString(),savedRemainingMs:saved.remainingMs,deadlineAt:final.deadlineAt,published};await writeFile(dir+'/live-running.json',JSON.stringify(evidence));await writeFile(dir+'/student-storage.json',JSON.stringify(await b.context().storageState({indexedDB:true})));
  console.log('Real lost-response save, PIN device transfer, exact paused time/draft/score and refresh PASS; waiting for actual ten-minute expiry');
  await b.screenshot({path:resolve(dir,'live-final-running.png'),fullPage:true});
  // Real wall time, no fake clock or database deadline editing in live service.
  await b.getByRole('heading',{name:'최종 스테이지 완료!'}).waitFor({timeout:Math.max(1000,final.remainingMs)+60000});assert.equal(final.remainingMs,0);assert.equal(final.score,30);
  await b.getByText('합산: 530점',{exact:false}).waitFor();await b.screenshot({path:resolve(dir,'live-final-complete.png'),fullPage:true});
  await b.getByRole('button',{name:'학습 결과 보기'}).click();await b.getByRole('tab',{name:'우리 반 순위',exact:true}).click();await b.locator('.rank-row.me').getByText('530점',{exact:true}).waitFor();
  assert.equal(errors.length,0);assert.equal(serverErrors.length,0);assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile(dir+'/live-browser.json',JSON.stringify({...evidence,pin:undefined,realTenMinutes:true,basicScore:500,finalScore:30,combinedRank:530,lostResponseRetry:true,otherDevice:true,draftRestored:true,pausedTimeUnchanged:true,reloadNoReset:true,consoleErrors:errors.length,serverErrors:serverErrors.length,finishedAt:new Date().toISOString()},null,2));
  console.log('Real ten-minute server expiry, final score 30, combined rank 530 and browser console PASS');
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
});
