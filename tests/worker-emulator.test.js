import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { FirestoreRest } from '../worker/src/firestore-rest.js';
import { handleRequest } from '../worker/src/index.js';
import { createSheetService } from '../worker/src/sheets.js';
import { FakeGoogle, fixtureEnv } from './sheets-fakes.js';

const projectId = 'demo-1math3-checkpoint3';
const db = new FirestoreRest(projectId, 'owner', fetch, 'http://127.0.0.1:8080/v1');
const env = { FIREBASE_PROJECT_ID: projectId, ALLOWED_ORIGINS: 'http://127.0.0.1:8000', MATH3_SERVER_SECRET: 'local-emulator-only-secret-not-for-production', FIREBASE_SERVICE_ACCOUNT_JSON: 'test-only' };
const id = () => crypto.randomUUID();
async function call(uid, name, data = {}) {
  const request = new Request(`https://example.workers.dev/api/${name}`, { method: 'POST', headers: { origin: env.ALLOWED_ORIGINS, authorization: `Bearer ${uid}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
  const response = await handleRequest(request, env, { verifyToken: async token => token, database: db, reportError: error => console.error(error) });
  const json = await response.json();
  if (!response.ok) throw new Error(`${name}: ${response.status} ${JSON.stringify(json)}`);
  return json.result;
}
const answerOf = q => {
  if (q.typeId === 'add_three_small' || q.typeId === 'make_ten_then_add') return q.operands.reduce((a, b) => a + b, 0);
  if (q.typeId === 'subtract_three_small') return q.operands[0] - q.operands[1] - q.operands[2];
  return 10 - q.operands[q.typeId === 'make_ten' ? 0 : 1];
};

test('real Firestore free saves are atomic, resumable across devices, isolated and distinct from final history',{timeout:180000},async()=>{
  const teacher='progress-teacher',student='progress-student';await call(teacher,'createTeacherSpace',{requestId:id()});
  const cls=await call(teacher,'createClass',{privateLabel:'自由저장실검사',requestId:id()});
  await call(student,'requestJoin',{code:cls.code,privateName:'가상학생',pin:'4826',pinConfirm:'4826',requestId:id()});
  const sid=(await call(teacher,'listClassStudents',{classId:cls.classId})).students[0].studentId;
  assert.equal((await call(student,'getStudentGames')).games[0].activeSession,null);
  let s=await call(student,'startSession',{gameId:'1math3',mode:'regular',requestId:id()});
  const uiState={view:'playing',questionId:s.questions[0].id,draft:'1',selected:[]},args={sessionId:s.sessionId,expectedRevision:s.revision,uiState,requestId:id()};
  const saved=await Promise.all([call(student,'saveSession',args),call(student,'saveSession',args)]);assert.deepEqual(saved[0],saved[1]);s=saved[0].session;
  assert.equal(s.revision,1);assert.equal(s.progressState,'paused');assert.equal(s.expiresAt,null);
  await assert.rejects(call(student,'submitAnswer',{sessionId:s.sessionId,questionId:s.questions[0].id,skip:true,requestId:id()}),/SESSION_PAUSED/);
  const roster=await call('progress-new-device','getClassLoginRoster',{code:cls.code});
  await call('progress-new-device','loginStudentPin',{grant:roster.grant,studentId:sid,pin:'4826',requestId:id()});
  const hub=await call('progress-new-device','getStudentGames');assert.deepEqual(hub.games[0].activeSession.uiState,uiState);
  await assert.rejects(call(student,'saveSession',{...args,requestId:id()}));
  s=await call('progress-new-device','resumeSession',{sessionId:s.sessionId,expectedRevision:s.revision,requestId:id()});
  s=(await call('progress-new-device','submitAnswer',{sessionId:s.sessionId,questionId:s.questions[0].id,skip:true,expectedRevision:s.revision,requestId:id()})).session;
  assert.equal(s.currentIndex,1);
  s=(await call('progress-new-device','saveSession',{sessionId:s.sessionId,expectedRevision:s.revision,uiState:{view:'feedback',questionId:s.questions[0].id,draft:'',selected:[]},requestId:id()})).session;
  const records=await call(teacher,'listClassSessions',{classId:cls.classId,gameId:'1math3'});assert.equal(records.sessions[0].status,'playing');assert.equal(records.sessions[0].progressState,'paused');
  assert.equal((await call(teacher,'getSessionDetails',{classId:cls.classId,sessionId:s.sessionId})).answers.length,1);
  await assert.rejects(call('outsider','getStudentGames'));
});

test('real Firestore PIN transactions preserve legacy data, revoke races, protect credentials and recover after reset', {timeout:180000},async()=>{
  const teacher='pin-teacher',student='pin-old',otherTeacher='pin-other-teacher';
  await call(teacher,'createTeacherSpace',{requestId:id()});await call(otherTeacher,'createTeacherSpace',{requestId:id()});
  const cls=await call(teacher,'createClass',{privateLabel:'PIN실트랜잭션',requestId:id()});
  await call(student,'requestJoin',{code:cls.code,privateName:'검증학생',pin:'4826',pinConfirm:'4826',requestId:id()});
  const sid=(await call(teacher,'listClassStudents',{classId:cls.classId})).students[0].studentId;
  let session=await call(student,'startSession',{gameId:'1math3',mode:'regular',requestId:id()});
  session=(await call(student,'submitAnswer',{sessionId:session.sessionId,questionId:session.questions[0].id,skip:true,expectedRevision:session.revision,requestId:id()})).session;
  const path=`classes/${cls.classId}/sessions/${session.sessionId}`,ledger=(await db.doc(path).get()).data();
  // Recreate the pre-PIN record shape without touching the learning ledger.
  await db.runTransaction(async tx=>{
    tx.update(db.doc(`classes/${cls.classId}/students/${sid}`),{pinReady:false,pinVersion:0});
    tx.update(db.doc(`studentBindings/${student}`),{pinVersion:0});tx.delete(db.doc(`studentPins/${cls.classId}:${sid}`));
  });
  assert.equal((await call(student,'getStudentStatus')).status,'pin-required');
  await assert.rejects(call('pin-stranger','setStudentPin',{pin:'4826',pinConfirm:'4826',requestId:id()}),/FORBIDDEN/);
  await call(student,'setStudentPin',{pin:'4826',pinConfirm:'4826',requestId:id()});
  const rosterA=await call('pin-device-a','getClassLoginRoster',{code:cls.code}),rosterB=await call('pin-device-b','getClassLoginRoster',{code:cls.code});
  await assert.rejects(call('pin-device-a','loginStudentPin',{grant:rosterA.grant,studentId:sid,pin:'0000',requestId:id()}),/LOGIN_FAILED/);
  await assert.rejects(call('pin-device-b','loginStudentPin',{grant:rosterA.grant,studentId:sid,pin:'4826',requestId:id()}),/LOGIN_FAILED/);
  const logins=await Promise.all([call('pin-device-a','loginStudentPin',{grant:rosterA.grant,studentId:sid,pin:'4826',requestId:id()}),call('pin-device-b','loginStudentPin',{grant:rosterB.grant,studentId:sid,pin:'4826',requestId:id()})]);
  assert.ok(logins.every(s=>s.status==='approved'));
  const member=(await db.doc(`classes/${cls.classId}/students/${sid}`).get()).data(),winner=member.uid,loser=winner==='pin-device-a'?'pin-device-b':'pin-device-a';
  assert.equal((await call(winner,'startSession',{gameId:'1math3',mode:'regular',requestId:id()})).sessionId,session.sessionId);
  for(const uid of [student,loser])await assert.rejects(call(uid,'getSession',{sessionId:session.sessionId}));
  assert.deepEqual((await db.doc(path).get()).data(),ledger);
  const ticket=await call(teacher,'issueStudentReturnTicket',{classId:cls.classId,studentId:sid});
  await assert.rejects(call(otherTeacher,'changeStudentPin',{classId:cls.classId,studentId:sid,reset:true,requestId:id()}),/FORBIDDEN/);
  await call(teacher,'changeStudentPin',{classId:cls.classId,studentId:sid,reset:true,requestId:id()});
  await assert.rejects(call(winner,'submitAnswer',{sessionId:session.sessionId,questionId:session.questions[1].id,skip:true,requestId:id()}));
  await assert.rejects(call('pin-new','redeemStudentReturnTicket',{ticket:ticket.ticket,requestId:id()}),/FORBIDDEN/);
  const newTicket=await call(teacher,'issueStudentReturnTicket',{classId:cls.classId,studentId:sid});
  assert.equal((await call(winner,'redeemStudentReturnTicket',{ticket:newTicket.ticket,requestId:id()})).status,'pin-required');
  await call(winner,'setStudentPin',{pin:'5702',pinConfirm:'5702',requestId:id()});
  assert.equal((await call(winner,'startSession',{gameId:'1math3',mode:'regular',requestId:id()})).sessionId,session.sessionId);
  const credential=(await db.doc(`studentPins/${cls.classId}:${sid}`).get()).data();assert.ok(credential.verifier);assert.equal('pin' in credential,false);
  const rules=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080}});
  try {
    for(const uid of [winner,teacher,'outsider']) {
      const client=rules.authenticatedContext(uid).firestore();
      await assertFails(client.doc(`studentPins/${cls.classId}:${sid}`).get());
      await assertFails(client.doc(`studentPins/${cls.classId}:${sid}`).set({pin:'0000'}));
    }
  } finally { await rules.cleanup(); }
});

test('Worker CP3 handlers preserve approval, server scoring, ranking, retries and Firestore denial', { timeout: 300000 }, async () => {
  const teacher = 'worker-teacher', student = 'worker-student', outsider = 'worker-outsider';
  const rules = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  try {
    const space = await call(teacher, 'createTeacherSpace', { requestId: id() });
    assert.ok(space.recoveryKey);
    const cls = await call(teacher, 'createClass', { privateLabel: 'Worker반', requestId: id() });
    assert.match(cls.code, /^[0-9]{4}$/);
    assert.equal((await call(student, 'requestJoin', {pin:'4826',pinConfirm:'4826',code: cls.code, privateName: '학생', requestId: id() })).status, 'approved');
    await assert.rejects(call(outsider, 'listClassStudents', { classId: cls.classId }));
    assert.equal((await call(teacher, 'listPendingStudents', { classId: cls.classId })).students.length, 0);
    const startId = id();
    let session = await call(student, 'startSession', { gameId: '1math3', mode: 'regular', requestId: startId });
    assert.equal((await call(student, 'startSession', { gameId: '1math3', mode: 'regular', requestId: startId })).sessionId, session.sessionId);
    assert.equal(session.questions[1].answer, undefined);
    await assert.rejects(call(outsider, 'getSession', { sessionId: session.sessionId }));
    const q = session.questions[0], requestId = id();
    const args = { sessionId: session.sessionId, questionId: q.id, response: answerOf(q), expectedRevision: 0, requestId };
    const accepted = await call(student, 'submitAnswer', args);
    assert.deepEqual(await call(student, 'submitAnswer', args), accepted);
    await assert.rejects(call(student, 'submitAnswer', { ...args, response: 99 }));
    session = accepted.session;
    while (session.status === 'playing') {
      let question = session.questions[session.currentIndex];
      if (question.step === 'pair') {
        const pair = [[0, 1], [0, 2], [1, 2]].find(([a, b]) => question.operands[a] + question.operands[b] === 10);
        session = (await call(student, 'submitAnswer', { sessionId: session.sessionId, questionId: question.id, response: pair, expectedRevision: session.revision, requestId: id() })).session;
        question = session.questions[session.currentIndex];
      }
      session = (await call(student, 'submitAnswer', { sessionId: session.sessionId, questionId: question.id, response: answerOf(question), expectedRevision: session.revision, requestId: id() })).session;
    }
    assert.equal(session.result.score, 500);
    const seasonId = session.seasonId;
    const teacherBoard = await call(teacher, 'getTeacherLeaderboard', { classId: cls.classId, seasonId });
    assert.deepEqual(teacherBoard.entries.map(entry => entry.score), [500]);
    assert.ok(teacherBoard.entries.every(entry => !('studentId' in entry) && !('privateName' in entry)));
    await assert.rejects(call(outsider, 'getTeacherLeaderboard', { classId: cls.classId, seasonId }));
    const roster = (await call(teacher, 'listClassStudents', { classId: cls.classId })).students;
    assert.equal(roster[0].bestScores[`1math3:1.0.0:1.0.0:${seasonId}`], 500);
    assert.equal(roster[0].globalOptIn, true);
    const board = await call(student, 'getLeaderboard', { gameId: '1math3', rulesVersion: '1.0.0', curriculumVersion: '1.0.0', seasonId: session.seasonId, scope: 'class' });
    assert.deepEqual(board.entries.map(entry => entry.score), [500]);
    assert.equal((await call(teacher, 'getSessionDetails', { classId: cls.classId, sessionId: session.sessionId })).answers.length, 50);
    await assert.rejects(call(outsider, 'getSessionDetails', { classId: cls.classId, sessionId: session.sessionId }));
    const clientDb = rules.authenticatedContext(student).firestore();
    await assertFails(clientDb.doc(`classes/${cls.classId}`).get());
    await assertFails(clientDb.doc(`classes/${cls.classId}`).set({ score: 500 }));
    // Real Firestore REST transactions + fake external Google transport.
    const googleEnv = { ...fixtureEnv(), FIREBASE_PROJECT_ID: projectId }, google = new FakeGoogle();
    const sheets = createSheetService(db, googleEnv, {googleApi:google,verifyGoogleIdentity:async()=>google.subject});
    const begun = await sheets.handlers.beginGoogleConnection({},teacher);
    const navigation = await sheets.start(new Request(begun.authorizationUrl));
    const oauthUrl = new URL(navigation.headers.get('location'));
    const callbackRequest = new Request(`${googleEnv.GOOGLE_REDIRECT_URI}?state=${oauthUrl.searchParams.get('state')}&code=emulator-google-code`,{headers:{cookie:navigation.headers.get('set-cookie').split(';')[0]}});
    assert.equal(new URL((await sheets.callback(callbackRequest)).headers.get('location')).hash,'#sheets=connected');
    await assert.rejects(sheets.callback(callbackRequest));
    const storedConnection = (await db.doc(`sheetConnections/${space.teacherId}`).get()).data();
    assert.ok(storedConnection.refreshCipher);assert.ok(!JSON.stringify(storedConnection).includes(google.refreshValue));
    await assertFails(clientDb.doc(`sheetConnections/${space.teacherId}`).get());
    await assertFails(clientDb.doc(`sheetConnections/${space.teacherId}`).set({status:'connected'}));
    const firstSheet = await sheets.handlers.createOrSelectSheet({classId:cls.classId},teacher);
    await sheets.handlers.syncSheet({classId:cls.classId},teacher);
    assert.equal(google.creates,1);assert.equal(google.last.tables['회차'].length,2);assert.equal(google.last.tables['문항'].length,51);
    assert.equal(firstSheet.sheet.status,'synced');
    await assert.rejects(sheets.handlers.getGoogleConnectionStatus({classId:cls.classId},outsider));
    const memberId=roster[0].studentId;
    await assert.rejects(call(student,'renameStudent',{classId:cls.classId,studentId:memberId,privateName:'변조',requestId:id()}));
    await call(teacher,'renameStudent',{classId:cls.classId,studentId:memberId,privateName:'교사변경',requestId:id()});
    assert.equal((await call(student,'getStudentStatus')).privateName,'교사변경');
    const returnTicket=await call(teacher,'issueStudentReturnTicket',{classId:cls.classId,studentId:memberId});
    await call(teacher,'removeStudent',{classId:cls.classId,studentId:memberId,requestId:id()});
    assert.equal((await call(student,'getStudentStatus')).status,'new');
    await assert.rejects(call(student,'getSession',{sessionId:session.sessionId}));
    await assert.rejects(call(outsider,'redeemStudentReturnTicket',{ticket:returnTicket.ticket,requestId:id()}));
    assert.equal((await call(teacher,'getTeacherLeaderboard',{classId:cls.classId,seasonId})).entries.length,0);
    assert.equal((await call(teacher,'getSessionDetails',{classId:cls.classId,sessionId:session.sessionId})).result.score,500);
    await sheets.runJobs();assert.equal(google.last.tables['학생요약'].length,1);
    const recovered = 'worker-recovered-teacher';
    const nextKey = await call(recovered, 'recoverTeacherSpace', { recoveryKey: space.recoveryKey, requestId: id() });
    assert.ok(nextKey.recoveryKey);
    assert.equal((await db.doc(`sheetConnections/${space.teacherId}`).get()).exists,false);
    assert.equal((await sheets.handlers.getGoogleConnectionStatus({classId:cls.classId},recovered)).sheet,null);
    assert.equal((await call(recovered, 'listClasses')).classes[0].classId, cls.classId);
    await assert.rejects(call(teacher, 'listClasses'));
    await assert.rejects(call('worker-replay', 'recoverTeacherSpace', { recoveryKey: space.recoveryKey, requestId: id() }));
  } finally { await rules.cleanup(); }
});
