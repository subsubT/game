import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import { createHandlers } from '../worker/src/generated-handlers.js';
import { handleRequest } from '../worker/src/index.js';
import { createPin, verifyPin } from '../src/server/student-pin.js';
import { MemoryDb, fixtureEnv } from './sheets-fakes.js';

const id = () => crypto.randomUUID(), secret = 'random-test-only-pepper-not-a-real-credential';
const context = network => ({ network });
const denied = (promise, code) => assert.rejects(promise, e => e.code === code);
async function fixture() {
  const db = new MemoryDb(), h = createHandlers(db, secret);
  for (const t of ['teacher', 'other-teacher']) await h.createTeacherSpace({requestId:id()}, t);
  const cls = await h.createClass({privateLabel:'PIN검증반',requestId:id()}, 'teacher');
  const register = async (uid, privateName = '같은이름') => {
    await h.requestJoin({code:cls.code,privateName,pin:'4826',pinConfirm:'4826',requestId:id()}, uid, context(uid));
    return db.rows.get(`studentBindings/${uid}`).studentId;
  };
  const login = async (uid, studentId, pin = '4826', requestId = id()) => {
    const roster = await h.getClassLoginRoster({code:cls.code}, uid, context(uid));
    return h.loginStudentPin({grant:roster.grant,studentId,pin,requestId}, uid, context(uid));
  };
  return {db,h,cls,register,login};
}

test('PIN verifiers use random salts, server-only pepper, constant-time comparison and student context', () => {
  const a = createPin('4826','class:one',secret), b = createPin('4826','class:one',secret);
  assert.notEqual(a.verifier,b.verifier); assert.notEqual(a.salt,b.salt);
  assert.ok(verifyPin('4826',a,'class:one',secret));
  for (const [pin,scope,pepper] of [['1234','class:one',secret],['4826','class:two',secret],['4826','class:one','another-pepper']]) assert.equal(verifyPin(pin,a,scope,pepper),false);
  assert.equal(verifyPin('4826',{...a,enabled:false},'class:one',secret),false);
});

test('registration requires a name and matching four digit PIN; name-only legacy API cannot create accounts', async () => {
  const {db,h,cls,register} = await fixture(), base={code:cls.code,privateName:'학생',requestId:id()};
  for (const [i,pin,pinConfirm] of [[0,undefined,undefined],[1,'123','123'],[2,'１２３４','１２３４'],[3,'1234','1235'],[4,1234,1234]]) await denied(h.requestJoin({...base,pin,pinConfirm},`invalid-${i}`), 'INVALID_PIN');
  await denied(h.requestJoin({...base,privateName:'',pin:'4826',pinConfirm:'4826'},'no-name'),'INVALID_NAME');
  const sid = await register('student');
  assert.equal(db.rows.get(`studentBindings/student`).pinVersion,1);
  const args={code:cls.code,privateName:'변조',pin:'0000',pinConfirm:'0000',requestId:id()};
  await h.requestJoin(args,'student');
  assert.equal(db.rows.get(`classes/${cls.classId}/students/${sid}`).privateName,'같은이름');
  assert.ok(verifyPin('4826',db.rows.get(`studentPins/${cls.classId}:${sid}`),`${cls.classId}:${sid}`,secret));
  assert.equal(JSON.stringify([...db.rows.values()]).includes('"4826"'),false);
});

test('roster returns minimum fields, distinguishes duplicate names and binds its expiring grant to the caller',async()=>{
  const {h,cls,register} = await fixture(); await register('one');await register('two');
  const roster=await h.getClassLoginRoster({code:cls.code},'new-device');
  assert.equal(roster.students.length,2);assert.equal(new Set(roster.students.map(s=>s.choiceNumber)).size,2);
  for(const s of roster.students)assert.deepEqual(Object.keys(s).sort(),['studentId','privateName','classAlias','choiceNumber','pinReady'].sort());
  await denied(h.loginStudentPin({grant:roster.grant,studentId:roster.students[0].studentId,pin:'4826',requestId:id()},'attacker'),'LOGIN_FAILED');
  await denied(h.loginStudentPin({grant:roster.grant+'x',studentId:roster.students[0].studentId,pin:'4826',requestId:id()},'new-device'),'LOGIN_FAILED');
  await denied(h.getClassLoginRoster({code:'123'},'invalid'),'JOIN_UNAVAILABLE');
});

