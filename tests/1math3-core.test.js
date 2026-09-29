import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME, buildSession, enumerateCandidates, evaluateStep, normalizeNumber, publicQuestion, questionExplanation, skipQuestion, summarize } from '../src/games/1math3/core.js';
import { readFile } from 'node:fs/promises';
import { MockGameService } from '../src/services/mock-game-service.js';

test('10 seeds produce exactly ten of each type in fixed round order and no duplicate signatures', () => {
  assert.deepEqual(buildSession(1), buildSession(1));
  for (let seed = 1; seed <= 10; seed++) {
    const session = buildSession(seed);
    assert.equal(session.questions.length, 50);
    for (let r = 0; r < 10; r++) assert.deepEqual(session.questions.slice(r * 5, r * 5 + 5).map(q => q.typeId), GAME.types);
    for (const typeId of GAME.types) assert.equal(session.questions.filter(q => q.typeId === typeId).length, 10);
    const keys = session.questions.map(q => JSON.stringify([q.typeId, q.subtype, q.operands, q.blankPosition]));
    assert.equal(new Set(keys).size, 50);
  }
});

test('all enumerated candidates stay in curriculum range and preserve valid unique number answers', () => {
  for (let round = 1; round <= 10; round++) {
    for (const type of GAME.types) for (const q of enumerateCandidates(type, round)) {
      const [a, b, c] = q.operands;
      if (type === 'add_three_small') { assert.ok([a,b,c].every(x => x >= 1 && x <= 9)); assert.ok(a+b+c <= 9); assert.equal(q.answer, a+b+c); }
      if (type === 'subtract_three_small') { assert.ok(a >= 3 && a <= 9 && b >= 1 && b <= 8 && c >= 1 && c <= 8); assert.ok(b+c <= a); assert.ok(a-b >= 0 && a-b-c >= 0); }
      if (type === 'make_ten') { assert.ok(a >= 0 && a <= 10); assert.equal(a+b, 10); }
      if (type === 'subtract_from_ten') { assert.ok(b >= 1 && b <= 9); assert.equal(a, 10); assert.notEqual(q.answer, 0); assert.notEqual(q.answer, 10); }
      if (type === 'make_ten_then_add') { assert.ok([a,b,c].every(x => x >= 1 && x <= 9)); assert.ok(q.answer >= 11 && q.answer <= 19); assert.ok(q.validPairs.length > 0); }
      assert.ok(questionExplanation(q).length > 0);
    }
  }
});

test('numeric normalization accepts zero and fullwidth digits and rejects invalid ranges/shapes', () => {
  assert.equal(normalizeNumber('0'), 0); assert.equal(normalizeNumber('０７'), 7);
  assert.equal(normalizeNumber(''), null); assert.equal(normalizeNumber('-1'), null); assert.equal(normalizeNumber('123'), null); assert.equal(normalizeNumber('a'), null);
});

test('public question projection is allowlisted and does not expose blank answers or multi-step answers', () => {
  const ten = publicQuestion(enumerateCandidates('make_ten', 1)[0]);
  assert.deepEqual(ten.operands.length, 1); assert.match(ten.prompt, /□/); assert.equal('answer' in ten, false);
  const sub = publicQuestion(enumerateCandidates('subtract_from_ten', 6).find(q => q.answer === 4));
  assert.deepEqual(sub.operands, [10, 6]); assert.match(sub.prompt, /10 − □ = 6/);
  const multi = publicQuestion(enumerateCandidates('make_ten_then_add', 1)[0]);
  assert.equal('validPairs' in multi, false); assert.equal('answer' in multi, false); assert.equal('firstResponse' in multi, false);
});

test('boundary questions include zero subtraction, 0+10, 10+0, sums 11/19 and multiple correct card pairs', () => {
  assert.ok(enumerateCandidates('subtract_three_small', 10).some(q => q.operands[0] - q.operands[1] - q.operands[2] === 0));
  assert.ok(enumerateCandidates('make_ten', 9).some(q => q.operands[0] === 0));
  assert.ok(enumerateCandidates('make_ten', 10).some(q => q.operands[0] === 0));
  const low = enumerateCandidates('make_ten_then_add', 1).find(q => q.answer === 11);
  const high = enumerateCandidates('make_ten_then_add', 1).find(q => q.operands.join(',') === '9,1,9');
  assert.ok(low); assert.ok(high); assert.equal(high.answer, 19); assert.deepEqual(high.validPairs, [[0,1],[1,2]]);
  const item = { ...high, step: 'pair', stepResults: [] };
  assert.equal(evaluateStep(item, [1,2]).correct, true);
  assert.equal(evaluateStep(item, 19).correct, true);
  assert.equal(item.earnedPoints, 10);
});

test('feedback explains 10 minus a missing subtrahend and the zero make-ten boundaries accurately', () => {
  const q = enumerateCandidates('subtract_from_ten', 6).find(x => x.answer === 7);
  assert.equal(questionExplanation(q), '10개에서 7개를 빼면 3개가 남아요.');
  assert.equal(questionExplanation(enumerateCandidates('make_ten', 9)[0]), '0개에 10개를 더하면 10이에요.');
});

