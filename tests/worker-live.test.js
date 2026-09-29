// Opt-in integration test against the isolated math3-dev project. Creates test data.
// Run: $env:MATH3_LIVE_TEST='1'; node --test tests/worker-live.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveApiKey } from './live-config.js';

const projectId = 'math3-dev';
const worker = 'https://math3-cp3-dev.subsubt-math3-dev.workers.dev';
const origin = 'https://subsubt.github.io';
const id = () => crypto.randomUUID();
const calls = new Map();

async function client() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await liveApiKey()}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  const account = await response.json();
  assert.equal(response.status, 200, 'Firebase anonymous sign-in');
  assert.equal(typeof account.idToken, 'string');
  return { uid: account.localId, token: account.idToken, call: (name, data = {}) => call(account.idToken, name, data) };
}

async function raw(token, name, data = {}, extra = {}) {
  const start = performance.now();
  const response = await fetch(`${worker}/api/${name}`, {
    method: 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra },
    body: JSON.stringify({ data })
  });
  const result = await response.json();
  const current = calls.get(name) || { count: 0, totalMs: 0, maximumMs: 0 };
  current.count++; current.totalMs += performance.now() - start; current.maximumMs = Math.max(current.maximumMs, performance.now() - start);
  calls.set(name, current);
  return { response, result };
}
async function call(token, name, data = {}) {
  const { response, result } = await raw(token, name, data);
  if (!response.ok) throw Object.assign(new Error(`${name}: ${result.error?.code || response.status}`), { code: result.error?.code, status: response.status });
  return result.result;
}
async function rejects(promise, code) { await assert.rejects(promise, error => error.code === code); }
const boardArgs = seasonId => ({ gameId: '1math3', rulesVersion: '1.0.0', curriculumVersion: '1.0.0', seasonId });
function answerOf(q) {
  if (q.typeId === 'add_three_small' || q.typeId === 'make_ten_then_add') return q.operands.reduce((a, b) => a + b, 0);
  if (q.typeId === 'subtract_three_small') return q.operands[0] - q.operands[1] - q.operands[2];
  return 10 - q.operands[q.typeId === 'make_ten' ? 0 : 1];
}
async function play(who, session, skipFirst = false) {
  let state = session;
  while (state.status === 'playing') {
    let q = state.questions[state.currentIndex];
    if (skipFirst && q.index === 0) {
      state = (await who.call('submitAnswer', { sessionId: state.sessionId, questionId: q.id, skip: true, expectedRevision: state.revision, requestId: id() })).session;
      continue;
    }
    if (q.step === 'pair') {
      const pair = [[0, 1], [0, 2], [1, 2]].find(([a, b]) => q.operands[a] + q.operands[b] === 10);
      state = (await who.call('submitAnswer', { sessionId: state.sessionId, questionId: q.id, response: pair, expectedRevision: state.revision, requestId: id() })).session;
      q = state.questions[state.currentIndex];
    }
    state = (await who.call('submitAnswer', { sessionId: state.sessionId, questionId: q.id, response: answerOf(q), expectedRevision: state.revision, requestId: id() })).session;
  }
  return state;
}

