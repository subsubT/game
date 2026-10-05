import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync,sign } from 'node:crypto';
import { createSheetService } from '../worker/src/sheets.js';
import { GoogleApi,GOOGLE_SCOPES } from '../worker/src/google-api.js';
import { FirestoreRest } from '../worker/src/firestore-rest.js';
import { opaque,seal,unseal,pkceChallenge,verifyGoogleIdToken } from '../worker/src/google-crypto.js';
import { literal,buildTables } from '../worker/src/sheet-data.js';
import { handleRequest } from '../worker/src/index.js';
import { createHandlers } from '../worker/src/generated-handlers.js';
import { buildSession,evaluateStep } from '../src/games/1math3/core.js';
import { MemoryDb,fixtureEnv,FakeGoogle } from './sheets-fakes.js';
const tid='a'.repeat(32),cid='c'.repeat(32),sid='d'.repeat(32),other='b'.repeat(32);
test('native fetch is invoked without the adapter receiver in OAuth and scheduled transports',async()=>{
  function strictFetch(url){assert.equal(this,undefined,'native Workers fetch cannot receive an adapter as this');return Promise.resolve(Response.json(url.includes('oauth2.googleapis.com')?{access_token:'test-only',expires_in:3600}:{name:'test',fields:{active:{booleanValue:true}}}));}
  const db=new FirestoreRest('math3-dev','test-only',strictFetch);
  assert.equal((await db.doc('teachers/test').get()).data().active,true);
  const google=new GoogleApi(fixtureEnv(),strictFetch);
  assert.equal((await google.refresh('test-only')).expires_in,3600);
});
test('expired browser OAuth returns only to the fixed dashboard while JSON clients remain rejected',async()=>{
  const f=fixture(),l=await launch(f);f.advance(600001);
  const expired=l.request('expired-test-code'),deps={...f.deps,database:f.db};
  const json=await handleRequest(expired,f.env,deps);assert.equal(json.status,400);assert.equal((await json.json()).error.code,'OAUTH_STATE_INVALID');
  const browser=new Request(expired.url+'&returnUrl=https://attacker.invalid/',{headers:{...Object.fromEntries(expired.headers),accept:'text/html'}});
  const result=await handleRequest(browser,f.env,deps);assert.equal(result.status,303);assert.equal(result.headers.get('location'),f.env.GOOGLE_DASHBOARD_URL+'#sheets=OAUTH_STATE_INVALID');
  assert.equal(f.google.exchanged,undefined);assert.equal(f.db.rows.has(`sheetConnections/${tid}`),false);
  const invalidConfig=await handleRequest(browser,{...f.env,GOOGLE_DASHBOARD_URL:'https://attacker.invalid/'},deps);assert.notEqual(invalidConfig.status,303);
});
function fixture(){
  const db=new MemoryDb(),env=fixtureEnv(),google=new FakeGoogle();let time=Date.now();
  db.rows.set(`teachers/${tid}`,{status:'active',authEpoch:1});db.rows.set('teacherBindings/teacher-a',{teacherId:tid,epoch:1,active:true});
  db.rows.set(`teachers/${other}`,{status:'active',authEpoch:1});db.rows.set('teacherBindings/teacher-b',{teacherId:other,epoch:1,active:true});
  db.rows.set(`classes/${cid}`,{ownerTeacherId:tid,privateLabel:'시험반',globalOptIn:true});
  const deps={googleApi:google,verifyGoogleIdentity:async()=>google.subject,clock:()=>time};
  const service=createSheetService(db,env,deps);
  return {db,env,google,deps,service,advance:ms=>time+=ms};
}
async function launch(f,claims){
  const begin=await f.service.handlers.beginGoogleConnection({},'teacher-a',claims);
  const response=await f.service.start(new Request(begin.authorizationUrl));
  const url=new URL(response.headers.get('location')),cookie=response.headers.get('set-cookie').split(';')[0];
  return {url,cookie,request:(code=opaque(),cookies=cookie)=>new Request(`${f.env.GOOGLE_REDIRECT_URI}?state=${url.searchParams.get('state')}&code=${code}`,{headers:{cookie:cookies}})};
}
async function connect(f,claims){const l=await launch(f,claims);const r=await f.service.callback(l.request());assert.equal(new URL(r.headers.get('location')).hash,'#sheets=connected');return l;}
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);
function addSession(f,n=1){
  const s=buildSession(`sheet-seed-${n}`);s.sessionId=`session-${n}`;s.studentId=sid;s.status='complete';s.mode='regular';s.startedAt=new Date(1700000000000+n*1000).toISOString();s.finishedAt=new Date(1700000001000+n*1000).toISOString();
  for(const q of s.questions){if(q.typeId==='make_ten_then_add')evaluateStep(q,q.validPairs[0]);evaluateStep(q,q.answer);}
  f.db.rows.set(`classes/${cid}/students/${sid}`,{classAlias:'=악성수식',privateName:'내보내면 안 되는 실명',uid:'private-uid',status:'active'});
  f.db.rows.set(`classes/${cid}/sessions/session-${n}`,{...s,questions:undefined,questionsJson:JSON.stringify(s.questions)});return s;
}

