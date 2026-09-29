// Opt-in concurrent write check against the isolated math3-dev project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveApiKey } from './live-config.js';

const base = 'https://math3-cp3-dev.subsubt-math3-dev.workers.dev';
const id = () => crypto.randomUUID();
async function client() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await liveApiKey()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"returnSecureToken":true}' });
  assert.equal(response.status, 200);
  const { idToken } = await response.json();
  return async (name, data) => {
    const r = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { origin: 'https://subsubt.github.io', authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
    const value = await r.json();
    if (!r.ok) throw Object.assign(new Error(`${name}: ${value.error?.code}`), { code: value.error?.code, status: r.status });
    return value.result;
  };
}

test('actual Worker accepts only the first concurrent answer', { skip: process.env.MATH3_LIVE_TEST !== '1', timeout: 120000 }, async () => {
  const [teacher, student] = await Promise.all([client(), client()]);
  await teacher('createTeacherSpace', { requestId: id() });
  const cls = await teacher('createClass', { privateLabel: '동시성검증반', requestId: id() });
  await student('requestJoin', { code: cls.code, privateName: '검증', requestId: id() });
  const pending = await teacher('listPendingStudents', { classId: cls.classId });
  await teacher('approveStudent', { classId: cls.classId, studentId: pending.students[0].studentId });
  const session = await student('startSession', { gameId: '1math3', mode: 'regular', requestId: id() });
  const q = session.questions[0];
  const request = response => student('submitAnswer', { sessionId: session.sessionId, questionId: q.id, response, expectedRevision: 0, requestId: id() });
  const outcomes = await Promise.allSettled([request(0), request(19)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(x => x.status === 'rejected')?.reason;
  assert.ok(['REVISION_CONFLICT', 'REQUEST_CONFLICT'].includes(rejected?.code), `race loser: ${rejected?.code}`);
  const saved = await student('getSession', { sessionId: session.sessionId });
  assert.equal(saved.currentIndex, 1);
  assert.equal(saved.questions[0].firstResponse.answer, outcomes[0].status === 'fulfilled' ? 0 : 19);
  await assert.rejects(request(5), error => error.code === 'REVISION_CONFLICT');
});