test('actual Firebase and Worker flow, security, retries and rankings', { skip: process.env.MATH3_LIVE_TEST !== '1', timeout: 900000 }, async () => {
  const suffix = Date.now().toString(36);
  const [teacherA, teacherB, studentA, studentB, studentC, pending] = await Promise.all(Array.from({ length: 6 }, client));
  try {
    const noAuth = await fetch(`${worker}/api/getStudentStatus`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"data":{}}' });
    assert.equal(noAuth.status, 401);
    const badOrigin = await raw(studentA.token, 'getStudentStatus', {}, { origin: 'https://forbidden.example' });
    assert.equal(badOrigin.response.status, 403);
    assert.equal(badOrigin.response.headers.get('access-control-allow-origin'), null);
    const tampered = `${studentA.token.slice(0, -3)}abc`;
    const badToken = await raw(tampered, 'getStudentStatus');
    assert.equal(badToken.response.status, 401);
    assert.equal((await studentA.call('getStudentStatus')).status, 'new');

    const space = await teacherA.call('createTeacherSpace', { requestId: id() });
    assert.ok(space.recoveryKey);
    await teacherB.call('createTeacherSpace', { requestId: id() });
    const classA = await teacherA.call('createClass', { privateLabel: `CP3A${suffix}`.slice(0, 12), requestId: id() });
    const classB = await teacherB.call('createClass', { privateLabel: `CP3B${suffix}`.slice(0, 12), requestId: id() });
    assert.equal(classA.globalOptIn, true);
    await rejects(teacherB.call('listPendingStudents', { classId: classA.classId }), 'FORBIDDEN');
    for (const [who, code] of [[studentA, classA.code], [studentB, classA.code], [studentC, classB.code], [pending, classB.code]]) {
      assert.equal((await who.call('requestJoin', { code, privateName: who.uid.slice(0, 12), requestId: id() })).status, 'pending');
    }
    await rejects(pending.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() }), 'PENDING_APPROVAL');
    const aStudents = (await teacherA.call('listPendingStudents', { classId: classA.classId })).students;
    const bStudents = (await teacherB.call('listPendingStudents', { classId: classB.classId })).students;
    for (const student of aStudents) await teacherA.call('approveStudent', { classId: classA.classId, studentId: student.studentId });
    const c = studentC;
    const cRow = bStudents.find(x => x.privateName === c.uid.slice(0, 12));
    assert.ok(cRow);
    await teacherB.call('approveStudent', { classId: classB.classId, studentId: cRow.studentId });

    const startId = id();
    const start = await studentA.call('startSession', { gameId: '1math3', mode: 'regular', requestId: startId });
    assert.equal((await studentA.call('startSession', { gameId: '1math3', mode: 'regular', requestId: startId })).sessionId, start.sessionId);
    assert.equal(start.questions[1].answer, undefined);
    await rejects(studentB.call('getSession', { sessionId: start.sessionId }), 'FORBIDDEN');
    await rejects(studentA.call('submitAnswer', { sessionId: start.sessionId, questionId: start.questions[0].id, response: 0, score: 500, requestId: id() }), 'INVALID_REQUEST');
    const q = start.questions[0], submitId = id();
    const args = { sessionId: start.sessionId, questionId: q.id, response: answerOf(q), expectedRevision: start.revision, requestId: submitId };
    const accepted = await studentA.call('submitAnswer', args);
    assert.deepEqual(await studentA.call('submitAnswer', args), accepted);
    await rejects(studentA.call('submitAnswer', { ...args, response: 99 }), 'REQUEST_CONFLICT');
    assert.equal((await studentA.call('getSession', { sessionId: start.sessionId })).currentIndex, 1);

    const quitStart = await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
    const quitId = id();
    const quit = await studentB.call('finishSession', { sessionId: quitStart.sessionId, reason: 'quit', requestId: quitId });
    assert.equal(quit.result.completion, 'incomplete');
    assert.equal(quit.rankStatus, 'excluded');
    assert.deepEqual(await studentB.call('finishSession', { sessionId: quitStart.sessionId, reason: 'quit', requestId: quitId }), quit);

    const doneA = await play(studentA, accepted.session);
    assert.equal(doneA.result.score, 500);
    assert.equal(doneA.result.completion, 'complete');
    const doneC = await play(c, await c.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() }));
    assert.equal(doneC.result.score, 500);
    const doneB = await play(studentB, await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() }), true);
    assert.equal(doneB.result.score, 490);
    const argsBoard = boardArgs(doneA.seasonId);
    assert.deepEqual((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'class' })).entries.map(x => x.score), [500, 490]);
    assert.deepEqual((await c.call('getLeaderboard', { ...argsBoard, scope: 'class' })).entries.map(x => x.score), [500]);
    assert.deepEqual((await teacherA.call('getTeacherLeaderboard', { classId: classA.classId, seasonId: doneA.seasonId })).entries.map(x => x.score), [500, 490]);
    assert.deepEqual((await teacherB.call('getTeacherLeaderboard', { classId: classB.classId, seasonId: doneA.seasonId })).entries.map(x => x.score), [500]);
    await rejects(teacherA.call('getTeacherLeaderboard', { classId: classB.classId, seasonId: doneA.seasonId }), 'FORBIDDEN');
    await rejects(studentA.call('getTeacherLeaderboard', { classId: classA.classId, seasonId: doneA.seasonId }), 'FORBIDDEN');
    const global = await pending.call('getLeaderboard', { ...argsBoard, scope: 'global' });
    assert.ok(global.entries.length >= 3);
    assert.ok(global.entries.every((x, i) => i === 0 || x.score <= global.entries[i - 1].score));
    const globalCount = global.entries.length;
    assert.ok(global.entries.every(x => !('studentId' in x) && !('classId' in x) && !('privateName' in x)));
    const firstPage = await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global', pageSize: 1 });
    assert.equal(firstPage.entries.length, 1);
    assert.ok(firstPage.nextCursor);
    const secondPage = await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global', pageSize: 1, cursor: firstPage.nextCursor });
    assert.equal(secondPage.entries.length, 1);
    await rejects(studentA.call('getLeaderboard', { ...argsBoard, scope: 'global', pageSize: 1, cursor: `${firstPage.nextCursor}bad` }), 'INVALID_REQUEST');
    const details = await teacherA.call('getSessionDetails', { classId: classA.classId, sessionId: doneA.sessionId });
    assert.equal(details.answers.length, 50);
    await rejects(teacherB.call('getSessionDetails', { classId: classA.classId, sessionId: doneA.sessionId }), 'FORBIDDEN');
    await rejects(studentA.call('getSessionDetails', { classId: classA.classId, sessionId: doneA.sessionId }), 'FORBIDDEN');

    const improved = await play(studentB, await studentB.call('startSession', { gameId: '1math3', mode: 'regular', requestId: id() }));
    assert.equal(improved.result.score, 500);
    assert.deepEqual((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'class' })).entries.map(x => x.rank), [1, 1]);
    await studentA.call('setGlobalParticipation', { enabled: false });
    assert.equal((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global' })).entries.length, globalCount - 1);
    await studentA.call('setGlobalParticipation', { enabled: true });
    assert.equal((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global' })).entries.length, globalCount);
    await rejects(teacherA.call('setClassGlobalParticipation', { classId: classB.classId, enabled: false }), 'FORBIDDEN');
    await teacherB.call('setClassGlobalParticipation', { classId: classB.classId, enabled: false });
    assert.equal((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global' })).entries.length, globalCount - 1);
    await teacherB.call('setClassGlobalParticipation', { classId: classB.classId, enabled: true });
    assert.equal((await studentA.call('getLeaderboard', { ...argsBoard, scope: 'global' })).entries.length, globalCount);

    const path = `projects/${projectId}/databases/(default)/documents/classes/${classA.classId}`;
    const directRead = await fetch(`https://firestore.googleapis.com/v1/${path}`, { headers: { authorization: `Bearer ${studentA.token}` } });
    assert.equal(directRead.status, 403);
    const directWrite = await fetch(`https://firestore.googleapis.com/v1/${path}`, { method: 'PATCH', headers: { authorization: `Bearer ${studentA.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { forged: { integerValue: '500' } } }) });
    assert.equal(directWrite.status, 403);
  } finally {
    console.log('Live Worker request counts and latency (ms)', Object.fromEntries([...calls].map(([name, x]) => [name, { count: x.count, meanMs: Math.round(x.totalMs / x.count), maximumMs: Math.round(x.maximumMs) }])));
  }
});