test('another device authenticates by PIN, moves active session, preserves identity/ledger and revokes the old device',async()=>{
  const {db,h,register,login}=await fixture(),sid=await register('old');
  let s=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'old');
  s=(await h.submitAnswer({sessionId:s.sessionId,questionId:s.questions[0].id,skip:true,expectedRevision:s.revision,requestId:id()},'old')).session;
  const ledger=structuredClone(db.rows.get(`classes/${db.rows.get('studentBindings/old').classId}/sessions/${s.sessionId}`));
  assert.equal((await login('new',sid)).status,'approved');
  assert.equal(db.rows.get('studentBindings/new').studentId,sid);assert.equal(db.rows.get('studentBindings/old').active,false);
  assert.equal((await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'new')).sessionId,s.sessionId);
  assert.equal((await h.getSession({sessionId:s.sessionId},'new')).currentIndex,1);
  assert.deepEqual(db.rows.get(`classes/${db.rows.get('studentBindings/new').classId}/sessions/${s.sessionId}`),ledger);
  await assert.rejects(h.getSession({sessionId:s.sessionId},'old'));
  assert.equal((await login('old',sid)).status,'approved');
  await assert.rejects(h.getSession({sessionId:s.sessionId},'new'));
});

test('wrong PIN never transfers a binding; attempts remain limited across fresh UIDs and addresses',async()=>{
  const {db,h,register,login}=await fixture(),sid=await register('student');
  for(let n=0;n<6;n++)await denied(login(`guess-${n}`,sid,'0000'),'LOGIN_FAILED');
  await denied(login('seventh-uid',sid,'4826'),'RATE_LIMITED');
  assert.equal(db.rows.get('studentBindings/student').active,true);
  assert.equal([...db.rows.keys()].filter(k=>k.startsWith('studentBindings/')).length,1);
});

test('shared network limit survives anonymous-account rotation and is committed on failed code attempts',async()=>{
  const {h,cls}=await fixture(),code=cls.code==='0000'?'0001':'0000';
  for(let n=0;n<60;n++)await denied(h.getClassLoginRoster({code},`uid-${n}`,context('same-school-or-attacker')), 'JOIN_UNAVAILABLE');
  await denied(h.getClassLoginRoster({code:cls.code},'fresh-uid',context('same-school-or-attacker')), 'RATE_LIMITED');
});

test('five wrong PINs lock further guessing until teacher action, independently of cooldowns, UID and address',async()=>{
  const {db,h,cls,register,login}=await fixture(),sid=await register('student');
  for(let n=0;n<5;n++)await denied(login(`failed-${n}`,sid,'0000'),'LOGIN_FAILED');
  assert.equal(db.rows.get(`studentPins/${cls.classId}:${sid}`).locked,true);
  for(const [path,value] of db.rows)if(path.startsWith('rateLimits/'))value.resetAt=0;
  await denied(login('new-address-after-cooldown',sid),'LOGIN_FAILED');
  await h.changeStudentPin({classId:cls.classId,studentId:sid,pin:'5702',pinConfirm:'5702',requestId:id()},'teacher');
  assert.equal((await login('recovered',sid,'5702')).status,'approved');
});

test('expired roster grants and changed class-code versions cannot authorize login',async()=>{
  const {db,h,cls,register}=await fixture(),sid=await register('student');
  const grant=(await h.getClassLoginRoster({code:cls.code},'new')).grant,args={grant,studentId:sid,pin:'4826',requestId:id()};
  const originalNow=Date.now;
  try { Date.now=()=>originalNow()+600001;await denied(h.loginStudentPin(args,'new'),'LOGIN_FAILED'); }
  finally { Date.now=originalNow; }
  db.rows.get(`classes/${cls.classId}`).codeVersion++;
  await denied(h.loginStudentPin(args,'new'),'LOGIN_FAILED');
});

