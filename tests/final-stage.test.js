import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {MemoryDb} from './sheets-fakes.js';
import {FINAL_BANK,FINAL_DURATION_MS,finalQuestion,finalRemaining,unpackFinal} from '../src/games/1math3/final-stage.js';
import {evaluateStep,publicQuestion,GAME} from '../src/games/1math3/core.js';
import {buildTables} from '../worker/src/sheet-data.js';
import {finalizeOfflineStages} from '../worker/src/final-stage-jobs.js';
const id=()=>crypto.randomUUID(),secret='only-local-final-stage-test';
const denied=(p,code)=>assert.rejects(p,e=>e.code===code);
async function fixture() {
 const db=new MemoryDb(),h=createHandlers(db,secret);await h.createTeacherSpace({requestId:id()},'teacher');
 const cls=await h.createClass({privateLabel:'최종 가상 검증',requestId:id()},'teacher');
 for(const uid of ['student','peer'])await h.requestJoin({code:cls.code,privateName:uid,pin:'4826',pinConfirm:'4826',requestId:id()},uid);
 let s=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student');const path=`classes/${cls.classId}/sessions/${s.sessionId}`;
 for(let i=0;i<50;i++) {
   const raw=JSON.parse(db.rows.get(path).questionsJson)[i];
   if(raw.step==='pair')s=(await h.submitAnswer({sessionId:s.sessionId,questionId:raw.id,response:raw.validPairs[0],expectedRevision:s.revision,requestId:id()},'student')).session;
   s=(await h.submitAnswer({sessionId:s.sessionId,questionId:raw.id,response:raw.answer,expectedRevision:s.revision,requestId:id()},'student')).session;
 }
 const call=async(name,f,extra={},uid='student')=>(await h[name]({sessionId:s.sessionId,expectedRevision:f.revision,requestId:id(),...extra},uid)).finalStage;
 const start=()=>call('startFinalStage',s.finalStage);
 const answer=async f=>{let raw=unpackFinal(db.rows.get(path).finalStage).question;if(raw.step==='pair')f=await call('submitFinalAnswer',f,{questionId:raw.id,response:raw.validPairs[0]});raw=unpackFinal(db.rows.get(path).finalStage).question;return call('submitFinalAnswer',f,{questionId:raw.id,response:raw.answer});};
 const ui=f=>({view:'playing',questionId:f.question.id,draft:f.question.step==='pair'?'':'1',selected:[]});
 return {db,h,cls,s,path,call,start,answer,ui};
}
test('bank has 100+ unique displayed tasks, five concepts, stories, intermediate steps, all legal bounds and both tens pairs',()=>{
 assert.ok(FINAL_BANK.length>=100);assert.equal(new Set(FINAL_BANK.map(q=>q.finalPrompt)).size,FINAL_BANK.length);
 const counts=Object.fromEntries(GAME.types.map(t=>[t,FINAL_BANK.filter(q=>q.typeId===t).length]));assert.ok(Object.values(counts).every(n=>n>=30));
 assert.ok(FINAL_BANK.some(q=>q.finalPrompt.includes('상자')));assert.ok(FINAL_BANK.some(q=>q.finalPrompt.includes('먼저')));
 assert.ok(FINAL_BANK.some(q=>q.subtype==='final_back'));assert.ok(FINAL_BANK.some(q=>q.typeId==='subtract_three_small'&&q.answer===0));
 for(const base of FINAL_BANK){const [a,b,c]=base.operands;assert.ok(base.answer>=0&&base.answer<=19);if(base.typeId==='add_three_small')assert.ok(a+b+c<=9);if(base.typeId==='subtract_three_small')assert.ok(a-b-c>=0&&a<=9);if(base.typeId==='make_ten')assert.equal(a+b,10);if(base.typeId==='make_ten_then_add'){assert.ok(a+b===10||b+c===10);assert.ok(base.answer>=11&&base.answer<=19);}const q={...structuredClone(base),step:base.typeId==='make_ten_then_add'?'pair':'answer',stepResults:[],firstResponse:null};if(q.step==='pair')assert.equal(evaluateStep(q,q.validPairs[0]).correct,true);assert.equal(evaluateStep(q,base.answer).correct,true);assert.equal(publicQuestion(base).answer,undefined);}
 for(const seed of [1,44,12345]){const run=Array.from({length:FINAL_BANK.length},(_,i)=>finalQuestion(seed,i));assert.equal(new Set(run.map(q=>q.bankId)).size,FINAL_BANK.length);assert.equal(new Set(run.slice(0,5).map(q=>q.typeId)).size,5);assert.equal(finalQuestion(seed,FINAL_BANK.length).index,FINAL_BANK.length);}
});
test('50 questions unlock final without rewriting basic points, ranks, IDs or old completed records',async()=>{
 const {h,db,cls,s,path}=await fixture();assert.equal(s.result.score,500);assert.equal(s.finalStage.status,'ready');
 const board=await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher');assert.equal(board.entries[0].score,500);
 const before=structuredClone(db.rows.get(path));await h.finishSession({sessionId:s.sessionId,reason:'complete',requestId:id()},'student');assert.deepEqual(db.rows.get(path),before);
 const legacy={...before};delete legacy.finalStage;db.rows.set(path,legacy);await h.getSession({sessionId:s.sessionId},'student');assert.deepEqual(db.rows.get(path),legacy);await denied(h.getFinalStage({sessionId:s.sessionId},'student'),'FINAL_NOT_AVAILABLE');
});
test('new portal exposes both games while an already open legacy bundle receives only IDs it can route',async()=>{
 const {h}=await fixture();const old=await h.getStudentGames({},'student'),fresh=await h.getStudentGames({catalogVersion:2},'student');assert.deepEqual(old.games.map(g=>g.gameId),['1math3']);assert.deepEqual(fresh.games.map(g=>[g.gameId,g.title]),[['1math3','덧셈과 뺄셈(1)'],['1math2','100까지의 수']]);
});
test('server charges elapsed time, idempotent answers and saves cannot add time; paused time survives another PIN device',async()=>{
 const {db,h,cls,s,path,call,start,answer,ui}=await fixture();let f=await start();assert.ok(f.remainingMs<=FINAL_DURATION_MS);assert.equal(f.question.answer,undefined);
 const clock=Date.now,begin=clock();let time=begin;Date.now=()=>time;
 try {
   time+=12500;f=await answer(f);assert.equal(f.score,10);assert.ok(f.remainingMs<=587500);
   const args={sessionId:s.sessionId,expectedRevision:f.revision,uiState:ui(f),requestId:id()};const [a,b]=await Promise.all([h.saveFinalStage(args,'student'),h.saveFinalStage(args,'student')]);assert.deepEqual(a,b);f=a.finalStage;
   time+=30*86400000;assert.equal((await h.getFinalStage({sessionId:s.sessionId},'student')).finalStage.remainingMs,f.remainingMs);
   const roster=await h.getClassLoginRoster({code:cls.code},'new-device'),sid=db.rows.get('studentBindings/student').studentId;
   await h.loginStudentPin({grant:roster.grant,studentId:sid,pin:'4826',requestId:id()},'new-device');await denied(h.getFinalStage({sessionId:s.sessionId},'student'),'PENDING_APPROVAL');
   const hub=await h.getStudentGames({},'new-device');assert.equal(hub.games[0].finalSession.finalStage.score,10);
   f=await call('startFinalStage',f,{},'new-device');assert.ok(f.remainingMs<=587500);assert.equal(f.uiState.draft,ui(f).draft);
   const stale=f;time+=1000;f=await call('saveFinalStage',f,{uiState:ui(f)},'new-device');assert.ok(f.remainingMs<=586500);await denied(call('saveFinalStage',stale,{uiState:ui(stale)},'new-device'),'REVISION_CONFLICT');
   assert.equal(JSON.parse(db.rows.get(path).questionsJson).filter(q=>q.firstCorrect).length,50);
 }finally{Date.now=clock;}
});
test('answer/save race, stale revisions, clock/score injection, other student/class, and early access are denied',async()=>{
 const {h,cls,call,start,answer,ui,s}=await fixture();let f=await start();
 await denied(h.startFinalStage({sessionId:s.sessionId,expectedRevision:f.revision,remainingMs:999999,requestId:id()},'student'),'INVALID_REQUEST');
 await denied(h.submitFinalAnswer({sessionId:s.sessionId,expectedRevision:f.revision,questionId:f.question.id,response:1,score:9999,requestId:id()},'student'),'INVALID_REQUEST');
 for(const name of ['getFinalStage','startFinalStage','saveFinalStage','submitFinalAnswer'])await denied(name==='getFinalStage'?h[name]({sessionId:s.sessionId},'peer'):call(name,f,name==='saveFinalStage'?{uiState:ui(f)}:{},'peer'),'FORBIDDEN');
 const race=await Promise.allSettled([answer(f),call('saveFinalStage',f,{uiState:ui(f)})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 await h.createTeacherSpace({requestId:id()},'other-teacher');await denied(h.getSessionDetails({classId:cls.classId,sessionId:s.sessionId},'other-teacher'),'FORBIDDEN');
 const p=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'peer');await denied(h.startFinalStage({sessionId:p.sessionId,expectedRevision:0,requestId:id()},'peer'),'FINAL_NOT_AVAILABLE');
});
test('at 10 minutes late answers are not counted; one combined rank and Sheets rows finalize exactly once',async()=>{
 const {db,h,cls,s,path,call,start,answer}=await fixture();let f=await start();for(let i=0;i<3;i++)f=await answer(f);
 const clock=Date.now,deadline=db.rows.get(path).finalStage.runningSince+db.rows.get(path).finalStage.remainingMs;Date.now=()=>deadline;
 try {
  const raw=unpackFinal(db.rows.get(path).finalStage).question;
  f=await call('submitFinalAnswer',f,{questionId:raw.id,response:raw.step==='pair'?raw.validPairs[0]:raw.answer});assert.equal(f.status,'complete');assert.equal(f.score,30);assert.equal(f.remainingMs,0);
  const before=structuredClone(db.rows.get(path));await h.getFinalStage({sessionId:s.sessionId},'student');assert.deepEqual(db.rows.get(path),before);
  const board=await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher');assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,530);
  const details=await h.getSessionDetails({classId:cls.classId,sessionId:s.sessionId},'teacher');assert.equal(details.result.score,530);assert.equal(details.result.learningScore,500);assert.equal(details.finalAnswers.length,3);
  const tables=await buildTables(db,cls.classId,'가상반',secret);assert.equal(tables['회차'][1][3],530);assert.equal(tables['학생요약'][1][2],530);assert.equal(tables['문항'].length,54);assert.equal(new Set(tables['문항'].slice(1).map(r=>r[9])).size,53);
 }finally{Date.now=clock;}
});
test('offline cron seals the same combined score once without a client; paused and removed members cannot gain rank',async()=>{
 const {db,h,cls,s,path,start,answer}=await fixture();let f=await start();f=await answer(f);
 const clock=Date.now;Date.now=()=>db.rows.get(path).finalStage.runningSince+FINAL_DURATION_MS+1;
 try{await finalizeOfflineStages(db,secret);assert.equal(db.rows.get(path).finalStage.status,'complete');assert.equal((await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher')).entries[0].score,510);const before=structuredClone([...db.rows]);await finalizeOfflineStages(db,secret);assert.deepEqual([...db.rows],before);}finally{Date.now=clock;}
 assert.equal(finalRemaining({status:'paused',remainingMs:123,runningSince:null},999999),123);
});
test('combined scores exceed 1,000 without a separate board, and global opt-out/restore preserves the new total',async()=>{
 const {db,h,cls,s,path,start,answer}=await fixture();let f=await start();for(let i=0;i<55;i++)f=await answer(f);assert.equal(f.score,550);
 const clock=Date.now,deadline=db.rows.get(path).finalStage.runningSince+db.rows.get(path).finalStage.remainingMs;Date.now=()=>deadline;
 try{await finalizeOfflineStages(db,secret);}finally{Date.now=clock;}
 const board=await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher');assert.equal(board.entries[0].score,1050);
 await h.setGlobalParticipation({enabled:false},'student');assert.equal([...db.rows.keys()].filter(k=>k.startsWith('globalBoards/')&&k.includes('/entries/')).length,0);
 await h.setGlobalParticipation({enabled:true},'student');const global=[...db.rows].filter(([k])=>k.startsWith('globalBoards/')&&k.includes('/entries/'));assert.equal(global.length,1);assert.equal(global[0][1].score,1050);
});
test('teacher removal during a timed run revokes saving and offline finalization never recreates the removed ranking',async()=>{
 const {db,h,cls,s,path,start,answer}=await fixture();let f=await start();f=await answer(f);const studentId=db.rows.get('studentBindings/student').studentId;
 await h.removeStudent({classId:cls.classId,studentId,requestId:id()},'teacher');await denied(h.getFinalStage({sessionId:s.sessionId},'student'),'PENDING_APPROVAL');
 const clock=Date.now,deadline=db.rows.get(path).finalStage.runningSince+db.rows.get(path).finalStage.remainingMs;Date.now=()=>deadline;
 try{await finalizeOfflineStages(db,secret);}finally{Date.now=clock;}
 assert.equal(db.rows.get(path).finalStage.status,'complete');assert.equal((await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher')).entries.length,0);
 assert.equal([...db.rows.keys()].filter(k=>/^(classBoards|globalBoards)\//.test(k)&&k.includes('/entries/')).length,0);
 assert.equal((await buildTables(db,cls.classId,'가상반',secret))['회차'].length,1);
});