test('first answer is immutable, skip is distinct, and review cannot change the summary', () => {
  const item = { typeId: 'add_three_small', answer: 8, stepResults: [] };
  assert.equal(evaluateStep(item, '7').correct, false); assert.equal(item.earnedPoints, 0);
  assert.equal(evaluateStep(item, '8').reason, 'ALREADY_ANSWERED'); assert.equal(item.earnedPoints, 0);
  const skipped = { typeId: 'make_ten', answer: 4 }; assert.equal(skipQuestion(skipped), true); assert.equal(skipQuestion(skipped), false);
  const s = buildSession(9); s.questions[0] = { ...item, status: 'answered', firstCorrect: false, earnedPoints: 0 };
  const before = summarize(s); evaluateStep(s.questions[0], 8); assert.deepEqual(summarize(s), before);
});

test('a complete mock round is 50 questions and 500 points; a direct exit is incomplete and excluded', async () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  const service = new MockGameService(storage); let s = await service.startSession('1math3', { seed: 2026, mode: 'practice' });
  for (const q of s.questions) {
    if (q.typeId === 'make_ten_then_add') await service.submitAnswer(s.sessionId, q.id, q.validPairs[0], `pair-${q.id}`);
    const value = q.typeId === 'make_ten_then_add' ? q.answer : q.answer;
    await service.submitAnswer(s.sessionId, q.id, value, `answer-${q.id}`);
    s = await service.getSession(s.sessionId);
  }
  assert.equal(s.currentIndex, 50); const done = await service.finishSession(s.sessionId, 'complete');
  assert.equal(done.result.score, 500); assert.equal(done.result.correct, 50); assert.equal(done.result.unanswered, 0); assert.equal(done.rankStatus, 'excluded'); assert.equal(done.result.saveStatus, 'localOnly');
  let partial = await service.startSession('1math3', { restart: true, seed: 2027, mode: 'practice' });
  await service.finishSession(partial.sessionId, 'quit');
  partial = await service.getSession(partial.sessionId); assert.equal(partial.status, 'incomplete');
  assert.equal((await service.finishSession(partial.sessionId, 'quit')).result.score, 0);
});

test('mock service resumes, locks duplicate submits, retries cleanly, and keeps rank opt-out separate', async () => {
  const memory = new Map(), storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v) };
  const svc = new MockGameService(storage); let s = await svc.startSession('1math3', { seed: 12, mode: 'practice' });
  const q = s.questions[0], requestId = 'same-request';
  const first = await svc.submitAnswer(s.sessionId, q.id, q.answer, requestId);
  const duplicate = await svc.submitAnswer(s.sessionId, q.id, q.answer, requestId);
  assert.deepEqual(duplicate, first); assert.equal(svc.memory.session.currentIndex, 1);
  await assert.rejects(svc.submitAnswer(s.sessionId, q.id, 0, requestId), /REQUEST_CONFLICT/);
  const resumed = new MockGameService(storage); assert.equal((await resumed.getSession(s.sessionId)).currentIndex, 1);
  await resumed.setGlobalParticipation(false); assert.equal(resumed.memory.globalParticipation, false);
  assert.equal((await resumed.getLeaderboard('global')).entries.some(x => x.isMe), false);
  assert.equal((await resumed.getLeaderboard('class')).entries.some(x => x.isMe), true);
  const retry = await resumed.startSession('1math3', { restart: true, seed: 13, mode: 'practice' }); assert.equal(retry.currentIndex, 0); assert.notEqual(retry.sessionId, s.sessionId);
  const board = await resumed.getLeaderboard('global', '2026-04'); assert.equal(board.rankStatus, 'example'); assert.match(board.boardKey, /:2026-04:global$/);
  assert.match(retry.seasonId, /^\d{4}-\d{2}$/); assert.ok(retry.startedAt);
});

test('regular record challenge requires mock class approval and nickname is safely normalized', async () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  const svc = new MockGameService(storage);
  await assert.rejects(svc.startSession('1math3', { mode: 'regular' }), /PENDING_APPROVAL/);
  const join = await svc.joinClass('MATH1234', '  학생\u0000가나다라마바사아자차카타파  ');
  assert.equal(join.status, 'pending'); assert.equal(svc.memory.approved, false); assert.equal(Array.from(svc.memory.nickname).length, 12);
  await svc.approveDemo(); assert.equal(svc.memory.approved, true);
  assert.equal((await svc.startSession('1math3', { mode: 'regular', seed: 44 })).mode, 'regular');
});

test('responsive and keyboard/touch accessibility rules stay present in the student stylesheet', async () => {
  const css = await readFile(new URL('../src/student/1math3.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*620px\)/); assert.match(css, /min-width:\s*320px/);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*54px/s); assert.match(css, /\.key\s*\{[^}]*min-height:\s*56px/s);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /touch-action:\s*manipulation/);
});
