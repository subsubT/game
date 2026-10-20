// Opt-in live, synthetic class only. All printed results exclude credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {account,call} from './checkpoint-c-live.mjs';
const dir='.cp5-test-artifacts/final-stage',id=()=>crypto.randomUUID();
async function main(){
 const f=JSON.parse(await readFile(dir+'/live-running.json','utf8')),storage=JSON.parse(await readFile(dir+'/student-storage.json','utf8'));
 function decode(v){if(!v||typeof v!=='object')return v;if(v.o)return Object.fromEntries(v.o.map(({k,v})=>[k,decode(v)]));if(v.a)return v.a.map(decode);if('s' in v)return v.s;if('n' in v)return v.n;if('b' in v)return v.b;return null;}
 function userOf(v){if(!v||typeof v!=='object')return null;if(v.valueEncoded)return userOf(decode(v.valueEncoded));if(v.stsTokenManager?.accessToken)return v;for(const value of Object.values(v)){const u=userOf(value);if(u)return u;}return null;}
 const user=userOf(storage);if(!user)throw Error('Synthetic student authentication unavailable');const a={idToken:user.stsTokenManager.accessToken};
 let final=(await call(a,'getFinalStage',{sessionId:f.sessionId})).finalStage;const checks=[];
 const base={sessionId:f.sessionId,expectedRevision:final.revision,requestId:id()};
 for(const extra of [{remainingMs:999999},{score:9999},{runningSince:Date.now()},{question:[]}])await call(a,'startFinalStage',{...base,...extra},'INVALID_REQUEST');checks.push('client time/score/question injection rejected');
 await call(a,'saveFinalStage',{...base,expectedRevision:Math.max(0,final.revision-1),uiState:{view:'playing',questionId:final.question.id,draft:'',selected:[]}},'REVISION_CONFLICT');checks.push('stale revision cannot pause or overwrite');
 const peer=await account();await call(peer,'requestJoin',{code:f.cls.code,privateName:'최종격리가상',pin:'5291',pinConfirm:'5291',requestId:id()});
 await call(peer,'getFinalStage',{sessionId:f.sessionId},'FORBIDDEN');await call(peer,'startFinalStage',base,'FORBIDDEN');await call(peer,'saveFinalStage',{...base,uiState:{view:'playing',questionId:final.question.id,draft:'',selected:[]}},'FORBIDDEN');checks.push('other student final reads/resume/save rejected');
 const teacher=await account();await call(teacher,'createTeacherSpace',{requestId:id()});await call(teacher,'getSessionDetails',{classId:f.cls.classId,sessionId:f.sessionId},'FORBIDDEN');await call(teacher,'getFinalStage',{sessionId:f.sessionId},'PENDING_APPROVAL');checks.push('other teacher/class access and role mixing rejected');
 const worker='https://math3-cp3-dev.subsubt-math3-dev.workers.dev';
 for(const [label,headers,expected] of [['missing auth',{origin:'https://subsubt.github.io'},401],['forged token',{origin:'https://subsubt.github.io',authorization:'Bearer '+a.idToken.slice(0,-3)+'abc'},401],['foreign Origin',{origin:'https://forbidden.example',authorization:'Bearer '+a.idToken},403]]){const r=await fetch(worker+'/api/getFinalStage',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({data:{sessionId:f.sessionId}})});await r.arrayBuffer();if(r.status!==expected)throw Error(label+' status mismatch');checks.push(label+' rejected');}
 const url='https://firestore.googleapis.com/v1/projects/math3-dev/databases/(default)/documents/classes/'+f.cls.classId+'/sessions/'+f.sessionId;
 for(const method of ['GET','PATCH']){const r=await fetch(url+(method==='PATCH'?'?updateMask.fieldPaths=finalStage.score':''),{method,headers:{authorization:'Bearer '+a.idToken,'content-type':'application/json'},...(method==='PATCH'?{body:JSON.stringify({fields:{finalStage:{mapValue:{fields:{score:{integerValue:'999999'}}}}}})}:{})});await r.arrayBuffer();if(r.status!==403)throw Error('Direct Firestore access was not denied');}checks.push('actual Firestore direct read/write denied');
 await writeFile(dir+'/live-security.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,result:'PASS'},null,2));console.log(JSON.stringify({liveSecurity:'PASS',checks}));
}
main().catch(e=>{console.error(JSON.stringify({liveSecurity:'FAIL',reason:/status mismatch|not denied|authentication unavailable/.test(e.message)?e.message:'Check failed; credentials withheld'}));process.exitCode=1;});
