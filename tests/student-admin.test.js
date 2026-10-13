import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {MemoryDb} from './sheets-fakes.js';
import {buildTables} from '../worker/src/sheet-data.js';
const id=()=>crypto.randomUUID(),secret='student-administration-test-only';
async function fixture(){const db=new MemoryDb(),h=createHandlers(db,secret);await h.createTeacherSpace({requestId:id()},'teacher');await h.createTeacherSpace({requestId:id()},'other-teacher');const cls=await h.createClass({privateLabel:'학생관리검증반',requestId:id()},'teacher');return{db,h,cls};}
const denied=(p,code)=>assert.rejects(p,e=>e.code===code);
async function complete(h,uid){let s=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},uid);while(s.status==='playing')s=(await h.submitAnswer({sessionId:s.sessionId,questionId:s.questions[s.currentIndex].id,skip:true,expectedRevision:s.revision,requestId:id()},uid)).session;return s;}

test('class code enrolls immediately; retries and concurrent requests do not rename or duplicate students',async()=>{
  const {db,h,cls}=await fixture(),args={code:cls.code,privateName:'처음이름',requestId:id()};
  const joined=await Promise.all([h.requestJoin(args,'student'),h.requestJoin(args,'student')]);assert.deepEqual(joined[0],joined[1]);assert.equal(joined[0].status,'approved');
  assert.equal((await h.listClassStudents({classId:cls.classId},'teacher')).students.length,1);assert.equal((await h.listPendingStudents({classId:cls.classId},'teacher')).students.length,0);
  assert.equal((await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student')).status,'playing');
  assert.equal((await h.requestJoin({...args,privateName:'학생변조',requestId:id()},'student')).privateName,'처음이름');
  const other=await h.createClass({privateLabel:'다른반',requestId:id()},'other-teacher');await denied(h.requestJoin({code:other.code,requestId:id()},'student'),'FORBIDDEN');
  db.rows.get(`classes/${cls.classId}`).joinEnabled=false;await denied(h.requestJoin({code:cls.code,requestId:id()},'new-student'),'JOIN_UNAVAILABLE');
});

test('legacy pending enrollment activates once on status refresh and never restores a removed membership',async()=>{
  const {db,h,cls}=await fixture(),path=`classes/${cls.classId}/students/legacy`;
  db.rows.set(path,{uid:'legacy',privateName:'기존학생',classAlias:'초록별-11',checkMark:'22',status:'pending'});db.rows.set('joinRequests/legacy',{classId:cls.classId,studentId:'legacy',checkMark:'22'});
  const result=await Promise.all([h.getStudentStatus({},'legacy'),h.getStudentStatus({},'legacy')]);assert.deepEqual(result[0],result[1]);assert.equal(result[0].status,'approved');assert.equal(result[0].privateName,'기존학생');
  assert.equal([...db.rows.values()].filter(v=>v.action==='enroll-pending').length,1);
  await h.removeStudent({classId:cls.classId,studentId:'legacy',requestId:id()},'teacher');assert.equal((await h.getStudentStatus({},'legacy')).status,'new');await denied(h.requestJoin({code:cls.code,requestId:id()},'legacy'),'FORBIDDEN');
});

test('teacher rename validates names, preserves ledger/aliases, is idempotent and rejects students and other teachers',async()=>{
  const {db,h,cls}=await fixture();await h.requestJoin({code:cls.code,privateName:'원래이름',requestId:id()},'student');const sid=db.rows.get('studentBindings/student').studentId;
  const path=`classes/${cls.classId}/students/${sid}`,before=structuredClone(db.rows.get(path)),args={classId:cls.classId,studentId:sid,privateName:'  바뀐이름  ',requestId:id()};
  await denied(h.renameStudent(args,'student'),'FORBIDDEN');await denied(h.renameStudent(args,'other-teacher'),'FORBIDDEN');
  for(const studentId of ['../../other/students/victim','..','a/b','a\\b']) { await denied(h.renameStudent({...args,studentId},'teacher'),'INVALID_REQUEST');await denied(h.removeStudent({classId:cls.classId,studentId,requestId:id()},'teacher'),'INVALID_REQUEST'); }
  for(const privateName of ['', ' ', '가'.repeat(13), '이\n름', 123])await assert.rejects(h.renameStudent({...args,privateName,requestId:id()},'teacher'));
  const renamed=await h.renameStudent(args,'teacher');assert.equal(renamed.privateName,'바뀐이름');assert.deepEqual(await h.renameStudent(args,'teacher'),renamed);assert.equal((await h.getStudentStatus({},'student')).privateName,'바뀐이름');
  assert.equal(db.rows.get(path).classAlias,before.classAlias);assert.equal([...db.rows.values()].filter(v=>v.action==='rename').length,1);assert.deepEqual([...db.rows.values()].find(v=>v.action==='rename').before,before);
});

test('removal revokes sessions and tickets, removes only this student from ranks and Sheets, preserves backup/ledger',async()=>{
  const {db,h,cls}=await fixture();for(const uid of ['student','peer'])await h.requestJoin({code:cls.code,requestId:id()},uid);
  const s=await complete(h,'student');await complete(h,'peer');const sid=db.rows.get('studentBindings/student').studentId,path=`classes/${cls.classId}/sessions/${s.sessionId}`,ledger=structuredClone(db.rows.get(path));
  const active=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student');const ticket=await h.issueStudentReturnTicket({classId:cls.classId,studentId:sid},'teacher');
  const args={classId:cls.classId,studentId:sid,requestId:id()};await denied(h.removeStudent(args,'peer'),'FORBIDDEN');await denied(h.removeStudent(args,'other-teacher'),'FORBIDDEN');
  db.rows.set(`sheetExports/${cls.classId}`,{spreadsheetId:'test-sheet'});await h.removeStudent(args,'teacher');await h.removeStudent(args,'teacher');
  assert.equal((await h.listClassStudents({classId:cls.classId},'teacher')).students.length,1);assert.deepEqual(db.rows.get(path),ledger);assert.equal([...db.rows.values()].filter(v=>v.action==='remove').length,1);assert.ok(db.rows.get(`sheetJobs/${cls.classId}`));
  const board=await h.getTeacherLeaderboard({classId:cls.classId,seasonId:s.seasonId},'teacher');assert.equal(board.entries.length,1);assert.equal(board.entries[0].rank,1);
  for(const v of db.rows.values())if(v.counts)assert.equal(v.counts[0],1);
  for(const [method,data] of [['getSession',{sessionId:active.sessionId}],['startSession',{gameId:'1math3',mode:'regular',requestId:id()}],['submitAnswer',{sessionId:active.sessionId,questionId:active.questions[0].id,skip:true,requestId:id()}],['finishSession',{sessionId:active.sessionId,reason:'quit',requestId:id()}],['setGlobalParticipation',{enabled:true}]])await assert.rejects(h[method](data,'student'));
  await denied(h.redeemStudentReturnTicket({ticket:ticket.ticket,requestId:id()},'new-device'),'FORBIDDEN');await denied(h.renameStudent({...args,privateName:'삭제후이름'},'teacher'),'NOT_FOUND');
  const tables=await buildTables(db,cls.classId,'검증반',secret);assert.equal(tables['학생요약'].length,2);assert.equal(tables['회차'].length,2);
  await h.setClassGlobalParticipation({classId:cls.classId,enabled:false},'teacher');await h.setClassGlobalParticipation({classId:cls.classId,enabled:true},'teacher');assert.equal([...db.rows.keys()].filter(k=>k.startsWith('globalBoards/')&&k.includes('/entries/')).length,1);
});
