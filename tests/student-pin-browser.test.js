import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {handleRequest} from '../worker/src/index.js';
import {MemoryDb, fixtureEnv} from './sheets-fakes.js';

test('Chromium registration, duplicate names, PIN rejection, new devices, teacher change/reset and safe recovery', {timeout:180000},async()=>{
  const root=resolve(import.meta.dirname,'..'),db=new MemoryDb(),env=fixtureEnv(),h=createHandlers(db,env.MATH3_SERVER_SECRET);
  await h.createTeacherSpace({requestId:crypto.randomUUID()},'teacher');
  const cls=await h.createClass({privateLabel:'PIN 화면검증반',requestId:crypto.randomUUID()},'teacher');
  const origin='https://subsubt.github.io',worker=new URL(env.GOOGLE_REDIRECT_URI).origin;
  const config={apiKey:'mock',projectId:'math3-dev',authDomain:'math3-dev.firebaseapp.com',appId:'mock',workerApiOrigin:worker};
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}),errors=[],contexts=[],pinSetupRequests=[];
  let dropPinSetupResponse=false;
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
      const res=await handleRequest(req,env,{database:db,verifyToken:async token=>({sub:token}),reportError:d=>errors.push(`Worker ${d.stage}`)});
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
    await first.getByRole('button',{name:'처음 왔어요 · 새 이름 등록'}).click();
    await first.getByLabel('내 이름',{exact:true}).fill('같은이름');await pin(first,'4826','4827');
    await first.getByRole('button',{name:'등록하기',exact:true}).click();await first.getByText('숫자 4개를 입력하고, 두 번 같은지 확인해 주세요.').waitFor();
    assert.equal([...db.rows.keys()].filter(p=>p.startsWith('studentBindings/')).length,0);
    await first.getByLabel('내 이름',{exact:true}).fill('같은이름');await pin(first,'4826','4826');
    await first.getByRole('button',{name:'등록하기',exact:true}).click();await first.getByText('내 이름: 같은이름',{exact:true}).waitFor();
    assert.equal(await first.getByText('1 / 50',{exact:true}).count(),0);
    const sid=db.rows.get('studentBindings/first').studentId;
    await h.requestJoin({code:cls.code,privateName:'같은이름',pin:'9153',pinConfirm:'9153',requestId:crypto.randomUUID()},'peer');
    const second=await pageFor('second');await roster(second);
    assert.equal(await second.locator('.student-choices button').count(),2);
    const labels=await second.locator('.student-choices button').allTextContents();assert.notEqual(labels[0],labels[1]);
    await mkdir(resolve(root,'.cp5-test-artifacts/checkpoint-a'),{recursive:true});
    await second.screenshot({path:resolve(root,'.cp5-test-artifacts/checkpoint-a/student-login.png'),fullPage:true});
    await second.locator(`[data-action="choose-student"][data-id="${sid}"]`).click();await pin(second,'0000');
    await second.getByRole('button',{name:'들어가기',exact:true}).click();await second.getByText(/비밀번호를 확인해 주세요/).waitFor();
    await pin(second,'4826');await second.getByRole('button',{name:'들어가기',exact:true}).click();await second.getByText('내 이름: 같은이름',{exact:true}).waitFor();
    await first.reload();await first.getByRole('button',{name:'학급 참여하기',exact:true}).waitFor();
    const teacher=await pageFor('teacher');await teacher.goto(`${origin}/game/teacher/index.html`);
    await teacher.getByRole('tab',{name:/학생 2/}).click();
    await teacher.locator(`[data-action="pin-student"][data-id="${sid}"]`).click();
    await teacher.getByText('기존 PIN은 확인할 수 없습니다. 변경하면 현재 접속이 해제됩니다.').waitFor();
    await teacher.getByLabel('새 숫자 4자리 PIN').fill('5702');await teacher.getByLabel('새 PIN 확인').fill('5702');
    await teacher.getByRole('button',{name:'새 PIN 저장',exact:true}).click();await teacher.getByText(/새 PIN을 저장했습니다/).waitFor();
    assert.equal(db.rows.get('studentBindings/second').active,false);
    const third=await pageFor('third');await roster(third);await third.locator(`[data-action="choose-student"][data-id="${sid}"]`).click();
    await pin(third,'4826');await third.getByRole('button',{name:'들어가기',exact:true}).click();await third.getByText(/비밀번호를 확인해 주세요/).waitFor();
    await pin(third,'5702');await third.getByRole('button',{name:'들어가기',exact:true}).click();await third.getByText('내 이름: 같은이름',{exact:true}).waitFor();
    const local=await third.evaluate(()=>Object.values(localStorage));assert.ok(!local.some(value=>value.includes('5702')));
    await teacher.locator(`[data-action="pin-student"][data-id="${sid}"]`).click();teacher.once('dialog',d=>d.accept());
    await teacher.getByRole('button',{name:'PIN 초기화',exact:true}).click();await teacher.getByText(/PIN을 초기화했습니다/).waitFor();
    const fourth=await pageFor('fourth');await roster(fourth);await fourth.locator(`[data-action="choose-student"][data-id="${sid}"]`).click();
    await fourth.getByText(/기존 기록을 보호하고 있어요/).waitFor();assert.equal(await fourth.locator('#student-pin').count(),0);
    teacher.once('dialog',d=>d.accept());await teacher.locator(`[data-action="ticket"][data-id="${sid}"]`).click();
    await teacher.getByText('복귀 티켓을 발급했습니다.',{exact:true}).waitFor();
    const ticket=await teacher.locator('.notice .key code').textContent();
    await fourth.getByRole('button',{name:'다른 이름 선택'}).click();await fourth.getByRole('button',{name:'학급 코드 다시 입력'}).click();
    await fourth.getByText('선생님께 복귀 코드를 받았어요',{exact:true}).click();
    await fourth.getByLabel('일회용 복귀 코드',{exact:true}).fill(ticket);
    await fourth.getByRole('button',{name:'기존 기록 찾기'}).click();await fourth.getByText(/학생의 기존 기록을 찾았어요/).waitFor();
    dropPinSetupResponse=true;
    await pin(fourth,'6730','6730');await fourth.getByRole('button',{name:'비밀번호 저장',exact:true}).click();
    await fourth.getByText('연결을 확인하지 못했어요. 잠시 후 다시 해 보세요.',{exact:true}).waitFor();
    await pin(fourth,'6731','6731');await fourth.getByRole('button',{name:'비밀번호 저장',exact:true}).click();
    await fourth.getByText(/이미 등록한 비밀번호가 있어요/).waitFor();
    await pin(fourth,'6730','6730');await fourth.getByRole('button',{name:'비밀번호 저장',exact:true}).click();
    await fourth.getByText('내 이름: 같은이름',{exact:true}).waitFor();assert.equal(db.rows.get('studentBindings/fourth').studentId,sid);
    assert.equal(JSON.stringify([...db.rows.values()]).includes('"6730"'),false);
    assert.equal(pinSetupRequests.length,3);assert.equal(new Set(pinSetupRequests).size,1);
  } finally { await Promise.all(contexts.map(c=>c.close()));await browser.close(); }
  assert.deepEqual(errors,[]);
});
