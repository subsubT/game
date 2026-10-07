import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { chromium } from 'playwright';
import { handleRequest } from '../worker/src/index.js';
import { createHandlers } from '../worker/src/generated-handlers.js';
import { MemoryDb,fixtureEnv,FakeGoogle } from './sheets-fakes.js';

test('Chromium teacher Google opt-in preserves uid/classes, handles Sheets failure, reconnects and disconnects', {timeout:90000}, async()=>{
  const root=resolve(import.meta.dirname,'..'),env=fixtureEnv(),db=new MemoryDb(),google=new FakeGoogle();
  let mockTime=Date.now(),failStatusOnce=false;
  const handlers=createHandlers(db,env.MATH3_SERVER_SECRET);
  const space=await handlers.createTeacherSpace({requestId:crypto.randomUUID()},'browser-teacher');
  const cls=await handlers.createClass({privateLabel:'선택 연동반',requestId:crypto.randomUUID()},'browser-teacher');
  const worker=new URL(env.GOOGLE_REDIRECT_URI).origin,origin='https://subsubt.github.io';
  const config={apiKey:'mock',projectId:'math3-dev',authDomain:'math3-dev.firebaseapp.com',appId:'mock',workerApiOrigin:worker,enableGoogleProvider:true};
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await context.route('https://www.gstatic.com/firebasejs/**',async route=>{
      const auth=`export const browserLocalPersistence={};export const GoogleAuthProvider=class{};export const getAuth=()=>({currentUser:{uid:'browser-teacher',get isAnonymous(){return !localStorage.linked;},getIdToken:async()=>localStorage.linked?'linked-teacher':'anonymous-teacher'}});export const setPersistence=async()=>{};export const linkWithPopup=async(user)=>{localStorage.linked='yes';localStorage.originalUid=user.uid;};export const signInAnonymously=async()=>{};export const signInWithPopup=async()=>{};`;
      await route.fulfill({status:200,contentType:'text/javascript',body:route.request().url().endsWith('firebase-app.js')?'export const initializeApp=()=>({});':auth});
    });
    await context.route(`${origin}/game/**`,async route=>{
      const path=new URL(route.request().url()).pathname.slice('/game/'.length);
      if(path==='firebase-config.js'){await route.fulfill({contentType:'text/javascript',body:`globalThis.MATH3_FIREBASE_CONFIG=${JSON.stringify(config)}`});return;}
      const file=resolve(root,path);if(!file.startsWith(root))throw Error('outside root');
      await route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)],body:await readFile(file)});
    });
    await context.route(`${worker}/**`,async route=>{
      if(failStatusOnce&&new URL(route.request().url()).pathname==='/api/getGoogleConnectionStatus'&&route.request().method()==='POST'){
        failStatusOnce=false;await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify({error:{code:'GOOGLE_UNAVAILABLE'}})});return;
      }
      const r=route.request(),req=new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),body:r.method()==='POST'?r.postData():undefined});
      const res=await handleRequest(req,env,{database:db,clock:()=>mockTime,googleApi:google,verifyGoogleIdentity:async()=>google.subject,verifyToken:async token=>({sub:'browser-teacher',firebase:token==='linked-teacher'?{identities:{'google.com':[google.subject]}}:{}})});
      // Playwright bypasses routes for automatic HTTP redirect hops. A test-only
      // meta navigation re-enters routing while retaining the top-level cookie.
      if(res.status===303){const headers=Object.fromEntries(res.headers);delete headers.location;headers['content-type']='text/html';await route.fulfill({status:200,headers,body:`<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${res.headers.get('location').replaceAll('&','&amp;')}"></head><body>OAuth test navigation</body></html>`});}
      else await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()});
    });
    await context.route('https://accounts.google.com/o/oauth2/v2/auth?**',async route=>{
      const url=new URL(route.request().url());assert.equal(url.searchParams.get('scope'),'openid https://www.googleapis.com/auth/drive.file');
      await route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${env.GOOGLE_REDIRECT_URI}?state=${url.searchParams.get('state')}&amp;code=${crypto.randomUUID()}"></head><body>Google consent test</body></html>`});
    });
    await page.goto(env.GOOGLE_DASHBOARD_URL);
    await page.getByText('연결 안 됨',{exact:true}).waitFor();
    await page.getByRole('tab',{name:/승인 대기/}).click();await page.getByText('참여 신청을 기다리는 학생이 없습니다.').waitFor();
    await page.getByRole('button',{name:'Google 연결',exact:true}).click();
    try { await page.getByText('Google 연결이 완료되었습니다.',{exact:false}).waitFor(); }
    catch { const url=new URL(page.url());throw Error(`OAuth UI stopped at ${url.origin}${url.pathname}: ${await page.content()}`); }
    assert.equal(await page.evaluate(()=>localStorage.originalUid),'browser-teacher');
    assert.equal(db.rows.get(`classes/${cls.classId}`).ownerTeacherId,space.teacherId);
    await page.getByRole('button',{name:'이 학급 관리표 만들기'}).click();await page.getByText('학급 관리표 동기화를 완료했습니다.').waitFor();
    assert.equal(google.creates,1);await page.getByRole('link',{name:/스프레드시트 열기/}).waitFor();
    const originalSheet=await page.getByRole('link',{name:/스프레드시트 열기/}).getAttribute('href');
    failStatusOnce=true;await page.getByRole('button',{name:'새로고침',exact:true}).click();
    await page.getByText('Google 연결 상태를 확인하지 못했습니다.',{exact:true}).waitFor();
    assert.equal(await page.getByText('Google 연동 준비 중',{exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:/스프레드시트 열기/}).count(),0);
    assert.equal(await page.getByRole('tab',{name:/학생 0/}).isEnabled(),true);
    await page.getByRole('button',{name:'연결 상태 다시 확인'}).click();await page.getByText('최근 동기화 완료',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:/스프레드시트 열기/}).getAttribute('href'),originalSheet);assert.equal(google.creates,1);
    await page.getByRole('button',{name:'지금 동기화'}).click();await page.getByText('학급 관리표 동기화를 완료했습니다.').waitFor();assert.equal(google.creates,1);
    google.writeFailure='GOOGLE_UNAVAILABLE';await page.getByRole('button',{name:'지금 동기화'}).click();await page.locator('#message').getByText('게임 기록은 정상 보관됩니다.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'새로고침',exact:true}).click();await page.getByText('동기화 실패',{exact:true}).waitFor();
    await page.getByRole('tab',{name:/학생 0/}).click();await page.getByText('승인된 학생이 없습니다.').waitFor();
    await page.getByRole('button',{name:'Google 연결 해제'}).click();await page.getByRole('group',{name:'Google 연결 해제 확인'}).waitFor();
    assert.equal(google.revoked.length,0);await page.getByRole('button',{name:'계속 연결',exact:true}).click();assert.equal(google.revoked.length,0);
    assert.equal(db.rows.get(`sheetConnections/${space.teacherId}`).status,'connected');
    await page.getByRole('button',{name:'Google 연결 해제'}).click();await page.getByRole('button',{name:'자동 동기화 중지',exact:true}).click();await page.getByText('Google 연결을 해제했습니다.').waitFor();
    await page.getByText('연결 안 됨',{exact:true}).waitFor();assert.equal(google.revoked.length,1);assert.equal(db.rows.has(`sheetConnections/${space.teacherId}`),false);
    mockTime+=11000;google.writeFailure=null;
    await page.getByRole('button',{name:'Google 연결',exact:true}).click();await page.getByText('Google 연결이 완료되었습니다.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'지금 동기화'}).click();await page.getByText('학급 관리표 동기화를 완료했습니다.').waitFor();assert.equal(google.creates,1);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
