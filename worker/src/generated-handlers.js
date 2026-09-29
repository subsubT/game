// Generated from functions/index.js by tools/build-worker.mjs. Do not edit directly.
import { ApiError } from './error.js';
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { GAME, buildSession, publicQuestion, evaluateStep, skipQuestion, summarize, questionExplanation } from '../../src/games/1math3/core.js';


export const handlerNames = Object.freeze(["createTeacherSpace","recoverTeacherSpace","createClass","listClasses","listPendingStudents","listClassSessions","getSessionDetails","setClassGlobalParticipation","approveStudent","listClassStudents","getTeacherLeaderboard","issueStudentReturnTicket","redeemStudentReturnTicket","detachStudentDevice","requestJoin","getStudentStatus","startSession","getSession","submitAnswer","finishSession","setGlobalParticipation","getLeaderboard"]);
export function createHandlers(db, secret) {
  if (!secret) throw new Error('MATH3_SERVER_SECRET is required');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const aliasWords = ['초록별', '노란달', '푸른별', '반짝꽃', '은하수', '새싹별', '달빛곰', '구름별'];
  const hash = value => createHash('sha256').update(value).digest('hex');
  const digest = value => createHmac('sha256', secret).update(value).digest('hex');
  const randomId = () => randomBytes(16).toString('hex');
  const now = () => new Date().toISOString();
  const fail = (code, message = code) => { throw new ApiError(code, message); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('INVALID_REQUEST');
  function fields(data, allowed) { object(data); for (const key of Object.keys(data)) if (!allowed.includes(key)) fail('INVALID_REQUEST'); return data; }
  function str(value, max = 100) { if (typeof value !== 'string' || value.length > max || !value.length) fail('INVALID_REQUEST'); return value; }
  function requestId(data) { return str(data.requestId, 80); }
  function codeOf(value) { const code = str(value, 12).replace(/-/g, '').toUpperCase(); if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) fail('JOIN_UNAVAILABLE'); return code; }
  function nameOf(value) { const name = String(value || '').normalize('NFC').trim(); if ([...name].length > 12 || /[\p{Cc}\p{Cf}]/u.test(name)) fail('INVALID_NAME'); return name; }
  function codeCrypt(value, decrypt = false) {
    const key = createHash('sha256').update(secret).digest();
    if (decrypt) { const [iv, tag, body] = value.split('.').map(x => Buffer.from(x, 'base64url')); const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag); return Buffer.concat([cipher.update(body), cipher.final()]).toString(); }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64url')).join('.');
  }
  const seasonOf = iso => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso)); return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`; };
  const boardOf = seasonId => `${GAME.gameId}:${GAME.rulesVersion}:${GAME.curriculumVersion}:${seasonId}`;
  const classBoardOf = (classId, key) => `${classId}:${key}`;
  const aliasOf = (id, global = false) => { const h = digest(`${global ? 'global' : 'class'}:${id}`); return `${aliasWords[parseInt(h.slice(0, 2), 16) % aliasWords.length]}-${parseInt(h.slice(2, 6), 16) % 90 + 10}`; };
  const validSeason = value => /^20\d\d-(0[1-9]|1[0-2])$/.test(value);
  async function rateLimit(uid, operation, max, windowMs) {
    const ref = db.doc(`rateLimits/${digest(`${uid}:${operation}`)}`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), time = Date.now(), previous = snap.data();
      if (!previous || previous.resetAt <= time) tx.set(ref, { count: 1, resetAt: time + windowMs });
      else { if (previous.count >= max) fail('RATE_LIMITED'); tx.update(ref, { count: previous.count + 1 }); }
    });
  }
  const call = handler => handler;
  const studentRef = binding => db.doc(`classes/${binding.classId}/students/${binding.studentId}`);
  async function student(uid, pending = false) {
    const snap = await db.doc(`studentBindings/${uid}`).get();
    if (snap.exists && snap.data().active) {
      const binding = snap.data(), s = await studentRef(binding).get();
      if (s.exists && s.data().status === 'active') return { ...binding, data: s.data() };
    }
    if (pending) return null;
    fail('PENDING_APPROVAL');
  }
  async function teacher(uid) {
    const snap = await db.doc(`teacherBindings/${uid}`).get();
    if (!snap.exists || !snap.data().active) fail('FORBIDDEN');
    const space = await db.doc(`teachers/${snap.data().teacherId}`).get();
    if (!space.exists || space.data().authEpoch !== snap.data().epoch) fail('FORBIDDEN');
    return snap.data().teacherId;
  }
  async function ownedClass(uid, classId) {
    const teacherId = await teacher(uid), ref = db.doc(`classes/${str(classId, 80)}`), snap = await ref.get();
    if (!snap.exists || snap.data().ownerTeacherId !== teacherId) fail('FORBIDDEN');
    return { ref, data: snap.data(), teacherId };
  }
  function safeQuestion(q, reveal = false) {
    if (!q) return null;
    const p = publicQuestion(q);
    const item = { ...p, id: q.id, round: q.round, step: q.step, status: q.status, firstResponse: q.firstResponse || null, firstCorrect: q.firstCorrect, earnedPoints: q.earnedPoints, skipped: Boolean(q.skipped), selectedPair: q.selectedPair };
    if (reveal) Object.assign(item, { answer: q.answer, validPairs: q.validPairs, explanation: questionExplanation(q) });
    else if (q.step === 'sum') item.validPairs = q.validPairs;
    return item;
  }
  function packSession(s) { const { questions, ...other } = s; return { ...other, questionsJson: JSON.stringify(questions) }; }
  function unpackSession(s) { return s.questions ? s : { ...s, questions: JSON.parse(s.questionsJson) }; }
  function safeSession(s) {
    s = unpackSession(s);
    const questions = s.questions.map((q, i) => i < s.currentIndex || q.status === 'answered' ? safeQuestion(q, true) : i === s.currentIndex ? safeQuestion(q) : { index: i });
    const result = s.status === 'playing' ? null : { ...summarize(s), seasonId: s.seasonId, saveStatus: 'confirmed', rankStatus: s.status === 'complete' && s.mode === 'regular' ? 'ready' : 'excluded' };
    return { sessionId: s.sessionId, gameId: s.gameId, versions: s.versions, seasonId: s.seasonId, mode: s.mode, status: s.status, currentIndex: s.currentIndex, revision: s.revision, feedbackIndex: s.feedbackIndex, startedAt: s.startedAt, expiresAt: s.expiresAt, questions, result };
  }
  function opRef(uid, operation, id) { return db.doc(`operations/${digest(`${uid}:${operation}:${id}`)}`); }
  function checkOp(snap, fingerprint) { if (!snap.exists) return null; if (snap.data().fingerprint !== fingerprint) fail('REQUEST_CONFLICT'); return snap.data().resultJson ? JSON.parse(snap.data().resultJson) : snap.data().result; }
  function scoreCounts(counts = {}, oldScore, newScore) {
    const next = { ...counts };
    if (oldScore !== null && oldScore !== undefined) next[oldScore] = Math.max(0, (next[oldScore] || 0) - 1);
    if (newScore !== null && newScore !== undefined) next[newScore] = (next[newScore] || 0) + 1;
    return next;
  }
  async function rankRefs(tx, classId, studentId, key) {
    const classBoard = classBoardOf(classId, key), opaque = digest(`${classId}:${studentId}:${key}`).slice(0, 32);
    const ce = db.doc(`classBoards/${classBoard}/entries/${studentId}`), ge = db.doc(`globalBoards/${key}/entries/${opaque}`);
    const cc = db.doc(`boardCounts/class:${classBoard}`), gc = db.doc(`boardCounts/global:${key}`);
    const [ces, ges, ccs, gcs] = await Promise.all([tx.get(ce), tx.get(ge), tx.get(cc), tx.get(gc)]);
    return { ce, ge, cc, gc, ces, ges, ccs, gcs, opaque };
  }
  function projectRank(tx, refs, s, studentData, classData, studentDoc) {
    const score = summarize(s).score, current = refs.ces.exists ? refs.ces.data().score : null;
    if (current === null || score > current) {
      tx.set(refs.ce, { displayAlias: studentData.classAlias, score, studentId: s.studentId, updatedAt: now() });
      tx.set(refs.cc, { counts: scoreCounts(refs.ccs.data()?.counts, current, score), updatedAt: now() });
      tx.update(studentDoc, { bestScores: { ...(studentData.bestScores || {}), [boardOf(s.seasonId)]: score } });
    }
    if (studentData.globalOptIn !== false && classData.globalOptIn !== false) {
      const previous = refs.ges.exists ? refs.ges.data().score : null;
      if (previous === null || score > previous) {
        tx.set(refs.ge, { displayAlias: aliasOf(`${refs.opaque}:${s.seasonId}`, true), score, updatedAt: now() });
        tx.set(refs.gc, { counts: scoreCounts(refs.gcs.data()?.counts, previous, score), updatedAt: now() });
      }
    }
  }
  function finalResult(s) { return { result: safeSession(s).result, saveStatus: 'confirmed', rankStatus: s.status === 'complete' && s.mode === 'regular' ? 'ready' : 'excluded' }; }
  
  const createTeacherSpace = call(async (data, uid) => {
    fields(data, ['requestId']); requestId(data);
    const binding = db.doc(`teacherBindings/${uid}`), existing = await binding.get();
    if (existing.exists && existing.data().active) return { teacherId: existing.data().teacherId, recoveryKey: null, existing: true };
    const teacherId = randomId(), recoveryId = randomId(), recoverySecret = randomBytes(32).toString('base64url');
    await db.runTransaction(async tx => {
      if ((await tx.get(binding)).exists) fail('FORBIDDEN');
      tx.create(db.doc(`teachers/${teacherId}`), { status: 'active', authEpoch: 1, createdAt: now() });
      tx.create(binding, { teacherId, epoch: 1, active: true });
      tx.create(db.doc(`recoveryKeys/${recoveryId}`), { teacherId, secretHash: digest(recoverySecret), version: 1, active: true });
    });
    return { teacherId, recoveryKey: `${recoveryId}.${recoverySecret}`, existing: false };
  });
  const recoverTeacherSpace = call(async (data, uid) => {
    fields(data, ['recoveryKey', 'requestId']); requestId(data); await rateLimit(uid, 'teacherRecovery', 5, 3600000);
    const [recoveryId, recoverySecret] = str(data.recoveryKey, 150).split('.');
    if (!/^[a-f0-9]{32}$/.test(recoveryId || '') || !recoverySecret) fail('FORBIDDEN');
    const keyRef = db.doc(`recoveryKeys/${recoveryId}`), newId = randomId(), newSecret = randomBytes(32).toString('base64url');
    const result = await db.runTransaction(async tx => {
      const [key, existing] = await Promise.all([tx.get(keyRef), tx.get(db.doc(`teacherBindings/${uid}`))]);
      if (existing.exists || !key.exists || !key.data().active) fail('FORBIDDEN');
      const expected = Buffer.from(key.data().secretHash, 'hex'), given = Buffer.from(digest(recoverySecret), 'hex');
      if (!timingSafeEqual(expected, given)) fail('FORBIDDEN');
      const teacherId = key.data().teacherId, teacherRef = db.doc(`teachers/${teacherId}`), space = await tx.get(teacherRef);
      const epoch = space.data().authEpoch + 1;
      tx.update(keyRef, { active: false, usedAt: now() }); tx.update(teacherRef, { authEpoch: epoch });
      tx.create(db.doc(`teacherBindings/${uid}`), { teacherId, epoch, active: true });
      tx.create(db.doc(`recoveryKeys/${newId}`), { teacherId, secretHash: digest(newSecret), version: epoch, active: true });
      return { teacherId, recoveryKey: `${newId}.${newSecret}` };
    });
    return result;
  });
  const createClass = call(async (data, uid) => {
    fields(data, ['privateLabel', 'requestId']); requestId(data);
    const teacherId = await teacher(uid), privateLabel = nameOf(data.privateLabel);
    if (!privateLabel) fail('INVALID_NAME');
    const op = opRef(uid, 'createClass', data.requestId), fp = hash(JSON.stringify([privateLabel]));
    return db.runTransaction(async tx => {
      const prior = checkOp(await tx.get(op), fp); if (prior) return prior;
      const classId = randomId(), code = Array.from({ length: 8 }, () => alphabet[randomBytes(1)[0] % alphabet.length]).join(''), codeDigest = digest(code);
      const codeRef = db.doc(`joinCodes/${codeDigest}`);
      if ((await tx.get(codeRef)).exists) fail('REQUEST_CONFLICT');
      const result = { classId, code, privateLabel, globalOptIn: true };
      tx.create(db.doc(`classes/${classId}`), { ownerTeacherId: teacherId, privateLabel, status: 'active', joinEnabled: true, globalOptIn: true, codeCipher: codeCrypt(code), codeVersion: 1, createdAt: now() });
      tx.create(codeRef, { classId, codeVersion: 1, active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
      tx.create(op, { fingerprint: fp, result }); return result;
    });
  });
  const listClasses = call(async (data, uid) => {
    fields(data, []); const teacherId = await teacher(uid);
    const snap = await db.collection('classes').where('ownerTeacherId', '==', teacherId).limit(50).get();
    return { classes: snap.docs.map(d => ({ classId: d.id, privateLabel: d.data().privateLabel, code: codeCrypt(d.data().codeCipher, true), status: d.data().status, joinEnabled: d.data().joinEnabled, globalOptIn: d.data().globalOptIn !== false })) };
  });
  const listPendingStudents = call(async (data, uid) => {
    fields(data, ['classId']); const { ref } = await ownedClass(uid, data.classId);
    const snap = await ref.collection('students').where('status', '==', 'pending').limit(200).get();
    return { students: snap.docs.map(d => ({ studentId: d.id, privateName: d.data().privateName, checkMark: d.data().checkMark, classAlias: d.data().classAlias })) };
  });
  const listClassSessions = call(async (data, uid) => {
    fields(data, ['classId', 'gameId']); if (data.gameId !== GAME.gameId) fail('INVALID_REQUEST');
    const { ref } = await ownedClass(uid, data.classId);
    const snap = await ref.collection('sessions').where('gameId', '==', GAME.gameId).limit(200).get();
    return { sessions: snap.docs.map(d => { const s = unpackSession(d.data()), result = summarize(s); return { sessionId: d.id, studentId: s.studentId, seasonId: s.seasonId, startedAt: s.startedAt, completion: result.completion, score: result.score, correct: result.correct, wrong: result.wrong, skipped: result.skipped, unanswered: result.unanswered }; }) };
  });
  const getSessionDetails = call(async (data, uid) => {
    fields(data, ['classId', 'sessionId']); const { ref } = await ownedClass(uid, data.classId);
    const snap = await ref.collection('sessions').doc(str(data.sessionId, 80)).get();
    if (!snap.exists) fail('NOT_FOUND');
    const s = unpackSession(snap.data()), studentSnap = await ref.collection('students').doc(s.studentId).get();
    return { result: summarize(s), seasonId: s.seasonId, student: { privateName: studentSnap.data()?.privateName || '', classAlias: studentSnap.data()?.classAlias || '' }, answers: s.questions.filter(q => q.status === 'answered').map(q => ({ index: q.index, typeId: q.typeId, subtype: q.subtype, operands: q.operands, answer: q.answer, firstResponse: q.firstResponse, firstCorrect: q.firstCorrect, skipped: Boolean(q.skipped) })) };
  });
  const setClassGlobalParticipation = call(async (data, uid) => {
    fields(data, ['classId', 'enabled']); if (typeof data.enabled !== 'boolean') fail('INVALID_REQUEST');
    const { ref } = await ownedClass(uid, data.classId);
    return db.runTransaction(async tx => {
      const [cls, students] = await Promise.all([tx.get(ref), tx.get(ref.collection('students').where('status', '==', 'active'))]);
      const items = [];
      if (!cls.exists) fail('NOT_FOUND');
      for (const doc of students.docs) for (const [key, score] of Object.entries(doc.data().bestScores || {})) items.push({ key, score, studentId: doc.id, studentGlobalOptIn: doc.data().globalOptIn !== false });
      if (items.length > 200) fail('RATE_LIMITED');
      const entries = await Promise.all(items.map(async item => {
        const opaque = digest(`${data.classId}:${item.studentId}:${item.key}`).slice(0, 32);
        const entryRef = db.doc(`globalBoards/${item.key}/entries/${opaque}`);
        return { ...item, opaque, entryRef, snap: await tx.get(entryRef) };
      }));
      const countRefs = new Map(entries.map(x => [x.key, db.doc(`boardCounts/global:${x.key}`)]));
      const countSnaps = new Map(await Promise.all([...countRefs].map(async ([key, countRef]) => [key, await tx.get(countRef)])));
      const counts = new Map([...countSnaps].map(([key, snap]) => [key, { ...(snap.data()?.counts || {}) }]));
      tx.update(ref, { globalOptIn: data.enabled });
      for (const item of entries) {
        const bucket = counts.get(item.key);
        if (data.enabled && item.studentGlobalOptIn && !item.snap.exists) {
          tx.set(item.entryRef, { displayAlias: aliasOf(`${item.opaque}:${item.key.split(':').at(-1)}`, true), score: item.score, updatedAt: now() });
          bucket[item.score] = (bucket[item.score] || 0) + 1;
        } else if (!data.enabled && item.snap.exists) {
          tx.delete(item.entryRef);
          bucket[item.snap.data().score] = Math.max(0, (bucket[item.snap.data().score] || 0) - 1);
        }
      }
      for (const [key, bucket] of counts) tx.set(countRefs.get(key), { counts: bucket, updatedAt: now() });
      return { enabled: data.enabled, status: 'confirmed' };
    });
  });
  const approveStudent = call(async (data, uid) => {
    fields(data, ['classId', 'studentId']); const { ref } = await ownedClass(uid, data.classId), sid = str(data.studentId, 80);
    return db.runTransaction(async tx => {
      const sref = ref.collection('students').doc(sid), snap = await tx.get(sref);
      if (!snap.exists || !['pending', 'active'].includes(snap.data().status)) fail('NOT_FOUND');
      if (snap.data().status === 'active') return { status: 'approved' };
      const bound = db.doc(`studentBindings/${snap.data().uid}`);
      if ((await tx.get(bound)).exists) fail('FORBIDDEN');
      tx.update(sref, { status: 'active', globalOptIn: true, approvedAt: now() });
      tx.create(bound, { classId: data.classId, studentId: sid, active: true, bindingVersion: 1 });
      return { status: 'approved' };
    });
  });
  const listClassStudents = call(async (data, uid) => {
    fields(data, ['classId']); const { ref } = await ownedClass(uid, data.classId);
    const snap = await ref.collection('students').where('status', '==', 'active').limit(200).get();
    return { students: snap.docs.map(d => ({ studentId: d.id, privateName: d.data().privateName, classAlias: d.data().classAlias, checkMark: d.data().checkMark, globalOptIn: d.data().globalOptIn !== false, bestScores: d.data().bestScores || {} })) };
  });
  const getTeacherLeaderboard = call(async (data, uid) => {
    fields(data, ['classId', 'seasonId']);
    if (!validSeason(data.seasonId)) fail('INVALID_REQUEST');
    await ownedClass(uid, data.classId);
    const key = boardOf(data.seasonId), boardId = classBoardOf(data.classId, key);
    const [rows, count] = await Promise.all([
      db.doc(`classBoards/${boardId}`).collection('entries').orderBy('score', 'desc').orderBy('__name__').limit(50).get(),
      db.doc(`boardCounts/class:${boardId}`).get()
    ]);
    const counts = count.data()?.counts || {};
    const rankFor = score => 1 + Object.entries(counts).reduce((n, [point, amount]) => n + (Number(point) > score ? amount : 0), 0);
    return { entries: rows.docs.map(d => ({ displayAlias: d.data().displayAlias, score: d.data().score, rank: rankFor(d.data().score) })), seasonId: data.seasonId };
  });
  const issueStudentReturnTicket = call(async (data, uid) => {
    fields(data, ['classId', 'studentId']); const { ref } = await ownedClass(uid, data.classId);
    const studentId = str(data.studentId, 80), snap = await ref.collection('students').doc(studentId).get();
    if (!snap.exists || snap.data().status !== 'active') fail('NOT_FOUND');
    const ticket = randomBytes(16).toString('base64url'), ticketHash = digest(ticket);
    await db.doc(`studentReturnTickets/${ticketHash}`).create({ classId: data.classId, studentId, expiresAt: new Date(Date.now() + 600000).toISOString(), usedAt: null });
    return { ticket, expiresInSeconds: 600 };
  });
  const redeemStudentReturnTicket = call(async (data, uid) => {
    fields(data, ['ticket', 'requestId']); requestId(data);
    const ticket = str(data.ticket, 80), ticketRef = db.doc(`studentReturnTickets/${digest(ticket)}`), op = opRef(uid, 'redeemTicket', data.requestId), fingerprint = hash(ticket);
    return db.runTransaction(async tx => {
      const [prior, token, existing, pending] = await Promise.all([tx.get(op), tx.get(ticketRef), tx.get(db.doc(`studentBindings/${uid}`)), tx.get(db.doc(`joinRequests/${uid}`))]);
      const previous = checkOp(prior, fingerprint); if (previous) return previous;
      if (existing.exists || pending.exists || !token.exists || token.data().usedAt || token.data().expiresAt <= now()) fail('FORBIDDEN');
      const { classId, studentId } = token.data(), studentDoc = db.doc(`classes/${classId}/students/${studentId}`), studentSnap = await tx.get(studentDoc);
      if (!studentSnap.exists || studentSnap.data().status !== 'active') fail('FORBIDDEN');
      const oldUid = studentSnap.data().uid, oldBinding = db.doc(`studentBindings/${oldUid}`), oldPointer = db.doc(`activeSessions/${digest(`${oldUid}:${GAME.gameId}`)}`);
      const [bindingSnap, pointerSnap] = await Promise.all([tx.get(oldBinding), tx.get(oldPointer)]);
      tx.update(ticketRef, { usedAt: now(), usedBy: uid });
      if (bindingSnap.exists) tx.update(oldBinding, { active: false });
      tx.update(studentDoc, { uid });
      tx.create(db.doc(`studentBindings/${uid}`), { classId, studentId, active: true, bindingVersion: (bindingSnap.data()?.bindingVersion || 0) + 1 });
      if (pointerSnap.exists) { tx.set(db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`), pointerSnap.data()); tx.delete(oldPointer); }
      const result = { status: 'approved', classAlias: studentSnap.data().classAlias, globalParticipation: studentSnap.data().globalOptIn !== false };
      tx.create(op, { fingerprint, result }); return result;
    });
  });
  const detachStudentDevice = call(async (data, uid) => {
    fields(data, []);
    const bindingRef = db.doc(`studentBindings/${uid}`);
    await db.runTransaction(async tx => { const snap = await tx.get(bindingRef); if (snap.exists && snap.data().active) tx.update(bindingRef, { active: false }); });
    return { status: 'detached' };
  });
  const requestJoin = call(async (data, uid) => {
    fields(data, ['code', 'privateName', 'requestId']); requestId(data); await rateLimit(uid, 'join', 10, 3600000);
    const code = codeOf(data.code), privateName = nameOf(data.privateName), idx = db.doc(`joinCodes/${digest(code)}`);
    const pending = db.doc(`joinRequests/${uid}`);
    const result = await db.runTransaction(async tx => {
      const [joined, old, codeSnap] = await Promise.all([tx.get(db.doc(`studentBindings/${uid}`)), tx.get(pending), tx.get(idx)]);
      if (joined.exists && joined.data().active) fail('FORBIDDEN');
      if (old.exists) {
        if (old.data().codeDigest !== digest(code)) fail('FORBIDDEN');
        return { status: 'pending', checkMark: old.data().checkMark };
      }
      if (!codeSnap.exists || !codeSnap.data().active || codeSnap.data().expiresAt <= now()) fail('JOIN_UNAVAILABLE');
      const classId = codeSnap.data().classId, classSnap = await tx.get(db.doc(`classes/${classId}`));
      if (!classSnap.exists || classSnap.data().status !== 'active' || !classSnap.data().joinEnabled || classSnap.data().codeVersion !== codeSnap.data().codeVersion) fail('JOIN_UNAVAILABLE');
      const studentId = randomId(), checkMark = String(randomBytes(1)[0] % 90 + 10), classAlias = aliasOf(studentId);
      tx.create(db.doc(`classes/${classId}/students/${studentId}`), { uid, privateName, checkMark, classAlias, status: 'pending', createdAt: now() });
      tx.create(pending, { classId, studentId, checkMark, codeDigest: digest(code) });
      return { status: 'pending', checkMark };
    });
    return result;
  });
  const getStudentStatus = call(async (data, uid) => {
    fields(data, []); const s = await student(uid, true);
    if (s) return { status: 'approved', classAlias: s.data.classAlias, globalParticipation: s.data.globalOptIn !== false };
    const pending = await db.doc(`joinRequests/${uid}`).get();
    return pending.exists ? { status: 'pending', checkMark: pending.data().checkMark } : { status: 'new' };
  });
  
  const startSession = call(async (data, uid) => {
    fields(data, ['gameId', 'mode', 'requestId']); requestId(data);
    if (data.gameId !== GAME.gameId || data.mode !== 'regular') fail('INVALID_REQUEST');
    const binding = await student(uid), fingerprint = hash(JSON.stringify([data.gameId, data.mode]));
    const op = opRef(uid, 'startSession', data.requestId), active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`);
    return db.runTransaction(async tx => {
      const [prior, pointer, classSnap] = await Promise.all([tx.get(op), tx.get(active), tx.get(db.doc(`classes/${binding.classId}`))]);
      const previous = checkOp(prior, fingerprint);
      if (previous) {
        const saved = await tx.get(db.doc(`classes/${binding.classId}/sessions/${previous.sessionId}`));
        return safeSession(saved.data());
      }
      if (!classSnap.exists || classSnap.data().status !== 'active') fail('FORBIDDEN');
      if (pointer.exists) {
        const old = await tx.get(db.doc(`classes/${binding.classId}/sessions/${pointer.data().sessionId}`));
        if (old.exists && old.data().status === 'playing' && old.data().expiresAt > now()) {
          tx.create(op, { fingerprint, result: { sessionId: old.id } });
          return safeSession(old.data());
        }
      }
      const seed = randomBytes(4).readUInt32BE(), sessionId = randomId(), startedAt = now();
      const s = buildSession(seed); Object.assign(s, { sessionId, studentId: binding.studentId, classId: binding.classId, startedAt, seasonId: seasonOf(startedAt), expiresAt: new Date(Date.now() + 86400000).toISOString(), revision: 0, mode: 'regular' });
      tx.create(db.doc(`classes/${binding.classId}/sessions/${sessionId}`), packSession(s));
      tx.set(active, { sessionId }); tx.create(op, { fingerprint, result: { sessionId } });
      return safeSession(s);
    });
  });
  
  const getSession = call(async (data, uid) => {
    fields(data, ['sessionId']); const binding = await student(uid), id = str(data.sessionId, 80);
    const ref = db.doc(`classes/${binding.classId}/sessions/${id}`), snap = await ref.get();
    if (!snap.exists || snap.data().studentId !== binding.studentId) fail('FORBIDDEN');
    if (snap.data().status === 'playing' && snap.data().expiresAt <= now()) {
      return db.runTransaction(async tx => {
        const current = await tx.get(ref), s = unpackSession(current.data());
        if (s.status === 'playing' && s.expiresAt <= now()) {
          s.status = 'incomplete'; s.endReason = 'expired'; s.finishedAt = now();
          const active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`), pointer = await tx.get(active);
          tx.update(ref, { status: s.status, endReason: s.endReason, finishedAt: s.finishedAt });
          if (pointer.exists && pointer.data().sessionId === id) tx.delete(active);
        }
        return safeSession(s);
      });
    }
    return safeSession(snap.data());
  });
  
  const submitAnswer = call(async (data, uid) => {
    fields(data, ['sessionId', 'questionId', 'response', 'skip', 'expectedRevision', 'requestId']); requestId(data);
    const binding = await student(uid), sessionId = str(data.sessionId, 80), questionId = str(data.questionId, 80);
    if (data.skip !== undefined && data.skip !== true) fail('INVALID_REQUEST');
    if (data.skip && data.response !== undefined) fail('INVALID_REQUEST');
    if (!data.skip && !(typeof data.response === 'string' || typeof data.response === 'number' || Array.isArray(data.response))) fail('INVALID_REQUEST');
    if (Array.isArray(data.response) && (data.response.length !== 2 || data.response.some(x => !Number.isInteger(x) || x < 0 || x > 2))) fail('INVALID_REQUEST');
    const fingerprint = hash(JSON.stringify([sessionId, questionId, data.skip || false, data.response]));
    const op = opRef(uid, 'submitAnswer', data.requestId), sref = db.doc(`classes/${binding.classId}/sessions/${sessionId}`);
    return db.runTransaction(async tx => {
      const [prior, snap] = await Promise.all([tx.get(op), tx.get(sref)]);
      const previous = checkOp(prior, fingerprint); if (previous) return previous;
      if (!snap.exists || snap.data().studentId !== binding.studentId || snap.data().status !== 'playing') fail('SESSION_NOT_ACTIVE');
      const s = unpackSession(snap.data()); if (s.expiresAt <= now()) fail('SESSION_EXPIRED');
      if (data.expectedRevision !== undefined && data.expectedRevision !== s.revision) fail('REVISION_CONFLICT');
      const q = s.questions[s.currentIndex]; if (!q || q.id !== questionId) fail('REVISION_CONFLICT');
      const result = data.skip ? { accepted: skipQuestion(q), final: true, correct: false, item: q } : evaluateStep(q, data.response);
      if (!result.accepted) return { accepted: false, reason: result.reason, session: safeSession(s) };
      s.feedbackIndex = q.index; s.revision++;
      if (result.final) s.currentIndex++;
      let refs, rankStudent, rankClass;
      if (s.currentIndex === 50 && result.final) {
        const [studentSnap, classSnap, rank] = await Promise.all([
          tx.get(studentRef(binding)), tx.get(db.doc(`classes/${binding.classId}`)),
          rankRefs(tx, binding.classId, binding.studentId, boardOf(s.seasonId))
        ]);
        if (!studentSnap.exists || studentSnap.data().status !== 'active' || !classSnap.exists) fail('FORBIDDEN');
        rankStudent = studentSnap.data(); rankClass = classSnap.data(); refs = rank;
        s.status = 'complete'; s.finishedAt = now(); s.endReason = 'complete';
      }
      const response = JSON.parse(JSON.stringify({ accepted: true, final: Boolean(result.final), correct: Boolean(result.correct), session: safeSession(s) }));
      if (result.final) tx.set(sref.collection('answers').doc(String(q.index).padStart(2, '0')), { questionIndex: q.index, typeId: q.typeId, subtype: q.subtype, firstResponse: q.firstResponse, firstCorrect: q.firstCorrect, skipped: Boolean(q.skipped), requestId: data.requestId, receivedAt: now() });
      tx.update(sref, { questionsJson: JSON.stringify(s.questions), currentIndex: s.currentIndex, feedbackIndex: s.feedbackIndex, revision: s.revision, status: s.status, finishedAt: s.finishedAt || null, endReason: s.endReason || null });
      if (refs) projectRank(tx, refs, s, rankStudent, rankClass, studentRef(binding));
      tx.create(op, { fingerprint, resultJson: JSON.stringify(response) }); return response;
    });
  });
  
  const finishSession = call(async (data, uid) => {
    fields(data, ['sessionId', 'reason', 'requestId']); requestId(data);
    const binding = await student(uid), sessionId = str(data.sessionId, 80);
    if (!['quit', 'complete'].includes(data.reason)) fail('INVALID_REQUEST');
    const op = opRef(uid, 'finishSession', data.requestId), fingerprint = hash(JSON.stringify([sessionId, data.reason]));
    const sref = db.doc(`classes/${binding.classId}/sessions/${sessionId}`), active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`);
    return db.runTransaction(async tx => {
      const [prior, snap, pointer] = await Promise.all([tx.get(op), tx.get(sref), tx.get(active)]);
      const previous = checkOp(prior, fingerprint); if (previous) return previous;
      if (!snap.exists || snap.data().studentId !== binding.studentId) fail('FORBIDDEN');
      const s = unpackSession(snap.data());
      if (s.status === 'playing') {
        if (data.reason === 'complete' && s.currentIndex !== 50) fail('REVISION_CONFLICT');
        s.status = s.currentIndex === 50 ? 'complete' : 'incomplete'; s.finishedAt = now(); s.endReason = s.status === 'complete' ? 'complete' : data.reason;
        tx.update(sref, { status: s.status, finishedAt: s.finishedAt, endReason: s.endReason });
      }
      if (pointer.exists && pointer.data().sessionId === sessionId) tx.delete(active);
      const result = finalResult(s); tx.create(op, { fingerprint, result }); return result;
    });
  });
  
  const setGlobalParticipation = call(async (data, uid) => {
    fields(data, ['enabled']); if (typeof data.enabled !== 'boolean') fail('INVALID_REQUEST');
    const binding = await student(uid), sref = studentRef(binding), classRef = db.doc(`classes/${binding.classId}`);
    await db.runTransaction(async tx => {
      const [current, cls] = await Promise.all([tx.get(sref), tx.get(classRef)]);
      if (!current.exists || current.data().status !== 'active') fail('FORBIDDEN');
      const best = current.data().bestScores || {};
      const operations = [];
      for (const [key, score] of Object.entries(best)) {
        const opaque = digest(`${binding.classId}:${binding.studentId}:${key}`).slice(0, 32);
        const entry = db.doc(`globalBoards/${key}/entries/${opaque}`), count = db.doc(`boardCounts/global:${key}`);
        const [e, c] = await Promise.all([tx.get(entry), tx.get(count)]);
        operations.push({ key, score, entry, count, e, c, opaque });
      }
      tx.update(sref, { globalOptIn: data.enabled });
      for (const item of operations) {
        const shouldExist = data.enabled && cls.data().globalOptIn !== false;
        if (shouldExist && !item.e.exists) {
          tx.set(item.entry, { displayAlias: aliasOf(`${item.opaque}:${item.key.split(':').at(-1)}`, true), score: item.score, updatedAt: now() });
          tx.set(item.count, { counts: scoreCounts(item.c.data()?.counts, null, item.score), updatedAt: now() });
        } else if (!shouldExist && item.e.exists) {
          tx.delete(item.entry); tx.set(item.count, { counts: scoreCounts(item.c.data()?.counts, item.e.data().score, null), updatedAt: now() });
        }
      }
    });
    return { enabled: data.enabled, status: 'confirmed' };
  });
  
  const getLeaderboard = call(async (data, uid) => {
    fields(data, ['gameId', 'rulesVersion', 'curriculumVersion', 'seasonId', 'scope', 'cursor', 'pageSize']);
    if (data.gameId !== GAME.gameId || data.rulesVersion !== GAME.rulesVersion || data.curriculumVersion !== GAME.curriculumVersion || !validSeason(data.seasonId)) fail('INVALID_REQUEST');
    if (!['class', 'global'].includes(data.scope)) fail('INVALID_REQUEST');
    const pageSize = data.pageSize === undefined ? 50 : data.pageSize;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) fail('INVALID_REQUEST');
    const binding = data.scope === 'class' ? await student(uid) : await student(uid, true);
    const key = boardOf(data.seasonId), boardId = data.scope === 'class' ? classBoardOf(binding.classId, key) : key;
    const path = data.scope === 'class' ? `classBoards/${boardId}` : `globalBoards/${boardId}`;
    const countId = `${data.scope}:${boardId}`, counts = (await db.doc(`boardCounts/${countId}`).get()).data()?.counts || {};
    let query = db.doc(path).collection('entries').orderBy('score', 'desc').orderBy('__name__').limit(pageSize);
    if (data.cursor) {
      let cursor;
      try { cursor = JSON.parse(Buffer.from(str(data.cursor, 4096), 'base64url').toString('utf8')); } catch { fail('INVALID_REQUEST'); }
      if (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || cursor[0].length > 2048 || cursor[1] !== digest(`${boardId}:${cursor[0]}`).slice(0, 16)) fail('INVALID_REQUEST');
      query = query.startAfterToken(cursor[0]);
    }
    const rows = await query.get(), me = binding && (data.scope === 'class' ? binding.studentId : digest(`${binding.classId}:${binding.studentId}:${key}`).slice(0, 32));
    const rankFor = score => 1 + Object.entries(counts).reduce((n, [point, amount]) => n + (Number(point) > score ? amount : 0), 0);
    const entries = rows.docs.map(d => ({ displayAlias: d.data().displayAlias, score: d.data().score, rank: rankFor(d.data().score), isMe: d.id === me }));
    let myEntry = null;
    if (me) { const own = await db.doc(`${path}/entries/${me}`).get(); if (own.exists) myEntry = { displayAlias: own.data().displayAlias, score: own.data().score, rank: rankFor(own.data().score), isMe: true }; }
    const nextCursor = rows.nextPageToken ? Buffer.from(JSON.stringify([rows.nextPageToken, digest(`${boardId}:${rows.nextPageToken}`).slice(0, 16)])).toString('base64url') : null;
    return { boardKey: `${key}:${data.scope}`, scope: data.scope, asOf: now(), projectionVersion: 1, entries, nextCursor, myEntry, rankStatus: 'ready' };
  });
  
  return { createTeacherSpace, recoverTeacherSpace, createClass, listClasses, listPendingStudents, listClassSessions, getSessionDetails, setClassGlobalParticipation, approveStudent, listClassStudents, getTeacherLeaderboard, issueStudentReturnTicket, redeemStudentReturnTicket, detachStudentDevice, requestJoin, getStudentStatus, startSession, getSession, submitAnswer, finishSession, setGlobalParticipation, getLeaderboard };
}
