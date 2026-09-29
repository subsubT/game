import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';

const projectId = 'demo-1math3-checkpoint3';
const config = { apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId, appId: '1:123:web:abc' };
let nextApp = 0;
async function client() {
  const app = initializeApp(config, `emulator-${++nextApp}`), auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const user = (await signInAnonymously(auth)).user;
  const fn = getFunctions(app, 'asia-northeast3'); connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  return { app, uid: user.uid, call: async (name, data = {}) => (await httpsCallable(fn, name)(data)).data };
}
const id = () => crypto.randomUUID();
const answerOf = q => {
  if (q.typeId === 'add_three_small' || q.typeId === 'make_ten_then_add') return q.operands.reduce((a, b) => a + b, 0);
  if (q.typeId === 'subtract_three_small') return q.operands[0] - q.operands[1] - q.operands[2];
  return 10 - q.operands[q.typeId === 'make_ten' ? 0 : 1];
};
async function play(client, session, skipFirst = false) {
  let state = session;
  while (state.status === 'playing') {
    const q = state.questions[state.currentIndex];
    if (skipFirst && q.index === 0) state = (await client.call('submitAnswer', { sessionId: state.sessionId, questionId: q.id, skip: true, expectedRevision: state.revision, requestId: id() })).session;
    else {
      if (q.step === 'pair') {
        const pair = [[0, 1], [0, 2], [1, 2]].find(([a, b]) => q.operands[a] + q.operands[b] === 10);
        state = (await client.call('submitAnswer', { sessionId: state.sessionId, questionId: q.id, response: pair, expectedRevision: state.revision, requestId: id() })).session;
      }
      const current = state.questions[state.currentIndex];
      state = (await client.call('submitAnswer', { sessionId: state.sessionId, questionId: current.id, response: answerOf(current), expectedRevision: state.revision, requestId: id() })).session;
    }
  }
  return state;
}

