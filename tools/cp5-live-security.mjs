import assert from 'node:assert/strict';
import { liveApiKey } from '../tests/live-config.js';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const worker='https://math3-cp3-dev.subsubt-math3-dev.workers.dev',origin='https://math3-dev--cp5-google-q3ym6qkw.web.app';
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),options={project:'math3-dev',nonInteractive:true};
auth.setActiveAccount(options,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(options);
const admin=new (require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
const base='/v1/projects/math3-dev/databases/(default)/documents';
const evidence={checkedAt:new Date().toISOString(),checks:[]};
async function fixture(){
 const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await liveApiKey()}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});const a=await r.json();assert.equal(r.status,200);
 async function call(name,data={}){const r=await fetch(worker+'/api/'+name,{method:'POST',headers:{origin,authorization:'Bearer '+a.idToken,'content-type':'application/json'},body:JSON.stringify({data})});return {status:r.status,json:await r.json()};}
 assert.equal((await call('createTeacherSpace',{requestId:crypto.randomUUID()})).status,200);return {call};
}
const other=await fixture();
for(const name of ['getGoogleConnectionStatus','createOrSelectSheet','syncSheet']){const r=await other.call(name,{classId:'96f09e79e62f14d98c7836f5530f91d0'});assert.equal(r.status,403);evidence.checks.push(name+': other teacher FORBIDDEN');}
assert.equal((await other.call('beginGoogleConnection',{returnUrl:'https://attacker.example/'})).json.error.code,'INVALID_RETURN_URL');evidence.checks.push('arbitrary redirect rejected');
async function start(who){const begin=await who.call('beginGoogleConnection');assert.equal(begin.status,200);const r=await fetch(begin.json.result.authorizationUrl,{redirect:'manual'});assert.equal(r.status,303);const state=new URL(r.headers.get('location')).searchParams.get('state');const cookie=r.headers.get('set-cookie').split(';')[0];await r.arrayBuffer();return {state,cookie,launch:begin.json.result.authorizationUrl};}
const started=await start(other);
const replay=await fetch(started.launch,{redirect:'manual'});assert.equal((await replay.json()).error.code,'OAUTH_STATE_INVALID');evidence.checks.push('launch replay rejected');
const missing=await fetch(worker+'/oauth/google/callback?state='+started.state+'&error=access_denied',{redirect:'manual'});assert.equal((await missing.json()).error.code,'OAUTH_STATE_INVALID');evidence.checks.push('callback missing browser cookie rejected');
const denied=await fetch(worker+'/oauth/google/callback?state='+started.state+'&error=access_denied',{redirect:'manual',headers:{cookie:started.cookie}});assert.equal(denied.status,303);assert.equal(new URL(denied.headers.get('location')).hash,'#sheets=GOOGLE_CONSENT_DENIED');await denied.arrayBuffer();
const reused=await fetch(worker+'/oauth/google/callback?state='+started.state+'&error=access_denied',{redirect:'manual',headers:{cookie:started.cookie}});assert.equal((await reused.json()).error.code,'OAUTH_STATE_INVALID');evidence.checks.push('callback consumed state replay rejected');
const exp=await start(await fixture());
const stateId=createHash('sha256').update(exp.state).digest('hex');
await admin.patch(base+'/googleOAuthStates/'+stateId+'?updateMask.fieldPaths=expiresAt',{fields:{expiresAt:{integerValue:String(Date.now()-1)}}});
const expired=await fetch(worker+'/oauth/google/callback?state='+exp.state+'&error=access_denied',{redirect:'manual',headers:{cookie:exp.cookie}});assert.equal((await expired.json()).error.code,'OAUTH_STATE_INVALID');evidence.checks.push('expired test-only state rejected');
await writeFile('.cp5-test-artifacts/live-google-security.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
