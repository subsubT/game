// Creates only a fictitious development student; authentication remains in memory.
import { liveApiKey } from '../tests/live-config.js';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const id=()=>crypto.randomUUID();
const signup=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await liveApiKey()}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
const account=await signup.json();assert.equal(signup.status,200);
async function call(name,data={}) {
 const response=await fetch('https://math3-cp3-dev.subsubt-math3-dev.workers.dev/api/'+name,{method:'POST',headers:{origin:'https://math3-dev--cp5-google-q3ym6qkw.web.app',authorization:'Bearer '+account.idToken,'content-type':'application/json'},body:JSON.stringify({data})});
 const result=await response.json();assert.equal(response.status,200,name+': '+(result.error?.code||'FAILED'));return result.result;
}
await call('requestJoin',{code:'EGV32PVH',privateName:'CP5가상학생',requestId:id()});
console.log('Fictitious student awaiting teacher approval');
let status;
for(let n=0;n<180;n++){status=await call('getStudentStatus');if(status.status==='approved')break;await new Promise(r=>setTimeout(r,2000));}
assert.equal(status.status,'approved');
let state=await call('startSession',{gameId:'1math3',mode:'regular',requestId:id()});
const answer=q=>q.typeId==='add_three_small'||q.typeId==='make_ten_then_add'?q.operands.reduce((a,b)=>a+b,0):q.typeId==='subtract_three_small'?q.operands[0]-q.operands[1]-q.operands[2]:10-q.operands[q.typeId==='make_ten'?0:1];
while(state.status==='playing'){
 let q=state.questions[state.currentIndex];
 if(q.step==='pair'){
  const pair=[[0,1],[0,2],[1,2]].find(([a,b])=>q.operands[a]+q.operands[b]===10);
  state=(await call('submitAnswer',{sessionId:state.sessionId,questionId:q.id,response:pair,expectedRevision:state.revision,requestId:id()})).session;q=state.questions[state.currentIndex];
 }
 state=(await call('submitAnswer',{sessionId:state.sessionId,questionId:q.id,response:answer(q),expectedRevision:state.revision,requestId:id()})).session;
}
assert.equal(state.result.score,500);assert.equal(state.result.completion,'complete');
const evidence={checkedAt:new Date().toISOString(),sessionId:state.sessionId,score:state.result.score,completion:state.result.completion,expectedQuestions:50};
await writeFile('.cp5-test-artifacts/live-sheet-student.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