test('Firebase Auth, Functions, Firestore Rules, isolation, ranking and retries', { timeout: 300000 }, async () => {
  const teacherA = await client(), teacherB = await client(), studentA = await client(), studentB = await client(), studentC = await client(), pending = await client();
  const apps = [teacherA, teacherB, studentA, studentB, studentC, pending].map(x => x.app);
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  try {
    const spaceA = await teacherA.call('createTeacherSpace', { requestId: id() });
    await teacherB.call('createTeacherSpace', { requestId: id() });
    assert.ok(spaceA.recoveryKey);
    const classA = await teacherA.call('createClass', { privateLabel: 'A반', requestId: id() });
    const classB = await teacherB.call('createClass', { privateLabel: 'B반', requestId: id() });
    assert.notEqual(classA.code, classB.code);
    assert.equal(classA.globalOptIn, true);
    await assert.rejects(teacherB.call('listPendingStudents', { classId: classA.classId }));

    for (const [who, code] of [[studentA, classA.code], [studentB, classA.code], [studentC, classB.code], [pending, classB.code]]) {
      const join = await who.call('requestJoin', { code, privateName: '학생', requestId: id() });
      assert.equal(join.status, 'pending'); assert.match(join.checkMark, /^\d\d$/);
      assert.equal((await who.call('getStudentStatus')).status, 'pending');
      await assert.rejects(who.call('getLeaderboard', { gameId: '1math3', rulesVersion: '1.0.0', curriculumVersion: '1.0.0', seasonId: '2026-09', scope: 'class' }));
      await assert.rejects(who.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() }));
    }
    const aPending = (await teacherA.call('listPendingStudents', { classId: classA.classId })).students;
    const bPending = (await teacherB.call('listPendingStudents', { classId: classB.classId })).students;
    assert.equal(aPending.length, 2); assert.equal(bPending.length, 2);
    for (const s of aPending) await teacherA.call('approveStudent', { classId: classA.classId, studentId: s.studentId });
    await teacherB.call('approveStudent', { classId: classB.classId, studentId: bPending[0].studentId });
    const cStatus = await studentC.call('getStudentStatus'), pStatus = await pending.call('getStudentStatus');
    const c = cStatus.status === 'approved' ? studentC : pending, unapproved = c === studentC ? pending : studentC;
    assert.equal((await unapproved.call('getStudentStatus')).status, 'pending');

    const startId = id(), first = await studentA.call('startSession', { gameId: '1math3', mode: 'regular', requestId: startId });
    const duplicateStart = await studentA.call('startSession', { gameId: '1math3', mode: 'regular', requestId: startId });
    assert.equal(duplicateStart.sessionId, first.sessionId);
    assert.equal(first.questions[1].answer, undefined); assert.equal(first.questions[1].operands, undefined);
    await assert.rejects(studentB.call('getSession', { sessionId: first.sessionId }));
    await assert.rejects(studentA.call('submitAnswer', { sessionId: first.sessionId, questionId: first.questions[0].id, response: 0, score: 500, requestId: id() }));
    const q = first.questions[0], answer = answerOf(q), submitId = id();
    const accepted = await studentA.call('submitAnswer', { sessionId: first.sessionId, questionId: q.id, response: answer, expectedRevision: first.revision, requestId: submitId });
    const same = await studentA.call('submitAnswer', { sessionId: first.sessionId, questionId: q.id, response: answer, expectedRevision: first.revision, requestId: submitId });
    assert.deepEqual(same, accepted);
    let answerCount;
    await env.withSecurityRulesDisabled(async ctx => { answerCount = await ctx.firestore().collection(`classes/${classA.classId}/sessions/${first.sessionId}/answers`).get(); });
    assert.equal(answerCount.size, 1);
    await assert.rejects(studentA.call('submitAnswer', { sessionId: first.sessionId, questionId: q.id, response: 0, expectedRevision: first.revision, requestId: submitId }));
    assert.equal((await studentA.call('getSession', { sessionId: first.sessionId })).currentIndex, 1);

    const bStart = await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    const bQuestion = bStart.questions[0], race = await Promise.allSettled([
      studentB.call('submitAnswer', { sessionId: bStart.sessionId, questionId: bQuestion.id, response: answerOf(bQuestion), expectedRevision: 0, requestId: id() }),
      studentB.call('submitAnswer', { sessionId: bStart.sessionId, questionId: bQuestion.id, response: 19, expectedRevision: 0, requestId: id() })
    ]);
    assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await studentB.call('getSession', { sessionId: bStart.sessionId })).currentIndex, 1);
    const bFinish = await studentB.call('finishSession', { sessionId: bStart.sessionId, reason: 'quit', requestId: id() });
    assert.equal(bFinish.result.completion, 'incomplete'); assert.equal(bFinish.rankStatus, 'excluded');
    const again = await studentB.call('finishSession', { sessionId: bStart.sessionId, reason: 'quit', requestId: id() });
    assert.deepEqual(again.result, bFinish.result);

    const aDone = await play(studentA, accepted.session);
    assert.equal(aDone.result.score, 500); assert.equal(aDone.result.completion, 'complete');
    assert.equal(aDone.result.saveStatus, 'confirmed');
    const cStart = await c.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    const cDone = await play(c, cStart); assert.equal(cDone.result.score, 500);
    const bNext = await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    const bDone = await play(studentB, bNext, true); assert.equal(bDone.result.score, 490);
    const seasonId = aDone.seasonId, boardArgs = { gameId: '1math3', rulesVersion: '1.0.0', curriculumVersion: '1.0.0', seasonId };
    const classBoard = await studentA.call('getLeaderboard', { ...boardArgs, scope: 'class' });
    assert.deepEqual(classBoard.entries.map(x => x.score), [500, 490]);
    assert.deepEqual((await teacherA.call('getTeacherLeaderboard', { classId: classA.classId, seasonId })).entries.map(x => x.score), [500, 490]);
    await assert.rejects(teacherB.call('getTeacherLeaderboard', { classId: classA.classId, seasonId }));
    await assert.rejects(studentA.call('getTeacherLeaderboard', { classId: classA.classId, seasonId }));
    const otherClassBoard = await c.call('getLeaderboard', { ...boardArgs, scope: 'class' });
    assert.equal(otherClassBoard.entries.length, 1);
    const global = await pending.call('getLeaderboard', { ...boardArgs, scope: 'global' });
    assert.equal(global.entries.length, 3); assert.deepEqual(global.entries.map(x => x.rank), [1, 1, 3]);
    assert.ok(global.entries.every(x => !('studentId' in x) && !('classId' in x) && !('privateName' in x)));
    assert.notEqual(classBoard.entries[0].displayAlias, global.entries[0].displayAlias);
    const details = await teacherA.call('getSessionDetails', { classId: classA.classId, sessionId: first.sessionId });
    assert.equal(details.answers.length, 50); assert.equal(details.result.score, 500);
    await assert.rejects(teacherB.call('getSessionDetails', { classId: classA.classId, sessionId: first.sessionId }));
    await assert.rejects(studentA.call('getSessionDetails', { classId: classA.classId, sessionId: first.sessionId }));
    const bImprovement = await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    const improved = await play(studentB, bImprovement); assert.equal(improved.result.score, 500);
    assert.deepEqual((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'class' })).entries.map(x => x.rank), [1, 1]);
    assert.deepEqual((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'global' })).entries.map(x => x.rank), [1, 1, 1]);
    await studentA.call('setGlobalParticipation', { enabled: false });
    assert.equal((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'global' })).entries.length, 2);
    await studentA.call('setGlobalParticipation', { enabled: true });
    assert.equal((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'global' })).entries.length, 3);
    await assert.rejects(teacherA.call('setClassGlobalParticipation', { classId: classB.classId, enabled: false }));
    await teacherB.call('setClassGlobalParticipation', { classId: classB.classId, enabled: false });
    assert.equal((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'global' })).entries.length, 2);
    await teacherB.call('setClassGlobalParticipation', { classId: classB.classId, enabled: true });
    assert.equal((await studentA.call('getLeaderboard', { ...boardArgs, scope: 'global' })).entries.length, 3);
    assert.equal((await studentA.call('getLeaderboard', { ...boardArgs, seasonId: '2026-08', scope: 'global' })).entries.length, 0);
    await assert.rejects(studentA.call('getLeaderboard', { ...boardArgs, seasonId: '2026-08', rulesVersion: '0.9.0', scope: 'global' }));

    const expiring = await studentA.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`classes/${classA.classId}/sessions/${expiring.sessionId}`).update({ expiresAt: '2000-01-01T00:00:00.000Z' }));
    const expired = await studentA.call('getSession', { sessionId: expiring.sessionId });
    assert.equal(expired.result.completion, 'incomplete'); assert.equal(expired.result.rankStatus, 'excluded');

    const aliasA = (await studentA.call('getStudentStatus')).classAlias;
    const roster = (await teacherA.call('listClassStudents', { classId: classA.classId })).students;
    const studentIdA = roster.find(x => x.classAlias === aliasA).studentId;
    await assert.rejects(teacherB.call('issueStudentReturnTicket', { classId: classA.classId, studentId: studentIdA }));
    const { ticket } = await teacherA.call('issueStudentReturnTicket', { classId: classA.classId, studentId: studentIdA });
    const newDevice = await client(); apps.push(newDevice.app);
    await studentA.call('detachStudentDevice');
    const ticketRequestId = id();
    const transferred = await newDevice.call('redeemStudentReturnTicket', { ticket, requestId: ticketRequestId });
    assert.equal(transferred.status, 'approved');
    assert.deepEqual(await newDevice.call('redeemStudentReturnTicket', { ticket, requestId: ticketRequestId }), transferred);
    assert.equal((await newDevice.call('getSession', { sessionId: first.sessionId })).result.score, 500);
    await assert.rejects(studentA.call('getSession', { sessionId: first.sessionId }));
    const replay = await client(); apps.push(replay.app);
    await assert.rejects(replay.call('redeemStudentReturnTicket', { ticket, requestId: id() }));

    const anonDb = env.authenticatedContext(studentA.uid).firestore();
    await assertFails(anonDb.doc(`classes/${classA.classId}`).get());
    await assertFails(anonDb.doc(`classes/${classA.classId}/sessions/${first.sessionId}`).get());
    await assertFails(anonDb.doc(`globalBoards/${boardArgs.gameId}:${boardArgs.rulesVersion}:${boardArgs.curriculumVersion}:${seasonId}`).get());
    await assertFails(anonDb.doc(`classes/${classA.classId}`).set({ score: 500 }));
  } finally { await env.cleanup(); await Promise.all(apps.map(deleteApp)); }
});
