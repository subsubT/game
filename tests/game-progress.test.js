import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {MemoryDb} from './sheets-fakes.js';
import {defaultProgressUI} from '../src/games/session-progress.js';
import {buildTables} from '../worker/src/sheet-data.js';

const id=()=>crypto.randomUUID(),secret='progress-test-only-pepper',denied=(p,code)=>assert.rejects(p,e=>e.code===code);
async function fixture() {
  const db=new MemoryDb(),h=createHandlers(db,secret);await h.createTeacherSpace({requestId:id()},'teacher');
  const cls=await h.createClass({privateLabel:'자유저장검증반',requestId:id()},'teacher');
  for(const uid of ['student','peer'])await h.requestJoin({code:cls.code,privateName:'가상학생',pin:'4826',pinConfirm:'4826',requestId:id()},uid);
  const start=uid=>h.startSession({gameId:'1math3',mode:'regular',requestId:id()},uid);
  const save=(s,uiState=defaultProgressUI(s),uid='student')=>h.saveSession({sessionId:s.sessionId,expectedRevision:s.revision,uiState,requestId:id()},uid);
  const resume=(s,uid='student')=>h.resumeSession({sessionId:s.sessionId,expectedRevision:s.revision,requestId:id()},uid);
  const login=async uid=>{const roster=await h.getClassLoginRoster({code:cls.code},uid);return h.loginStudentPin({grant:roster.grant,studentId:db.rows.get('studentBindings/student').studentId,pin:'4826',requestId:id()},uid);};
  return {db,h,cls,start,save,resume,login};
}
const answerOf=q=>q.typeId==='subtract_three_small'?q.operands[0]-q.operands[1]-q.operands[2]:q.typeId==='make_ten'?10-q.operands[0]:q.typeId==='subtract_from_ten'?10-q.operands[1]:q.operands.reduce((a,b)=>a+b,0);
async function answer(h,s,uid='student',skip=false) {
  let q=s.questions[s.currentIndex];
  if(!skip&&q.step==='pair') { const pair=[[0,1],[0,2],[1,2]].find(([a,b])=>q.operands[a]+q.operands[b]===10);s=(await h.submitAnswer({sessionId:s.sessionId,questionId:q.id,response:pair,expectedRevision:s.revision,requestId:id()},uid)).session;q=s.questions[s.currentIndex]; }
  return (await h.submitAnswer({sessionId:s.sessionId,questionId:q.id,...(skip?{skip:true}:{response:answerOf(q)}),expectedRevision:s.revision,requestId:id()},uid)).session;
}

