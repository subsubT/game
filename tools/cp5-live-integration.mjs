// Interactive development integration runner. Never clicks Google login/consent.
// Static app files are supplied at the authorized Pages origin without publishing.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root=resolve(import.meta.dirname,'..'), artifacts=resolve(root,'.cp5-test-artifacts');
await mkdir(artifacts,{recursive:true});
const evidence={environment:'math3-dev',workerVersion:process.env.MATH3_LIVE_WORKER_VERSION||'84d284a2-9508-4fac-8822-6b3f53660231',checks:[]};
async function stage(value){evidence.stage=value;evidence.updatedAt=new Date().toISOString();await writeFile(resolve(artifacts,'live-status.json'),JSON.stringify(evidence,null,2));console.log(value);}
const origin='https://subsubt.github.io',dashboard=origin+'/game/teacher/index.html';
const allow=new Set(['teacher/index.html','teacher/dashboard.js','teacher/dashboard.css','firebase-config.js','1math3.html','src/student/1math3.css','src/student/1math3.bundle.js']);
const context=await chromium.launchPersistentContext(resolve(artifacts,'live-browser-profile'),{headless:false,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',viewport:{width:1280,height:900},args:['--no-first-run']});
await context.route(origin+'/**',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/game\//,'');
  if(!allow.has(name)){await route.fulfill({status:404,body:''});return;}
  let body=await readFile(resolve(root,name));
  if(name==='firebase-config.js')body=Buffer.from(body.toString()+'\nglobalThis.MATH3_FIREBASE_CONFIG.enableGoogleProvider=true;');
  await route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(name)],body});
});
const page=context.pages()[0]||await context.newPage();
let appErrors=0;page.on('pageerror',()=>appErrors++);
context.on('page',async popup=>{
  try{await popup.waitForURL(url=>url.hostname==='accounts.google.com',{timeout:30000});await stage('USER_GOOGLE_FIREBASE_APPROVAL_REQUIRED');}catch{}
});
async function api(name,data={}){return page.evaluate(async({name,data})=>{
  const {getApp}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
  const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const token=await getAuth(getApp('math3-teacher')).currentUser.getIdToken();
  const r=await fetch(globalThis.MATH3_FIREBASE_CONFIG.workerApiOrigin+'/api/'+name,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({data})});
  const j=await r.json();if(!r.ok)throw Error(j.error?.code||'REQUEST_FAILED');return j.result;
},{name,data});}
async function identity(){return page.evaluate(async()=>{const {getApp}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');const u=getAuth(getApp('math3-teacher')).currentUser;return{uid:u.uid,isAnonymous:u.isAnonymous};});}
try{
  await stage('PREPARING_REAL_DEVELOPMENT_TEACHER');
  await page.goto(dashboard);
  await page.locator('[data-action="create-space"], .class-choice, #create-class').first().waitFor({timeout:60000});
  if(await page.getByRole('button',{name:'관리 공간 만들기'}).count())await page.getByRole('button',{name:'관리 공간 만들기'}).click();
  if(!await page.locator('.class-choice').count()){
    await page.getByLabel('비공개 학급 이름').fill('CP5실제검증반');
    await page.getByRole('button',{name:'학급 만들기'}).click();
  }
  await page.locator('.code').waitFor({timeout:60000});
  // Do not leave the recovery credential visible during the handoff.
  if(await page.getByRole('button',{name:'안전하게 보관했어요'}).count())await page.getByRole('button',{name:'안전하게 보관했어요'}).click();
  const before=await identity(),space=await api('createTeacherSpace',{requestId:crypto.randomUUID()}),classes=await api('listClasses');
  evidence.uidBefore=before.uid;evidence.teacherIdBefore=space.teacherId;evidence.classId=classes.classes[0].classId;
  const status=await api('getGoogleConnectionStatus',{classId:evidence.classId});evidence.initialGoogleStatus=status;assert.equal(status.configured,true);
  evidence.checks.push('LIVE_WORKER_GOOGLE_SECRETS_CONFIGURED','ANONYMOUS_TEACHER_AND_CLASS_CREATED');
  await stage('USER_GOOGLE_FIREBASE_APPROVAL_REQUIRED');
  await page.getByRole('button',{name:'Google 연결',exact:true}).click();
  // All Google authentication and approval actions are performed by the human.
  await page.waitForURL(url=>url.hostname==='accounts.google.com',{timeout:1800000});
  const linked=await identity().catch(()=>null);
  if(linked){assert.equal(linked.uid,before.uid);evidence.checks.push('FIREBASE_LINK_UID_PRESERVED');}
  await stage('USER_GOOGLE_WORKSPACE_APPROVAL_REQUIRED');
  await page.waitForURL(url=>url.origin===origin&&url.pathname==='/game/teacher/index.html',{timeout:1800000});
  const outcome=new URL(page.url()).hash;
  assert.equal(outcome,'#sheets=connected','Workspace OAuth callback must succeed');
  // Redirect chains may bypass Playwright's static route; reload as a fresh request.
  await page.goto(dashboard+outcome);await page.getByRole('button',{name:'이 학급 관리표 만들기'}).waitFor({timeout:60000});
  const after=await identity(),same=await api('createTeacherSpace',{requestId:crypto.randomUUID()}),afterClasses=await api('listClasses');
  assert.equal(after.uid,before.uid);assert.equal(same.teacherId,space.teacherId);assert.ok(afterClasses.classes.some(c=>c.classId===evidence.classId));
  evidence.checks.push('REAL_OAUTH_CALLBACK_TOKEN_EXCHANGE_ENCRYPTED_CONNECTION','UID_TEACHERID_CLASS_PRESERVED');
  await page.getByRole('button',{name:'이 학급 관리표 만들기'}).click();await page.getByRole('link',{name:/스프레드시트 열기/}).waitFor({timeout:120000});
  const first=await api('getGoogleConnectionStatus',{classId:evidence.classId});evidence.sheetUrl=first.sheet.url;
  await api('createOrSelectSheet',{classId:evidence.classId});
  await page.getByRole('button',{name:'지금 동기화'}).click();await page.getByText('학급 관리표 동기화를 완료했습니다.').waitFor({timeout:120000});
  const repeat=await api('getGoogleConnectionStatus',{classId:evidence.classId});assert.equal(repeat.sheet.url,first.sheet.url);
  evidence.checks.push('REAL_DRIVE_SPREADSHEET_CREATED','REPEATED_CREATE_SAME_SPREADSHEET','MANUAL_SYNC_SUCCEEDED');evidence.appErrors=appErrors;
  await stage('CONNECTED_LIVE_SHEETS_READY_FOR_DATA_AND_SECURITY_CHECKS');
  // Keep the authenticated development browser available for the continuation.
  await new Promise(resolve=>context.on('close',resolve));
}catch(error){evidence.failure=String(error.message).match(/^[A-Z_]+$/)?.[0]||'LIVE_ASSERTION_OR_TIMEOUT';evidence.assertion=error.code==='ERR_ASSERTION'?{actual:error.actual,expected:error.expected}:undefined;await stage('LIVE_RUN_NEEDS_ATTENTION');await new Promise(resolve=>context.on('close',resolve));}
