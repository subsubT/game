import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { FirestoreRest } from '../worker/src/firestore-rest.js';
import { handleRequest } from '../worker/src/index.js';

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

test('Worker CP3 handlers preserve approval, server scoring, ranking, retries and Firestore denial', { timeout: 300000 }, async () => {
  const teacher = 'worker-teacher', student = 'worker-student', outsider = 'worker-outsider';
  const rules = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  try {
    const space = await call(teacher, 'createTeacherSpace', { requestId: id() });
    assert.ok(space.recoveryKey);
    const cls = await call(teacher, 'createClass', { privateLabel: 'Worker반', requestId: id() });
    assert.match(cls.code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.equal((await call(student, 'requestJoin', { code: cls.code, privateName: '학생', requestId: id() })).status, 'pending');
    await assert.rejects(call(student, 'startSession', { gameId: '1math3', mode: 'regular', requestId: id() }));
    await assert.rejects(call(outsider, 'listPendingStudents', { classId: cls.classId }));
    const pending = (await call(teacher, 'listPendingStudents', { classId: cls.classId })).students;
    assert.equal(pending.length, 1);
    await call(teacher, 'approveStudent', { classId: cls.classId, studentId: pending[0].studentId });
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
    const recovered = 'worker-recovered-teacher';
    const nextKey = await call(recovered, 'recoverTeacherSpace', { recoveryKey: space.recoveryKey, requestId: id() });
    assert.ok(nextKey.recoveryKey);
    assert.equal((await call(recovered, 'listClasses')).classes[0].classId, cls.classId);
    await assert.rejects(call(teacher, 'listClasses'));
    await assert.rejects(call('worker-replay', 'recoverTeacherSpace', { recoveryKey: space.recoveryKey, requestId: id() }));
  } finally { await rules.cleanup(); }
});