test('AES-GCM ciphertext is randomized, context-bound, authenticated and uses an independent key',()=>{
  const key=opaque(),a=seal('private-refresh-token',key,'teacher:a:1'),b=seal('private-refresh-token',key,'teacher:a:1');
  assert.notEqual(a,b);assert.ok(!a.includes('private-refresh-token'));assert.equal(unseal(a,key,'teacher:a:1'),'private-refresh-token');
  for(const [cipher,k,ctx] of [[a,opaque(),'teacher:a:1'],[a,key,'teacher:b:1'],[a,key,'teacher:a:2'],[a.slice(0,-2)+'AA',key,'teacher:a:1']])assert.throws(()=>unseal(cipher,k,ctx));
  assert.throws(()=>seal('x','short','ctx'));
});

test('AES-256 key accepts canonical encodings of the same 32 bytes and refuses malformed keys',()=>{
  const key=opaque(),bytes=Buffer.from(key,'base64url'),envelope=seal('encoding-round-trip',key,'test');
  for(const encoded of [bytes.toString('base64'),bytes.toString('hex'),key+'=',`\n${bytes.toString('base64')}\r\n`])assert.equal(unseal(envelope,encoded,'test'),'encoding-round-trip');
  for(const bad of ['passphrase','z'.repeat(64),'!'.repeat(43),Buffer.alloc(31).toString('base64'),Buffer.alloc(33).toString('base64')])assert.throws(()=>seal('x',bad,'test'));
});
test('Google subject verifier validates RSA signature, audience, issuer, lifetime and nonce',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'sheet-test-key'};
  const claims={iss:'https://accounts.google.com',aud:'test-client',sub:'verified-subject',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,nonce:'nonce'};
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const jwt=(c=claims,key=privateKey)=>{const text=`${encode({alg:'RS256',kid:jwk.kid})}.${encode(c)}`;return `${text}.${sign('RSA-SHA256',Buffer.from(text),key).toString('base64url')}`;};
  const fetcher=async()=>Response.json({keys:[jwk]});
  assert.equal(await verifyGoogleIdToken(jwt(),'test-client','nonce',fetcher),'verified-subject');
  for(const c of [{...claims,aud:'other'},{...claims,iss:'https://attacker.invalid'},{...claims,exp:1},{...claims,nonce:'wrong'},{...claims,sub:''},{...claims,azp:'other'}])await rejects(verifyGoogleIdToken(jwt(c),'test-client','nonce',fetcher),'GOOGLE_IDENTITY_INVALID');
  const wrong=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;await rejects(verifyGoogleIdToken(jwt(claims,wrong),'test-client','nonce',fetcher),'GOOGLE_IDENTITY_INVALID');
});
test('authorization uses only openid + drive.file, offline, S256 PKCE and an HttpOnly first-party cookie',async()=>{
  const f=fixture(),l=await launch(f);
  assert.equal(l.url.searchParams.get('scope'),GOOGLE_SCOPES.join(' '));assert.equal(l.url.searchParams.get('access_type'),'offline');assert.equal(l.url.searchParams.get('code_challenge_method'),'S256');assert.ok(l.cookie.startsWith('__Host-math3-oauth='));
  assert.equal(new URL((await f.service.callback(l.request())).headers.get('location')).hash,'#sheets=connected');
  assert.equal(pkceChallenge(f.google.exchanged.verifier),l.url.searchParams.get('code_challenge'));
  assert.ok(!JSON.stringify([...f.db.rows]).includes(f.google.refreshValue));
});
test('OAuth state requires its initiating browser and can be consumed only once (including concurrent callbacks)',async()=>{
  const f=fixture(),l=await launch(f);
  await rejects(f.service.callback(l.request('code','')),'OAUTH_STATE_INVALID');
  await rejects(f.service.callback(l.request('code','__Host-math3-oauth='+opaque())),'OAUTH_STATE_INVALID');
  const results=await Promise.allSettled([f.service.callback(l.request('same-code')),f.service.callback(l.request('same-code'))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'OAUTH_STATE_INVALID');
});
test('expired state, unstarted state and reused launch ticket are refused',async()=>{
  const f=fixture(),begin=await f.service.handlers.beginGoogleConnection({},'teacher-a');
  const state=[...f.db.rows].find(([p])=>p.startsWith('googleOAuthStates/'))[1];
  // Unstarted callback has no valid cookie and cannot consume a grant.
  await rejects(f.service.callback(new Request(`${f.env.GOOGLE_REDIRECT_URI}?state=${opaque()}&code=x`)),'OAUTH_STATE_INVALID');
  await f.service.start(new Request(begin.authorizationUrl));await rejects(f.service.start(new Request(begin.authorizationUrl)),'OAUTH_STATE_INVALID');
  f.advance(600001);assert.ok(state.expiresAt);await rejects(f.service.start(new Request(begin.authorizationUrl)),'OAUTH_STATE_INVALID');
  const g=fixture(),fresh=await g.service.handlers.beginGoogleConnection({},'teacher-a');g.advance(600001);await rejects(g.service.start(new Request(fresh.authorizationUrl)),'OAUTH_STATE_INVALID');
});
test('Google rejects an incorrect PKCE verifier and failed exchanges cannot be replayed',async()=>{
  const f=fixture(),l=await launch(f);f.google.exchangeFailure='REAUTH_REQUIRED';
  const response=await f.service.callback(l.request('pkce-rejected-code'));assert.equal(new URL(response.headers.get('location')).hash,'#sheets=REAUTH_REQUIRED');assert.equal(f.db.rows.has(`sheetConnections/${tid}`),false);
  await rejects(f.service.callback(l.request('pkce-rejected-code')),'OAUTH_STATE_INVALID');
});
test('callback expiry, recovery epoch and inactive teacher bindings invalidate pending authorizations',async()=>{
  for(const mutation of [f=>f.advance(600001),f=>f.db.rows.get(`teachers/${tid}`).authEpoch++,f=>f.db.rows.get('teacherBindings/teacher-a').active=false]){
    const f=fixture(),l=await launch(f);mutation(f);await assert.rejects(f.service.callback(l.request()));assert.equal(f.google.exchanged,undefined);
  }
});
test('arbitrary return URLs and callback hosts cannot redirect or access a teacher',async()=>{
  const f=fixture();await rejects(f.service.handlers.beginGoogleConnection({returnUrl:'https://evil.invalid'},'teacher-a'),'INVALID_RETURN_URL');
  const response=await handleRequest(new Request('https://evil.invalid/oauth/google/callback?state='+opaque()),f.env,{database:f.db,...f.deps});assert.equal(response.status,403);assert.equal(response.headers.get('location'),null);
});
test('a Google subject mismatch or cross-teacher subject collision never changes teacherId or class ownership',async()=>{
  const f=fixture(),l=await launch(f,{firebase:{identities:{'google.com':['expected-subject']}}});
  assert.equal(new URL((await f.service.callback(l.request())).headers.get('location')).hash,'#sheets=GOOGLE_ACCOUNT_MISMATCH');assert.equal(f.db.rows.get(`classes/${cid}`).ownerTeacherId,tid);
  const g=fixture();await connect(g);g.advance(11000);
  const start=await g.service.handlers.beginGoogleConnection({},'teacher-b'),r=await g.service.start(new Request(start.authorizationUrl)),url=new URL(r.headers.get('location'));
  const response=await g.service.callback(new Request(`${g.env.GOOGLE_REDIRECT_URI}?state=${url.searchParams.get('state')}&code=${opaque()}`,{headers:{cookie:r.headers.get('set-cookie').split(';')[0]}}));
  assert.equal(new URL(response.headers.get('location')).hash,'#sheets=GOOGLE_ACCOUNT_CONFLICT');assert.equal(g.db.rows.has(`sheetConnections/${other}`),false);
});
test('authorization code replay is rejected across distinct states',async()=>{
  const f=fixture(),l=await launch(f);await f.service.callback(l.request('one-code'));f.advance(11000);const second=await launch(f);await rejects(f.service.callback(second.request('one-code')),'OAUTH_CODE_REPLAY');
});
test('consent denial is consumed and returns only an allowed dashboard + safe error',async()=>{
  const f=fixture(),l=await launch(f);const req=new Request(`${f.env.GOOGLE_REDIRECT_URI}?state=${l.url.searchParams.get('state')}&error=access_denied&error_description=secret` ,{headers:{cookie:l.cookie}});
  const r=await f.service.callback(req);assert.equal(r.headers.get('location'),f.env.GOOGLE_DASHBOARD_URL+'#sheets=GOOGLE_CONSENT_DENIED');assert.equal(f.google.exchanged,undefined);await rejects(f.service.callback(req),'OAUTH_STATE_INVALID');
});
test('Google token refresh and revoke use POST bodies; API failures are sanitized',async()=>{
  const env=fixtureEnv(),seen=[];
  const api=new GoogleApi(env,async(url,opts)=>{seen.push({url,opts});return url.endsWith('/revoke')?new Response('',{status:200}):Response.json({access_token:'fake-access',expires_in:3600});});
  await api.exchange('code','verifier');await api.refresh('refresh-private');await api.revoke('refresh-private');
  assert.equal(seen[0].opts.body.get('code_verifier'),'verifier');assert.equal(seen[0].opts.body.get('redirect_uri'),env.GOOGLE_REDIRECT_URI);
  assert.equal(seen[1].opts.body.get('grant_type'),'refresh_token');assert.ok(seen.every(r=>!r.url.includes('refresh-private')));
  const bad=new GoogleApi(env,async()=>Response.json({error:'invalid_grant',error_description:'private-token'},{status:400}));await rejects(bad.refresh('fake'),'REAUTH_REQUIRED');
});
test('connection status is scoped to the teacher and never returns credentials or Google identity',async()=>{
  const f=fixture();await connect(f);
  const state=await f.service.handlers.getGoogleConnectionStatus({classId:cid},'teacher-a');assert.equal(state.connected,true);
  const text=JSON.stringify(state);for(const secret of [f.google.refreshValue,f.google.accessValue,f.env.GOOGLE_CLIENT_SECRET,f.google.subject,tid])assert.ok(!text.includes(secret));
  await rejects(f.service.handlers.getGoogleConnectionStatus({classId:cid},'teacher-b'),'FORBIDDEN');
  await rejects(f.service.handlers.createOrSelectSheet({classId:cid},'teacher-b'),'FORBIDDEN');
  await rejects(f.service.handlers.syncSheet({classId:cid},'teacher-b'),'FORBIDDEN');
});
test('refresh failure reports REAUTH_REQUIRED without deleting or changing the learning ledger',async()=>{
  const f=fixture();addSession(f);await connect(f);f.google.refreshFailure='REAUTH_REQUIRED';const original=structuredClone(f.db.rows.get(`classes/${cid}/sessions/session-1`));
  await rejects(f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'),'REAUTH_REQUIRED');
  const status=await f.service.handlers.getGoogleConnectionStatus({},'teacher-a');assert.equal(status.reauthRequired,true);assert.deepEqual(f.db.rows.get(`classes/${cid}/sessions/session-1`),original);assert.ok(!f.db.rows.get(`sheetConnections/${tid}`).refreshCipher);
});
test('spreadsheet creation and repeated full rewrites produce one file and deterministic nonduplicated rows',async()=>{
  const f=fixture();addSession(f);addSession(f,2);await connect(f);
  await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');const first=structuredClone(f.google.last);
  await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');await f.service.handlers.syncSheet({classId:cid},'teacher-a');assert.equal(f.google.creates,1);assert.deepEqual(f.google.last,first);
  assert.equal(first.tables['学生요약'],undefined);assert.equal(first.tables['학생요약'].length,2);assert.equal(first.tables['회차'].length,3);assert.equal(first.tables['문항'].length,101);
  assert.equal(new Set(first.tables['문항'].slice(1).map(r=>r[9])).size,100);
  const text=JSON.stringify(first.tables);for(const secret of ['내보내면 안 되는 실명','private-uid',tid,sid,f.env.MATH3_SERVER_SECRET,f.google.refreshValue])assert.ok(!text.includes(secret));
  assert.equal(first.tables['회차'][1][2],"'=악성수식");
});
test('lost creation response reconnects via appProperties search and never blindly creates again',async()=>{
  const f=fixture();await connect(f);f.google.lostCreateResponse=true;
  await rejects(f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'),'GOOGLE_UNAVAILABLE');
  await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');assert.equal(f.google.creates,1);
  const g=fixture();await connect(g);g.google.lostCreateResponse=true;await assert.rejects(g.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'));g.google.files.clear();
  await rejects(g.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'),'SHEET_CREATE_UNCERTAIN');assert.equal(g.google.creates,1);
});
test('definitive creation permission denial can retry after correction; crashed leases become actionable',async()=>{
  const f=fixture();await connect(f);f.google.createFailure='GOOGLE_ACCESS_DENIED';await rejects(f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'),'GOOGLE_ACCESS_DENIED');
  assert.equal(f.db.rows.get(`sheetExports/${cid}`).createUncertain,false);f.google.createFailure=null;await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');assert.equal(f.google.creates,1);
  f.db.rows.get(`sheetExports/${cid}`).status='syncing';f.db.rows.get(`sheetExports/${cid}`).leaseUntil=1;assert.equal((await f.service.handlers.getGoogleConnectionStatus({classId:cid},'teacher-a')).sheet.status,'failed');
});
test('duplicate Drive metadata results and concurrent sync requests fail safely without deleting files',async()=>{
  const f=fixture();await connect(f);f.google.duplicates=true;await rejects(f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a'),'SHEET_DUPLICATES');assert.equal(f.google.creates,0);
  const g=fixture();await connect(g);await g.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');
  let release,entered;const barrier=new Promise(r=>entered=r);g.google.beforeWrite=async()=>{entered();await new Promise(r=>release=r);};
  const first=g.service.handlers.syncSheet({classId:cid},'teacher-a');await barrier;await rejects(g.service.handlers.syncSheet({classId:cid},'teacher-a'),'SYNC_BUSY');release();await first;
});
test('disconnect forgets credentials, revokes server-side, hides old sheet URL and cancels pending OAuth',async()=>{
  const f=fixture();await connect(f);await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');f.advance(11000);const pending=await launch(f);
  const result=await f.service.handlers.disconnectSheets({},'teacher-a');assert.equal(result.connected,false);assert.deepEqual(f.google.revoked,[f.google.refreshValue]);assert.equal(f.db.rows.has(`sheetConnections/${tid}`),false);
  assert.equal((await f.service.handlers.getGoogleConnectionStatus({classId:cid},'teacher-a')).sheet,null);assert.ok(f.db.rows.get(`sheetExports/${cid}`).spreadsheetId);await rejects(f.service.callback(pending.request()),'OAUTH_STATE_INVALID');
});
test('revocation failure forgets local token and asks only for Google account permission cleanup',async()=>{
  const f=fixture();await connect(f);f.google.revokeFailure=true;assert.equal((await f.service.handlers.disconnectSheets({},'teacher-a')).revocationPending,true);assert.equal(f.db.rows.has(`sheetConnections/${tid}`),false);
});
test('reauthorization restores the same teacher and same file; recovery hides prior exports',async()=>{
  const f=fixture();await connect(f);await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');const file=f.google.last.id;
  await f.service.handlers.disconnectSheets({},'teacher-a');f.advance(11000);await connect(f);await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');assert.equal(f.google.last.id,file);assert.equal(f.google.creates,1);
  f.db.rows.get(`teachers/${tid}`).authEpoch=2;f.db.rows.get('teacherBindings/teacher-a').epoch=2;
  const state=await f.service.handlers.getGoogleConnectionStatus({classId:cid},'teacher-a');assert.equal(state.reauthRequired,true);assert.equal(state.sheet,null);
});
test('full export ignores incomplete/practice sessions, defends formula text and never writes to Firestore',async()=>{
  const f=fixture();addSession(f);addSession(f,2);f.db.rows.get(`classes/${cid}/sessions/session-2`).status='incomplete';addSession(f,3);f.db.rows.get(`classes/${cid}/sessions/session-3`).mode='practice';
  const before=structuredClone([...f.db.rows]);const tables=await buildTables(f.db,cid,'@위험',f.env.MATH3_SERVER_SECRET);assert.equal(tables['회차'].length,2);assert.deepEqual([...f.db.rows],before);
  for(const value of ['=IMPORTXML("x")','+1','-1','@SUM(A1)',' \t=1'])assert.ok(literal(value).startsWith("'"));assert.equal(literal('정상 별명'),'정상 별명');
});
test('atomic Sheets writes use literal typed cells, clear stale rows, keep personal tabs and never create public sharing',async()=>{
  const seen=[],env=fixtureEnv();const api=new GoogleApi(env,async(url,opts)=>{seen.push({url,opts});return Response.json(opts.method==='GET'?{sheets:[{properties:{sheetId:0,title:'개인 메모'}}]}:{});});
  const f=fixture(),tables=await buildTables(f.db,cid,'반',env.MATH3_SERVER_SECRET);await api.write('sheet_id',tables,'fake');
  const body=JSON.parse(seen[1].opts.body);assert.equal(body.requests.filter(r=>r.addSheet).length,4);assert.equal(body.requests.filter(r=>r.repeatCell).length,4);assert.ok(!JSON.stringify(body).includes('formulaValue'));assert.ok(!body.requests.some(r=>r.deleteSheet));assert.ok(seen.every(r=>!r.url.includes('permissions')));
});
test('scheduled retry processes only an active connection and preserves dirty updates arriving during sync',async()=>{
  const f=fixture();addSession(f);await connect(f);await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');
  f.db.rows.set(`sheetJobs/${cid}`,{state:'pending',dirty:'one',nextRunAt:0});f.google.beforeWrite=async()=>{f.db.rows.set(`sheetJobs/${cid}`,{state:'pending',dirty:'new',nextRunAt:0});};
  await f.service.runJobs();assert.equal(f.db.rows.get(`sheetJobs/${cid}`).dirty,'new');f.google.beforeWrite=null;await f.service.runJobs();assert.equal(f.db.rows.has(`sheetJobs/${cid}`),false);
  f.db.rows.set(`sheetJobs/${cid}`,{state:'pending',dirty:'three',nextRunAt:0});await f.service.handlers.disconnectSheets({},'teacher-a');const writes=f.google.writes;await f.service.runJobs();assert.equal(f.google.writes,writes);
});
test('Google outage cannot prevent a Firestore game completion; outbox survives and retries later',async()=>{
  const f=fixture();await connect(f);await f.service.handlers.createOrSelectSheet({classId:cid},'teacher-a');const s=addSession(f);
  s.status='playing';s.currentIndex=49;s.revision=49;s.expiresAt=new Date(Date.now()+86400000).toISOString();const q=s.questions[49];q.status='pending';q.firstResponse=null;q.firstCorrect=false;q.earnedPoints=0;
  f.db.rows.set(`classes/${cid}/sessions/${s.sessionId}`,{...s,questions:undefined,questionsJson:JSON.stringify(s.questions),seasonId:'2026-10'});
  f.db.rows.set('studentBindings/student',{classId:cid,studentId:sid,active:true});f.google.writeFailure='GOOGLE_UNAVAILABLE';
  const handlers=createHandlers(f.db,f.env.MATH3_SERVER_SECRET);const result=await handlers.submitAnswer({sessionId:s.sessionId,questionId:q.id,skip:true,expectedRevision:49,requestId:opaque()},'student');
  assert.equal(result.session.status,'complete');assert.equal(result.session.result.saveStatus,'confirmed');assert.ok(f.db.rows.has(`sheetJobs/${cid}`));
  const stored=structuredClone(f.db.rows.get(`classes/${cid}/sessions/${s.sessionId}`));await f.service.runJobs();assert.deepEqual(f.db.rows.get(`classes/${cid}/sessions/${s.sessionId}`),stored);assert.equal(f.db.rows.get(`sheetExports/${cid}`).status,'failed');assert.ok(f.db.rows.has(`sheetJobs/${cid}`));
  f.google.writeFailure=null;f.advance(300001);await f.service.runJobs();assert.equal(f.db.rows.has(`sheetJobs/${cid}`),false);
});
test('server responses and diagnostics do not expose token, secret, body or external error text',async()=>{
  const f=fixture(),diagnostics=[];
  const response=await handleRequest(new Request('https://worker.example/api/getGoogleConnectionStatus',{method:'POST',headers:{origin:'https://subsubt.github.io','content-type':'application/json',authorization:'Bearer private-bearer'},body:JSON.stringify({data:{}})}),f.env,{database:{doc(){throw Error(f.env.GOOGLE_CLIENT_SECRET+' private-bearer');}},verifyToken:async()=> 'teacher-a',reportError:d=>diagnostics.push(d)});
  assert.equal(response.status,500);const text=JSON.stringify(diagnostics)+await response.text();assert.ok(!text.includes(f.env.GOOGLE_CLIENT_SECRET));assert.ok(!text.includes('private-bearer'));
  const navigation=await handleRequest(new Request(f.env.GOOGLE_REDIRECT_URI.replace('/callback','/start')+'?ticket='+opaque()),f.env,{database:{runTransaction(){throw new TypeError(f.env.GOOGLE_CLIENT_SECRET+' private-navigation-secret');}},reportError:d=>diagnostics.push(d)});
  assert.equal(navigation.status,400);assert.equal(diagnostics.at(-1).code,'OAUTH_START_TRANSACTION');
  const navigationText=JSON.stringify(diagnostics)+await navigation.text();assert.ok(!navigationText.includes(f.env.GOOGLE_CLIENT_SECRET));assert.ok(!navigationText.includes('private-navigation-secret'));
});
