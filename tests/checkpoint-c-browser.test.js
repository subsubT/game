// Explicitly opt-in. Real Firebase SDK/Worker; only labelled synthetic accounts.
import test from 'node:test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {answerOf} from '../tools/checkpoint-c-live.mjs';
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
test('Checkpoint C actual student portal, arbitrary save, other device and final server score', {skip:process.env.MATH3_LIVE_TEST!=='1',timeout:900000},async()=>{
 const published=process.env.MATH3_PAGES_TEST==='1',site='https://subsubt.github.io/game',root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.cp5-test-artifacts/checkpoint-c');
 await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),contexts=[],errors=[],failures=[];
 const privateName=(published?'C공개':'C후보')+Date.now().toString(36).slice(-4);let session,studentId,dropSave=false,failSave=false,dropAnswer=false;const saveIds=[];
 async function page(){
  const c=await browser.newContext({viewport:{width:390,height:844}});contexts.push(c);
  if(!published)await c.route(site+'/**',async route=>{const p=new URL(route.request().url()).pathname.slice('/game/'.length),file=resolve(root,'dist-pages',p);check(file.startsWith(resolve(root,'dist-pages')),'path escaped');try{await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)],body:await readFile(file)});}catch{await route.fulfill({status:404,body:''});}});
  const p=await c.newPage();p.on('pageerror',()=>errors.push('pageerror'));
  p.on('response',async r=>{if(!r.url().includes('.workers.dev/api/'))return;try{const json=await r.json();if(r.status()>=500)failures.push(new URL(r.url()).pathname);const s=json.result?.session||json.result;if(s?.sessionId&&s.questions)session=s;const students=json.result?.students;if(students)studentId=students.find(x=>x.privateName===privateName)?.studentId||studentId;}catch{}});
  await p.route('**/api/saveSession',async route=>{saveIds.push(JSON.parse(route.request().postData()).data.requestId);if(failSave){failSave=false;await route.abort();return;}if(dropSave){dropSave=false;await route.fetch();await route.abort();return;}await route.continue();});
  await p.route('**/api/submitAnswer',async route=>{if(dropAnswer){dropAnswer=false;await route.fetch();await route.abort();return;}await route.continue();});return p;
 }
 async function roster(p){await p.goto(site+'/1math3.html'+(published?'?c=20261014':''));await p.getByRole('button',{name:'학급 참여하기',exact:true}).click();await p.getByLabel('학급 코드',{exact:true}).fill('1409');await p.getByRole('button',{name:'우리 반 이름 보기'}).click();await p.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).waitFor();}
 const pin=String(1000+Math.floor(Math.random()*9000));
 try{
  const a=await page();await roster(a);await a.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).click();await a.getByLabel('내 이름',{exact:true}).fill(privateName);await a.getByLabel('숫자 4자리 비밀번호',{exact:true}).fill(pin);await a.getByLabel('비밀번호 한 번 더').fill(pin);await a.getByRole('button',{name:'등록하기',exact:true}).click();await a.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
  await a.getByRole('button',{name:'게임 고르기'}).click();await a.getByRole('button',{name:'시작하기',exact:true}).click();await a.getByText('1 / 50',{exact:true}).waitFor();
  await a.locator('[data-action="digit"][data-value="1"]').click();dropSave=true;await a.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await a.getByRole('heading',{name:'저장을 확인하지 못했어요'}).waitFor();await a.getByRole('button',{name:'저장 다시 시도'}).click();await a.getByRole('heading',{name:'저장했어요!'}).waitFor();check(saveIds[0]===saveIds[1],'lost-response retry changed request ID');
  await a.getByRole('button',{name:'저장하고 로그아웃'}).click();await a.getByRole('button',{name:'학급 참여하기',exact:true}).waitFor();
  const b=await page();await roster(b);check(studentId,'new student absent in roster');await b.locator(`[data-action="choose-student"][data-id="${studentId}"]`).click();await b.getByLabel('숫자 4자리 비밀번호',{exact:true}).fill(pin);await b.getByRole('button',{name:'들어가기',exact:true}).click();await b.getByRole('button',{name:'이어서 하기',exact:true}).click();await b.getByText('1 / 50',{exact:true}).waitFor();check(await b.locator('#answer-display').textContent()==='1','cross-device draft lost');check(session.timer.policy==='unlimited'&&session.expiresAt===null,'time limit added');
  for(let n=1;n<=50;n++){
   await b.getByText(`${n} / 50`,{exact:true}).waitFor();let q=session.questions[session.currentIndex];
   if(q.step==='pair') {const pair=[[0,1],[0,2],[1,2]].find(([x,y])=>q.operands[x]+q.operands[y]===10);for(const v of pair)await b.locator(`[data-action="card"][data-index="${v}"]`).click();await b.getByRole('button',{name:'고른 카드 확인'}).click();await b.getByRole('heading',{name:'좋은 짝을 골랐어요!'}).waitFor();await b.getByRole('button',{name:'이제 합을 입력할게요'}).click();q=session.questions[session.currentIndex];}
   await b.getByRole('button',{name:'지우기',exact:true}).click();await b.keyboard.type(String(answerOf(q)));
   if(n===1){dropAnswer=true;await b.getByRole('button',{name:'확인',exact:true}).click();await b.getByText('답을 확인하지 못했어요. 같은 답으로 다시 시도해 주세요.').waitFor();await b.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await b.getByRole('heading',{name:'저장했어요!'}).waitFor();await b.getByRole('button',{name:'이어서 하기',exact:true}).click();}
   else await b.getByRole('button',{name:'확인',exact:true}).click();
   await b.getByRole('heading',{name:'맞았어요! 별 하나!'}).waitFor();
   if(n===3){failSave=true;await b.getByRole('button',{name:'게임 선택으로',exact:true}).click();await b.getByRole('heading',{name:'저장을 확인하지 못했어요'}).waitFor();await b.getByRole('button',{name:'저장 다시 시도'}).click();await b.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();await b.screenshot({path:resolve(dir,published?'public-portal.png':'candidate-portal.png'),fullPage:true});await b.reload();await b.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();await b.getByRole('button',{name:'이어서 하기',exact:true}).click();await b.getByRole('heading',{name:'맞았어요! 별 하나!'}).waitFor();}
   await b.getByRole('button',{name:n===50?'결과 보기':'다음 문제',exact:true}).click();if(n%10===0&&n<50)await b.getByRole('button',{name:'계속 풀기',exact:true}).click();
  }
  await b.getByText('서버 저장 완료',{exact:true}).waitFor();check(session.result.score===500&&session.result.completion==='complete','final score/completion wrong');
  await b.getByRole('tab',{name:'우리 반 순위',exact:true}).click();await b.locator('.rank-row.me').getByText('500점',{exact:true}).waitFor();check(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  await b.screenshot({path:resolve(dir,published?'public-complete.png':'candidate-complete.png'),fullPage:true});check(errors.length===0&&failures.length===0,'browser/runtime failure');
  await writeFile(resolve(dir,published?'public-browser.json':'candidate-browser.json'),JSON.stringify({checkedAt:new Date().toISOString(),realFirebase:true,realWorker:true,published,registration:true,portal:true,unlimited:true,saveBeforeFirstAnswer:true,lostSaveIdempotent:true,lostAnswerRecovered:true,crossDeviceDraft:true,arbitraryThreeAnswers:true,networkFailureRetry:true,reloadResume:true,answered:50,score:500,rank:true,consoleErrors:errors.length,serverErrors:failures.length,sessionId:session.sessionId,studentId},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
});
