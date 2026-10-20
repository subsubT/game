// Published assets only, existing synthetic student's auth state. No mocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {FINAL_BANK} from '../src/games/1math3/final-stage.js';
import {answerOf} from '../tools/checkpoint-c-live.mjs';
const dir='.cp5-test-artifacts/final-stage',site='https://subsubt.github.io/game/';
test('published portal, prior 530-point record, new fifty-question run, final pause/reload and unchanged best rank',{skip:process.env.MATH3_PAGES_TEST!=='1',timeout:600000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),errors=[],serverErrors=[];
 const ctx=await browser.newContext({storageState:JSON.parse(await readFile(dir+'/student-storage.json','utf8')),viewport:{width:390,height:844}}),p=await ctx.newPage();let session,final;
 p.on('pageerror',()=>errors.push('pageerror'));p.on('console',m=>{if(m.type()==='error')errors.push('console error');});p.on('response',async r=>{if(!r.url().includes('.workers.dev/api/'))return;try{const j=await r.json();if(r.status()>=500)serverErrors.push(new URL(r.url()).pathname);const s=j.result?.session||j.result;if(s?.sessionId&&s.questions)session=s;if(j.result?.finalStage)final=j.result.finalStage;}catch{}});
 try{
  await p.goto(site+'1math3.html?release=20261020');await p.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
  await p.getByRole('heading',{name:'100까지의 수',exact:true}).waitFor();await p.getByRole('heading',{name:'덧셈과 뺄셈(1)',exact:true}).waitFor();await p.screenshot({path:resolve(dir,'public-portal.png'),fullPage:true});
  await p.locator('.game-tile').filter({has:p.getByRole('heading',{name:'100까지의 수',exact:true})}).getByRole('button',{name:'게임 고르기'}).click();await p.waitForURL('**/1math2.html');assert.ok((await p.title()).includes('100'));await p.goBack();
  await p.getByRole('button',{name:'최종 스테이지',exact:true}).click();await p.getByRole('heading',{name:'최종 스테이지 완료!'}).waitFor();await p.getByText('합산: 530점',{exact:false}).waitFor();
  await p.getByRole('button',{name:'학습 결과 보기'}).click();await p.getByRole('button',{name:'다시 도전하기',exact:true}).click();
  for(let n=1;n<=50;n++){
   await p.getByText(n+' / 50',{exact:true}).waitFor();let q=session.questions[session.currentIndex];
   if(q.step==='pair'){const pair=[[0,1],[0,2],[1,2]].find(([a,b])=>q.operands[a]+q.operands[b]===10);for(const i of pair)await p.locator('[data-action="card"][data-index="'+i+'"]').click();await p.getByRole('button',{name:'고른 카드 확인'}).click();await p.getByRole('heading',{name:'좋은 짝을 골랐어요!'}).waitFor();await p.getByRole('button',{name:'이제 합을 입력할게요'}).click();q=session.questions[session.currentIndex];}
   await p.keyboard.type(String(answerOf(q)));await p.getByRole('button',{name:'확인',exact:true}).click();await p.getByRole('heading',{name:'맞았어요! 별 하나!',exact:true}).waitFor();await p.getByRole('button',{name:n===50?'결과 보기':'다음 문제',exact:true}).click();if(n%10===0&&n<50)await p.getByRole('button',{name:'계속 풀기',exact:true}).click();
  }
  await p.getByRole('heading',{name:'최종 스테이지',exact:true}).waitFor();assert.equal(session.result.score,500);await p.getByRole('button',{name:'10분 도전 시작'}).click();await p.locator('[data-action="final-answer"]').waitFor();
  for(let n=0;n<2;n++) {const q=final.question,base=FINAL_BANK.find(b=>q.id.endsWith(b.bankId));if(q.step==='pair'){for(const i of base.validPairs[0])await p.locator('[data-action="final-card"][data-index="'+i+'"]').click();await p.locator('[data-action="final-answer"]').click();await p.getByText('좋은 짝이에요! 이제 세 수의 합을 입력해요.').waitFor();}await p.keyboard.type(String(base.answer));await p.locator('[data-action="final-answer"]').click();await p.getByRole('heading',{name:'맞았어요! 별 하나!',exact:true}).waitFor();await p.locator('[data-action="final-next"]').click();}
  await p.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await p.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();const saved=structuredClone(final);assert.equal(saved.score,20);
  await p.reload();await p.getByRole('button',{name:'최종 스테이지',exact:true}).click();await p.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();assert.equal(final.remainingMs,saved.remainingMs);assert.equal(final.score,20);await p.screenshot({path:resolve(dir,'public-final-paused.png'),fullPage:true});
  await p.getByRole('button',{name:'게임 선택으로',exact:true}).click();await p.getByRole('button',{name:'친구들 순위',exact:true}).click();await p.getByRole('tab',{name:'우리 반 순위',exact:true}).click();await p.locator('.rank-row.me').getByText('530점',{exact:true}).waitFor();
  assert.equal(errors.length,0);assert.equal(serverErrors.length,0);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile(dir+'/public-browser.json',JSON.stringify({published:true,oldCombinedRecord:530,newBasicScore:500,newFinalPausedScore:20,savedRemainingMs:saved.remainingMs,reloadExactTime:true,unchangedBestRank:530,sessionId:session.sessionId,consoleErrors:errors.length,serverErrors:serverErrors.length,checkedAt:new Date().toISOString()},null,2));console.log('Published two games, fifty questions, final save/reload, old 530-point rank and console PASS');
 }finally{await ctx.close();await browser.close();}
});
