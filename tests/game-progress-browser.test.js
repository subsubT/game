import {unpackFinal} from '../src/games/1math3/final-stage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {handleRequest} from '../worker/src/index.js';
import {MemoryDb, fixtureEnv} from './sheets-fakes.js';

test('Chromium portal, free save, lost response retry, reload, another device, final score and teacher history', {timeout:180000},async()=>{
  const root=resolve(import.meta.dirname,'..'),db=new MemoryDb(),env=fixtureEnv(),h=createHandlers(db,env.MATH3_SERVER_SECRET);
  await h.createTeacherSpace({requestId:crypto.randomUUID()},'teacher');
  const cls=await h.createClass({privateLabel:'자유저장 화면검증반',requestId:crypto.randomUUID()},'teacher');
  const origin='https://subsubt.github.io',worker=new URL(env.GOOGLE_REDIRECT_URI).origin;
  const config={apiKey:'mock',projectId:'math3-dev',authDomain:'math3-dev.firebaseapp.com',appId:'mock',workerApiOrigin:worker};
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),errors=[],contexts=[],pinSetupRequests=[];
  let dropPinSetupResponse=false,dropSaveResponse=false,dropAnswerResponse=false,failSaveBefore=false,dropFinal=false;const saveRequests=[],finalRequests=[];
  async function pageFor(uid) {
    const ctx=await browser.newContext({viewport:{width:390,height:844}});contexts.push(ctx);
    await ctx.addInitScript(uid=>{if(!localStorage.getItem('test.auth.uid'))localStorage.setItem('test.auth.uid',uid);},uid);
    await ctx.route('https://www.gstatic.com/firebasejs/**',async route=>{
      const auth=`let auth={currentUser:null,authStateReady:async()=>{const uid=localStorage.getItem('test.auth.uid');auth.currentUser=uid?user(uid):null;}};function user(uid){return {uid,isAnonymous:true,getIdToken:async()=>uid};}export const getAuth=()=>auth;export const setPersistence=async()=>{};export const browserLocalPersistence={};export const signInAnonymously=async()=>{let uid=localStorage.getItem('test.auth.uid')||crypto.randomUUID();localStorage.setItem('test.auth.uid',uid);auth.currentUser=user(uid);};export const signOut=async()=>{localStorage.removeItem('test.auth.uid');auth.currentUser=null;};`;
      await route.fulfill({contentType:'text/javascript',body:route.request().url().endsWith('firebase-app.js')?'export const initializeApp=()=>({});':auth});
    });
    await ctx.route(`${origin}/game/**`,async route=>{
      const path=new URL(route.request().url()).pathname.slice('/game/'.length);
      if(path==='firebase-config.js'){await route.fulfill({contentType:'text/javascript',body:`globalThis.MATH3_FIREBASE_CONFIG=${JSON.stringify(config)};`});return;}
      const file=resolve(root,path);assert.ok(file.startsWith(root));await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)],body:await readFile(file)});
    });
    await ctx.route(`${worker}/**`,async route=>{
      const r=route.request(),req=new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),body:r.method()==='POST'?r.postData():undefined});
      const path=new URL(r.url()).pathname;
      if(path==='/api/getStudentStatus'&&r.headers().authorization==='Bearer first')await new Promise(resolve=>setTimeout(resolve,2000));
      if(path==='/api/saveSession'&&failSaveBefore){failSaveBefore=false;await route.abort('failed');return;}
      const res=await handleRequest(req,env,{database:db,verifyToken:async token=>({sub:token}),reportError:d=>errors.push(`Worker ${d.stage}`)});
      if(path==='/api/saveFinalStage'){finalRequests.push(JSON.parse(r.postData()).data.requestId);if(dropFinal&&res.ok){dropFinal=false;await route.abort('failed');return;}}
      if(path==='/api/saveSession'){saveRequests.push(JSON.parse(r.postData()).data.requestId);if(dropSaveResponse&&res.ok){dropSaveResponse=false;await route.abort('failed');return;}}
      if(path==='/api/submitAnswer'&&dropAnswerResponse&&res.ok){dropAnswerResponse=false;await route.abort('failed');return;}
      if(new URL(r.url()).pathname==='/api/setStudentPin') {
        pinSetupRequests.push(JSON.parse(r.postData()).data.requestId);
        if(dropPinSetupResponse&&res.ok){dropPinSetupResponse=false;await route.abort('failed');return;}
      }
      const text=await res.text();assert.ok(!text.includes('verifier'));await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:text});
    });
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
  }
  async function roster(page) {
    await page.goto(`${origin}/game/1math3.html`);
    await page.getByRole('button',{name:'학급 참여하기',exact:true}).click();
    await page.getByLabel('학급 코드',{exact:true}).fill(cls.code);
    await page.getByRole('button',{name:'우리 반 이름 보기'}).click();
    await page.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).waitFor();
  }
  async function pin(page,value,confirm) {
    await page.getByLabel('숫자 4자리 비밀번호',{exact:true}).fill(value);
    if(confirm!==undefined)await page.getByLabel('비밀번호 한 번 더').fill(confirm);
  }
  try {
    const first=await pageFor('first');await roster(first);
    await first.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).click();await first.getByLabel('내 이름',{exact:true}).fill('저장학생');await pin(first,'4826','4826');
    await first.getByRole('button',{name:'등록하기',exact:true}).click();await first.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
    assert.equal([...db.rows.keys()].filter(p=>p.includes('/sessions/')).length,0);
    await first.getByRole('button',{name:'친구들 순위',exact:true}).click();await first.getByRole('tab',{name:'우리 반 순위',exact:true}).click();
    await first.getByText('아직 순위 기록이 없어요.',{exact:true}).waitFor();await first.getByRole('button',{name:'게임 선택으로',exact:true}).click();
    const sid=db.rows.get('studentBindings/first').studentId;
    await first.getByRole('heading',{name:'100까지의 수',exact:true}).waitFor();await first.locator('.game-tile').filter({has:first.getByRole('heading',{name:'덧셈과 뺄셈(1)',exact:true})}).getByRole('button',{name:'게임 고르기'}).click();await first.getByRole('button',{name:'시작하기',exact:true}).click();await first.getByText('1 / 50',{exact:true}).waitFor();
    await first.locator('[data-action="digit"][data-value="1"]').click();
    dropSaveResponse=true;await first.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await first.getByRole('heading',{name:'저장을 확인하지 못했어요'}).waitFor();
    await first.getByRole('button',{name:'저장 다시 시도'}).click();await first.getByRole('heading',{name:'저장했어요!'}).waitFor();
    assert.equal(saveRequests.length,2);assert.equal(new Set(saveRequests).size,1);
    await first.getByRole('button',{name:'저장하고 로그아웃'}).click();await first.getByRole('button',{name:'학급 참여하기',exact:true}).waitFor();
    const second=await pageFor('second');await roster(second);await second.locator(`[data-action="choose-student"][data-id="${sid}"]`).click();await pin(second,'4826');
    await second.getByRole('button',{name:'들어가기',exact:true}).click();await second.getByRole('button',{name:'이어서 하기',exact:true}).click();
    await second.getByText('1 / 50',{exact:true}).waitFor();assert.equal(await second.locator('#answer-display').textContent(),'1');
    const sessionPath=[...db.rows.keys()].find(p=>p.includes('/sessions/')&&!p.includes('/answers/')),answer=db.rows.get(sessionPath).questionsJson;
    const expected=JSON.parse(answer)[0].answer;
    await second.getByRole('button',{name:'지우기',exact:true}).click();await second.keyboard.type(String(expected));
    dropAnswerResponse=true;await second.getByRole('button',{name:'확인',exact:true}).click();await second.getByText('답을 확인하지 못했어요. 같은 답으로 다시 시도해 주세요.').waitFor();
    await second.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await second.getByRole('heading',{name:'저장했어요!'}).waitFor();
    await second.getByRole('button',{name:'이어서 하기',exact:true}).click();await second.getByRole('heading',{name:'맞았어요! 별 하나!'}).waitFor();
    await second.getByRole('button',{name:'다음 문제',exact:true}).click();await second.getByText('2 / 50',{exact:true}).waitFor();
    await second.locator('[data-action="digit"][data-value="7"]').click();await second.reload();
    await second.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();await second.getByRole('button',{name:'이어서 하기',exact:true}).click();
    assert.equal(await second.locator('#answer-display').textContent(),'7');
    failSaveBefore=true;await second.getByRole('button',{name:'게임 선택으로',exact:true}).click();await second.getByRole('heading',{name:'저장을 확인하지 못했어요'}).waitFor();
    await second.getByRole('button',{name:'저장 다시 시도'}).click();await second.getByRole('heading',{name:'어떤 게임을 할까요?'}).waitFor();
    await mkdir(resolve(root,'.cp5-test-artifacts/checkpoint-b'),{recursive:true});
    await second.screenshot({path:resolve(root,'.cp5-test-artifacts/checkpoint-b/game-portal.png'),fullPage:true});
    assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const teacher=await pageFor('teacher');await teacher.goto(`${origin}/game/teacher/index.html`);await teacher.getByRole('tab',{name:/학생 기록/}).click();
    await teacher.getByLabel('학생 선택').selectOption(sid);await teacher.getByRole('button',{name:/중간 저장 · 이어하기 가능/}).click();
    await teacher.locator('.question').first().waitFor();
    assert.equal(await teacher.locator('.question').count(),1);
    const third=await pageFor('third');await roster(third);await third.locator(`[data-action="choose-student"][data-id="${sid}"]`).click();await pin(third,'4826');
    await third.getByRole('button',{name:'들어가기',exact:true}).click();await third.getByRole('button',{name:'이어서 하기',exact:true}).click();
    await third.getByText('2 / 50',{exact:true}).waitFor();assert.equal(await third.locator('#answer-display').textContent(),'7');
    await third.screenshot({path:resolve(root,'.cp5-test-artifacts/checkpoint-b/resumed-game.png'),fullPage:true});
    for(let index=2;index<=50;index++) {
      if(index===5) {
        const q=JSON.parse(db.rows.get(sessionPath).questionsJson)[4],pair=[[0,1],[0,2],[1,2]].find(([a,b])=>q.operands[a]+q.operands[b]===10);
        for(const n of pair)await third.locator(`[data-action="card"][data-index="${n}"]`).click();
        await third.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await third.getByRole('button',{name:'이어서 하기',exact:true}).click();
        await third.locator('.card-choice[aria-pressed="true"]').first().waitFor();
        assert.equal(await third.locator('.card-choice[aria-pressed="true"]').count(),2);
        await third.getByRole('button',{name:'고른 카드 확인'}).click();await third.getByRole('heading',{name:'좋은 짝을 골랐어요!'}).waitFor();
        await third.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await third.getByRole('button',{name:'이어서 하기',exact:true}).click();
        await third.getByRole('button',{name:'이제 합을 입력할게요'}).click();await third.locator('[data-action="digit"][data-value="1"]').click();
        await third.getByRole('button',{name:'게임 선택으로',exact:true}).click();await third.getByRole('button',{name:'이어서 하기',exact:true}).click();
        assert.equal(await third.locator('#answer-display').textContent(),'1');
      }
      await third.getByRole('button',{name:'문제 건너뛰기',exact:true}).click();await third.getByRole('button',{name:'건너뛰기 확정'}).click();
      await third.getByRole('button',{name:index===50?'결과 보기':'다음 문제',exact:true}).click();
      if(index%10===0&&index<50)await third.getByRole('button',{name:'계속 풀기',exact:true}).click();
    }
    await third.getByRole('heading',{name:'최종 스테이지',exact:true}).waitFor();
    await third.getByRole('button',{name:'10분 도전 시작'}).click();
    const finalRaw=()=>unpackFinal(db.rows.get(sessionPath).finalStage);
    async function answerFinal(p){
      let q=finalRaw().question;
      if(q.step==='pair'){for(const i of q.validPairs[0])await p.locator('[data-action="final-card"][data-index="'+i+'"]').click();await p.locator('[data-action="final-answer"]').click();await p.getByText('좋은 짝이에요! 이제 세 수의 합을 입력해요.').waitFor();}
      q=finalRaw().question;await p.locator('[data-action="final-clear"]').click();await p.keyboard.type(String(q.answer));await p.locator('[data-action="final-answer"]').click();await p.getByRole('heading',{name:'맞았어요! 별 하나!',exact:true}).waitFor();await p.locator('[data-action="final-next"]').click();
    }
    await answerFinal(third);
    if(finalRaw().question.step==='pair')await third.locator('[data-action="final-card"][data-index="0"]').click();else await third.locator('[data-action="final-digit"][data-value="1"]').click();
    dropFinal=true;await third.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await third.getByText('서버 응답을 확인하지 못했어요.',{exact:false}).waitFor();
    await third.getByRole('button',{name:'저장하고 쉬기',exact:true}).click();await third.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();assert.equal(finalRequests[0],finalRequests[1]);
    const savedFinal=structuredClone(finalRaw());assert.ok(savedFinal.remainingMs>0&&savedFinal.remainingMs<600000);
    await third.getByRole('button',{name:'저장하고 로그아웃'}).click();
    const fourth=await pageFor('fourth');await roster(fourth);await fourth.locator('[data-action="choose-student"][data-id="'+sid+'"]').click();await pin(fourth,'4826');await fourth.getByRole('button',{name:'들어가기',exact:true}).click();
    await fourth.getByRole('button',{name:'최종 스테이지',exact:true}).click();await fourth.getByRole('heading',{name:'최종 스테이지를 저장했어요!'}).waitFor();
    assert.equal(finalRaw().remainingMs,savedFinal.remainingMs);assert.equal(finalRaw().score,10);
    await fourth.getByRole('button',{name:'남은 시간부터 이어하기'}).click();
    await fourth.locator('[data-action="final-answer"]').waitFor();
    if(savedFinal.question.step==='pair')assert.equal(await fourth.locator('.card-choice[aria-pressed="true"]').count(),1);else assert.equal(await fourth.locator('#final-answer-display').textContent(),'1');
    // Clear an unfinished card selection before answering the restored task.
    if(savedFinal.question.step==='pair')await fourth.locator('[data-action="final-card"][data-index="0"]').click();
    await answerFinal(fourth);await answerFinal(fourth);
    const row=db.rows.get(sessionPath);row.finalStage.runningSince-=600001;
    await fourth.reload();await fourth.getByRole('button',{name:'최종 스테이지',exact:true}).click();await fourth.getByRole('heading',{name:'최종 스테이지 완료!'}).waitFor();
    assert.equal(finalRaw().score,30);await fourth.getByText('합산: 40점',{exact:false}).waitFor();
    assert.equal((await h.getTeacherLeaderboard({classId:cls.classId,seasonId:row.seasonId},'teacher')).entries[0].score,40);
    await fourth.screenshot({path:resolve(root,'.cp5-test-artifacts/final-stage/browser-complete.png'),fullPage:true});
    await fourth.getByRole('button',{name:'학습 결과 보기'}).click();
    await fourth.getByText('서버 저장 완료').waitFor();await fourth.getByText('순위 반영 완료').waitFor();assert.equal(JSON.parse(db.rows.get(sessionPath).questionsJson).filter(q=>q.firstCorrect).length,1);
    await fourth.getByRole('button',{name:'처음 화면',exact:true}).click();await fourth.getByRole('button',{name:'게임 고르기'}).waitFor();assert.equal(await fourth.getByRole('button',{name:'이어서 하기',exact:true}).count(),0);
    await teacher.getByRole('button',{name:'새로고침',exact:true}).click();await teacher.getByRole('tab',{name:/학생 기록/}).click();await teacher.getByLabel('학생 선택').selectOption(sid);
    await teacher.getByRole('button',{name:/1번째 기록 · 40점 · 완료/}).click();await teacher.locator('.question').nth(49).waitFor();assert.equal(await teacher.locator('.question').count(),53);
    assert.equal([...db.rows.keys()].filter(p=>p.includes('/sessions/')&&!p.includes('/answers/')&&!p.includes('/finalAnswers/')).length,1);
  } finally {await Promise.all(contexts.map(c=>c.close()));await browser.close();}
  assert.deepEqual(errors,[]);
});