test('catalog lookup does not start a game and requires the existing PIN binding',async()=>{
  const {db,h}=await fixture(),before=db.rows.size;
  const result=await h.getStudentGames({},'student');assert.equal(result.games[0].gameId,'1math3');assert.equal(result.games[0].entryPath,'1math3.html');assert.equal(result.games[0].activeSession,null);assert.equal(db.rows.size,before);
  await denied(h.getStudentGames({},'outsider'),'PENDING_APPROVAL');
});
test('save before the first answer preserves a draft, pauses without completing, and retries only once',async()=>{
  const {db,h,start}=await fixture(),s=await start('student'),uiState={view:'playing',questionId:s.questions[0].id,draft:'1',selected:[]};
  const args={sessionId:s.sessionId,expectedRevision:s.revision,uiState,requestId:id()};
  const results=await Promise.all([h.saveSession(args,'student'),h.saveSession(args,'student')]);assert.deepEqual(results[0],results[1]);
  const saved=results[0].session;assert.equal(saved.currentIndex,0);assert.equal(saved.revision,1);assert.equal(saved.progressState,'paused');assert.equal(saved.result,null);assert.deepEqual(saved.uiState,uiState);
  assert.deepEqual(saved.timer,{policy:'unlimited',remainingMs:null});assert.equal(saved.expiresAt,null);
  await denied(h.submitAnswer({sessionId:s.sessionId,questionId:s.questions[0].id,response:2,requestId:id()},'student'),'SESSION_PAUSED');
  assert.equal([...db.rows.keys()].filter(p=>p.startsWith('classBoards/')).length,0);
  await denied(h.saveSession({...args,uiState:{...uiState,draft:'2'}},'student'),'REQUEST_CONFLICT');
});
test('seven answers, score, draft and remaining questions survive logout/device change and a long break; completion ranks once',async()=>{
  const {db,h,cls,start,save,resume,login}=await fixture();let s=await start('student');for(let n=0;n<7;n++)s=await answer(h,s);
  const uiState={view:'playing',questionId:s.questions[s.currentIndex].id,draft:'8',selected:[]};s=(await save(s,uiState)).session;
  const path=`classes/${cls.classId}/sessions/${s.sessionId}`,snapshot=structuredClone(db.rows.get(path));
  await h.detachStudentDevice({},'student');await login('new-device');
  const hub=await h.getStudentGames({},'new-device'),saved=hub.games[0].activeSession;assert.equal(saved.currentIndex,7);assert.deepEqual(saved.uiState,uiState);assert.deepEqual(db.rows.get(path),snapshot);
  await assert.rejects(h.getSession({sessionId:s.sessionId},'student'));
  const original=Date.now;try { Date.now=()=>original()+30*86400000;assert.equal((await h.getSession({sessionId:s.sessionId},'new-device')).status,'playing'); } finally {Date.now=original;}
  s=await resume(saved,'new-device');while(s.status==='playing')s=await answer(h,s,'new-device');
  assert.equal(s.result.score,500);assert.equal(s.result.correct,50);
  const finishArgs={sessionId:s.sessionId,reason:'complete',requestId:id()};await h.finishSession(finishArgs,'new-device');await h.finishSession(finishArgs,'new-device');
  const board=await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher');assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,500);
  assert.equal((await h.getStudentGames({},'new-device')).games[0].activeSession,null);
  assert.equal((await h.getSessionDetails({classId:cls.classId,sessionId:s.sessionId},'teacher')).answers.length,50);
  assert.equal((await buildTables(db,cls.classId,'검증반',secret))['회차'].length,2);
});
test('pair selection and an unfinished sum are saved independently of authoritative scoring',async()=>{
  const {h,start,save,resume}=await fixture();let s=await start('student');for(let n=0;n<4;n++)s=await answer(h,s,'student',true);
  const q=s.questions[4],pair=[[0,1],[0,2],[1,2]].find(([a,b])=>q.operands[a]+q.operands[b]===10);
  s=(await save(s,{view:'playing',questionId:q.id,draft:'',selected:pair})).session;assert.deepEqual(s.uiState.selected,pair);
  s=await resume(s);s=(await h.submitAnswer({sessionId:s.sessionId,questionId:q.id,response:pair,expectedRevision:s.revision,requestId:id()},'student')).session;
  assert.equal(s.currentIndex,4);assert.equal(s.questions[4].step,'sum');
  s=(await save(s,{view:'playing',questionId:q.id,draft:'1',selected:[]})).session;
  assert.deepEqual(s.questions[4].selectedPair,pair);assert.equal(s.uiState.draft,'1');assert.equal(s.questions[4].earnedPoints || 0,0);
});
test('client score/index/timer injection, unvalidated UI data and another student session are rejected',async()=>{
  const {h,start,save}=await fixture(),s=await start('student'),peer=await start('peer'),base={sessionId:s.sessionId,expectedRevision:0,uiState:defaultProgressUI(s),requestId:id()};
  for(const extra of [{score:500},{currentIndex:50},{remainingMs:999999},{questions:[]}])await denied(h.saveSession({...base,...extra},'student'),'INVALID_REQUEST');
  for(const uiState of [{...base.uiState,questionId:'future'},{...base.uiState,view:'result'},{...base.uiState,draft:'<x>'},{...base.uiState,selected:[0,0]},{...base.uiState,score:100}])await denied(h.saveSession({...base,uiState,requestId:id()},'student'),'INVALID_PROGRESS');
  await denied(save(peer,defaultProgressUI(peer)),'SESSION_NOT_ACTIVE');
  await denied(h.resumeSession({sessionId:peer.sessionId,expectedRevision:0,requestId:id()},'student'),'SESSION_NOT_ACTIVE');
});
test('save-versus-answer races and stale revisions cannot overwrite canonical progress or award points twice',async()=>{
  const {db,h,cls,start,save,resume}=await fixture(),s=await start('student');
  const results=await Promise.allSettled([save(s),answer(h,s)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const fresh=await h.getSession({sessionId:s.sessionId},'student');assert.equal(fresh.revision,1);assert.ok(fresh.currentIndex===0||fresh.currentIndex===1);
  const before=structuredClone(db.rows.get(`classes/${cls.classId}/sessions/${s.sessionId}`));
  await denied(save(s),'REVISION_CONFLICT');assert.deepEqual(db.rows.get(`classes/${cls.classId}/sessions/${s.sessionId}`),before);
  const running=fresh.progressState==='paused'?await resume(fresh):fresh;assert.equal(running.status,'playing');
});
test('saved progress is distinguished from completed history and is omitted from Sheets and ranks',async()=>{
  const {db,h,cls,start,save}=await fixture();let s=await start('student');s=await answer(h,s);s=(await save(s)).session;
  const list=await h.listClassSessions({classId:cls.classId,gameId:'1math3'},'teacher');assert.equal(list.sessions[0].status,'playing');assert.equal(list.sessions[0].progressState,'paused');assert.equal(list.sessions[0].completion,'incomplete');
  const details=await h.getSessionDetails({classId:cls.classId,sessionId:s.sessionId},'teacher');assert.equal(details.result.progressState,'paused');assert.equal(details.answers.length,1);
  assert.equal((await buildTables(db,cls.classId,'검증반',secret))['회차'].length,1);
});
test('legacy saves migrate before expiry with a backup; already expired games are never resurrected',async()=>{
  const {db,h,cls,start,save,resume}=await fixture();let s=await start('student');const path=`classes/${cls.classId}/sessions/${s.sessionId}`,row=db.rows.get(path);delete row.storageVersion;row.expiresAt=new Date(Date.now()+60000).toISOString();const before=structuredClone(row);
  s=(await save(s)).session;assert.equal(s.expiresAt,null);assert.deepEqual([...db.rows.values()].find(v=>v.before?.sessionId===s.sessionId).before,before);
  s=await resume(s);await save(s);assert.equal([...db.rows.keys()].filter(p=>p.startsWith('sessionProgressBackups/')).length,1);
  const expired=await start('peer'),old=db.rows.get(`classes/${cls.classId}/sessions/${expired.sessionId}`);old.expiresAt='2000-01-01T00:00:00.000Z';delete old.storageVersion;
  assert.equal((await h.getSession({sessionId:expired.sessionId},'peer')).status,'incomplete');await denied(save(expired,defaultProgressUI(expired),'peer'),'SESSION_NOT_ACTIVE');
});
test('PIN reset and removal invalidate saving/resuming just as they invalidate answers',async()=>{
  const {h,cls,start,save,resume,db}=await fixture(),s=await start('student'),sid=db.rows.get('studentBindings/student').studentId;
  await h.changeStudentPin({classId:cls.classId,studentId:sid,reset:true,requestId:id()},'teacher');
  for(const p of [save(s),resume(s),h.getStudentGames({},'student')])await denied(p,'PENDING_APPROVAL');
  await h.removeStudent({classId:cls.classId,studentId:sid,requestId:id()},'teacher');await denied(save(s),'PENDING_APPROVAL');
});