test('distributed class-code guessing shares one limit across both roster and registration routes',async()=>{
  const {h,cls}=await fixture(),code=cls.code==='0000'?'0001':'0000';
  for(let n=0;n<300;n++)await denied(h.getClassLoginRoster({code},`distributed-${n}`,context(`address-${n}`)),'JOIN_UNAVAILABLE');
  await denied(h.requestJoin({code:cls.code,privateName:'학생',pin:'4826',pinConfirm:'4826',requestId:id()},'fresh',context('fresh-address')),'RATE_LIMITED');
  await denied(h.getClassLoginRoster({code:cls.code},'fresh-two',context('another-address')),'RATE_LIMITED');
});

test('legacy PIN enrollment requires the original binding or a teacher ticket; records and aliases are unchanged',async()=>{
  const {db,h,cls,register,login}=await fixture(),sid=await register('legacy'),path=`classes/${cls.classId}/students/${sid}`;
  const original=db.rows.get(path);delete original.pinReady;delete original.pinVersion;db.rows.delete(`studentPins/${cls.classId}:${sid}`);delete db.rows.get('studentBindings/legacy').pinVersion;
  const before=structuredClone(original),args={pin:'5702',pinConfirm:'5702',requestId:id()};
  assert.equal((await h.getStudentStatus({},'legacy')).status,'pin-required');
  await denied(h.setStudentPin(args,'stranger'),'FORBIDDEN');
  await denied(login('stranger',sid),'LOGIN_FAILED');
  await assert.rejects(h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'legacy'));
  const responses=await Promise.all([h.setStudentPin(args,'legacy'),h.setStudentPin(args,'legacy')]);assert.deepEqual(responses[0],responses[1]);
  assert.equal(db.rows.get(path).classAlias,before.classAlias);assert.equal(db.rows.get(path).privateName,before.privateName);
  assert.equal([...db.rows.values()].filter(v=>v.action==='pin-migration').length,1);
  await denied(h.setStudentPin({...args,pin:'9999',pinConfirm:'9999',requestId:id()},'legacy'),'PIN_ALREADY_SET');
  assert.equal((await login('return',sid,'5702')).status,'approved');
});

test('teacher PIN change is owned, backed up, idempotent, invisible in lists and invalidates devices and old tickets',async()=>{
  const {db,h,cls,register,login}=await fixture(),sid=await register('student');
  const s=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student');
  const ticket=await h.issueStudentReturnTicket({classId:cls.classId,studentId:sid},'teacher');
  await denied(h.redeemStudentReturnTicket({ticket:ticket.ticket,requestId:id()},'teacher'),'FORBIDDEN');
  const args={classId:cls.classId,studentId:sid,pin:'5702',pinConfirm:'5702',requestId:id()};
  for(const uid of ['student','other-teacher'])await denied(h.changeStudentPin(args,uid),'FORBIDDEN');
  await h.changeStudentPin(args,'teacher');await h.changeStudentPin(args,'teacher');
  assert.equal([...db.rows.values()].filter(v=>v.action==='pin-change').length,1);
  for(const [method,data] of [['startSession',{gameId:'1math3',mode:'regular',requestId:id()}],['getSession',{sessionId:s.sessionId}],['finishSession',{sessionId:s.sessionId,reason:'quit',requestId:id()}],['submitAnswer',{sessionId:s.sessionId,questionId:s.questions[0].id,skip:true,requestId:id()}],['setGlobalParticipation',{enabled:true}]])await denied(h[method](data,'student'),'PENDING_APPROVAL');
  await denied(h.redeemStudentReturnTicket({ticket:ticket.ticket,requestId:id()},'ticket-device'),'FORBIDDEN');
  await denied(login('wrong',sid),'LOGIN_FAILED');assert.equal((await login('new',sid,'5702')).status,'approved');
  const roster=await h.listClassStudents({classId:cls.classId},'teacher');
  assert.equal(JSON.stringify(roster).includes('verifier'),false);assert.equal('pin' in roster.students[0],false);
});

