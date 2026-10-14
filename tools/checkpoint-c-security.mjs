// Only new synthetic identities. Report denial codes, never request credentials.
import {account,call} from './checkpoint-c-live.mjs';
import {writeFile} from 'node:fs/promises';
const origin='https://subsubt.github.io',worker='https://math3-cp3-dev.subsubt-math3-dev.workers.dev';
async function main(){
 const a=await account(),checks=[];
 async function denied(label,headers,expected){const r=await fetch(worker+'/api/getStudentStatus',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{"data":{}}'});await r.arrayBuffer();if(r.status!==expected)throw Error(label);checks.push(label);}
 await denied('missing authentication rejected',{origin},401);
 await denied('tampered Firebase token rejected',{origin,authorization:'Bearer '+a.idToken.slice(0,-3)+'abc'},401);
 await denied('foreign origin rejected',{origin:'https://forbidden.example',authorization:'Bearer '+a.idToken},403);
 const roster=await call(a,'getClassLoginRoster',{code:'1409'}),b=await account(),sid=roster.students[0].studentId;
 await call(b,'loginStudentPin',{grant:roster.grant,studentId:sid,pin:'0000',requestId:crypto.randomUUID()},'LOGIN_FAILED');checks.push('roster grant cannot move to another UID');
 await call(a,'loginStudentPin',{grant:roster.grant.slice(0,-2)+'xx',studentId:sid,pin:'0000',requestId:crypto.randomUUID()},'LOGIN_FAILED');checks.push('forged roster grant rejected');
 const t=await account();await call(t,'createTeacherSpace',{requestId:crypto.randomUUID()});await call(t,'requestJoin',{code:'1409',privateName:'C우회검증',pin:'5726',pinConfirm:'5726',requestId:crypto.randomUUID()},'FORBIDDEN');checks.push('teacher identity cannot assume student role');
 await writeFile('.cp5-test-artifacts/checkpoint-c/security.json',JSON.stringify({checks,checkedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({security:'PASS',checks}));
}
main().catch(()=>{console.error('Checkpoint C authentication bypass check failed; credentials withheld');process.exitCode=1;});