test('PIN reset cannot be claimed by name/code or old authentication; a newly issued teacher ticket permits enrollment',async()=>{
  const {db,h,cls,register,login}=await fixture(),sid=await register('student');
  await h.changeStudentPin({classId:cls.classId,studentId:sid,reset:true,requestId:id()},'teacher');
  assert.equal((await h.getStudentStatus({},'student')).status,'new');
  await denied(h.setStudentPin({pin:'5702',pinConfirm:'5702',requestId:id()},'student'),'FORBIDDEN');
  await denied(login('stranger',sid),'LOGIN_FAILED');
  const ticket=await h.issueStudentReturnTicket({classId:cls.classId,studentId:sid},'teacher');
  const result=await h.redeemStudentReturnTicket({ticket:ticket.ticket,requestId:id()},'recovered');assert.equal(result.status,'pin-required');
  await h.setStudentPin({pin:'5702',pinConfirm:'5702',requestId:id()},'recovered');
  assert.equal(db.rows.get('studentBindings/recovered').studentId,sid);
  assert.equal((await login('another',sid,'5702')).status,'approved');
});

test('cross-class student IDs, stale class grants, teacher identities, deletion and revoked login replays are rejected',async()=>{
  const {db,h,cls,register,login}=await fixture(),sid=await register('student');
  const other=await h.createClass({privateLabel:'다른반',requestId:id()},'other-teacher');
  const roster=await h.getClassLoginRoster({code:other.code},'attacker');
  await denied(h.loginStudentPin({grant:roster.grant,studentId:sid,pin:'4826',requestId:id()},'attacker'),'LOGIN_FAILED');
  await denied(login('teacher',sid),'LOGIN_FAILED');
  const grant=(await h.getClassLoginRoster({code:cls.code},'new')).grant,args={grant,studentId:sid,pin:'4826',requestId:id()};
  await h.loginStudentPin(args,'new');assert.equal((await h.loginStudentPin(args,'new')).status,'approved');
  await login('other',sid);await denied(h.loginStudentPin(args,'new'),'LOGIN_FAILED');
  await h.removeStudent({classId:cls.classId,studentId:sid,requestId:id()},'teacher');
  await denied(login('fresh',sid),'LOGIN_FAILED');assert.equal((await h.getClassLoginRoster({code:cls.code},'fresh')).students.length,0);
  assert.ok([...db.rows.values()].find(v=>v.action==='remove'));
});

test('Worker takes rate-limit identity from edge context and never echoes a PIN in errors or diagnostics',async()=>{
  const {db,cls}=await fixture(),env={...fixtureEnv(),MATH3_SERVER_SECRET:secret},diagnostics=[];
  const req=new Request('https://worker.example/api/loginStudentPin',{method:'POST',headers:{origin:env.ALLOWED_ORIGINS,authorization:'Bearer test','content-type':'application/json','cf-connecting-ip':'192.0.2.10'},body:JSON.stringify({data:{grant:'invalid',studentId:cls.classId,pin:'4826',requestId:id()}})});
  const res=await handleRequest(req,env,{database:db,verifyToken:async()=>({sub:'attacker',network:'spoof'}),reportError:d=>diagnostics.push(d)});
  assert.equal(res.status,400);assert.equal((await res.text()).includes('4826'),false);assert.deepEqual(diagnostics,[]);
  const key=value=>`rateLimits/${createHmac('sha256',secret).update(value).digest('hex')}`;
  assert.equal(db.rows.get(key('network:192.0.2.10:student-pin')).count,1);
  assert.equal(db.rows.has(key('network:spoof:student-pin')),false);
});

test('reset recovery also works on the same revoked device without losing its active-session pointer',async()=>{
  const {h,cls,register}=await fixture(),sid=await register('student');
  const s=await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student');
  await h.changeStudentPin({classId:cls.classId,studentId:sid,reset:true,requestId:id()},'teacher');
  const ticket=await h.issueStudentReturnTicket({classId:cls.classId,studentId:sid},'teacher');
  await h.redeemStudentReturnTicket({ticket:ticket.ticket,requestId:id()},'student');
  await h.setStudentPin({pin:'5702',pinConfirm:'5702',requestId:id()},'student');
  assert.equal((await h.startSession({gameId:'1math3',mode:'regular',requestId:id()},'student')).sessionId,s.sessionId);
});
