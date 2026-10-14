import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { GAME, buildSession, publicQuestion, evaluateStep, skipQuestion, summarize, questionExplanation } from './lib/core.js';
import { generateJoinCode } from './lib/join-code.js';
import { validPin, createPin, verifyPin } from './lib/student-pin.js';
import { GAME_CATALOG } from './lib/catalog.js';
import { defaultProgressUI, checkedProgressUI } from './lib/session-progress.js';

initializeApp();
const db = getFirestore();
const region = 'asia-northeast3';
const aliasWords = ['초록별', '노란달', '푸른별', '반짝꽃', '은하수', '새싹별', '달빛곰', '구름별'];
const secret = process.env.MATH3_SERVER_SECRET || (process.env.FUNCTIONS_EMULATOR === 'true' ? 'local-emulator-only-secret-not-for-production' : '');
if (!secret) throw new Error('MATH3_SERVER_SECRET is required');
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => createHmac('sha256', secret).update(value).digest('hex');
const randomId = () => randomBytes(16).toString('hex');
const now = () => new Date().toISOString();
const fail = (code, message = code) => { throw new HttpsError(code === 'AUTH_REQUIRED' ? 'unauthenticated' : code === 'FORBIDDEN' || code === 'PENDING_APPROVAL' ? 'permission-denied' : code === 'REVISION_CONFLICT' || code === 'REQUEST_CONFLICT' ? 'aborted' : code === 'RATE_LIMITED' ? 'resource-exhausted' : code === 'NOT_FOUND' ? 'not-found' : 'invalid-argument', message); };
const uidOf = request => request.auth?.uid || fail('AUTH_REQUIRED');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : fail('INVALID_REQUEST');
function fields(data, allowed) { object(data); for (const key of Object.keys(data)) if (!allowed.includes(key)) fail('INVALID_REQUEST'); return data; }
function str(value, max = 100) { if (typeof value !== 'string' || value.length > max || !value.length) fail('INVALID_REQUEST'); return value; }
function documentId(value) { const id = str(value, 80); if (!/^[A-Za-z0-9_-]+$/.test(id)) fail('INVALID_REQUEST'); return id; }
function requestId(data) { return str(data.requestId, 80); }
function codeOf(value) { const code = str(value, 12).normalize('NFKC').trim().replace(/-/g, '').toUpperCase(); if (!/^(?:[0-9]{4}|[A-HJ-NP-Z2-9]{8})$/.test(code)) fail('JOIN_UNAVAILABLE'); return code; }
class JoinCodeCollision extends Error {}
async function allocateJoinCode(action) {
  for (let attempt = 0; attempt < 16; attempt++) {
    try { return await db.runTransaction(action); }
    catch (error) { if (!(error instanceof JoinCodeCollision)) throw error; }
  }
  fail('JOIN_CODE_BUSY');
}
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
const options = { region, maxInstances: 20, memory: '512MiB' };
const call = handler => onCall(options, async request => handler(request.data, uidOf(request), { network: request.rawRequest.ip || 'unknown' }));
const studentRef = binding => db.doc(`classes/${binding.classId}/students/${binding.studentId}`);
async function student(uid, pending = false) {
  const snap = await db.doc(`studentBindings/${uid}`).get();
  if (snap.exists && snap.data().active) {
    const binding = snap.data(), s = await studentRef(binding).get();
    if (s.exists && s.data().status === 'active' && s.data().uid === uid && (pending || (s.data().pinReady === true && binding.pinVersion === s.data().pinVersion))) return { ...binding, data: s.data() };
  }
  if (pending) return null;
  fail('PENDING_APPROVAL');
}
function memberValid(member, binding, uid) {
  return member.exists && member.data().status === 'active' && member.data().uid === uid && member.data().pinReady === true && member.data().pinVersion === binding.pinVersion;
}
async function assertStudentTx(tx, member, binding, uid) {
  const bound = await tx.get(db.doc(`studentBindings/${uid}`));
  if (!memberValid(member, binding, uid) || !bound.data()?.active || bound.data().pinVersion !== binding.pinVersion || bound.data().bindingVersion !== binding.bindingVersion) fail('FORBIDDEN');
}
async function teacher(uid) {
  const snap = await db.doc(`teacherBindings/${uid}`).get();
  if (!snap.exists || !snap.data().active) fail('FORBIDDEN');
  const space = await db.doc(`teachers/${snap.data().teacherId}`).get();
  if (!space.exists || space.data().authEpoch !== snap.data().epoch) fail('FORBIDDEN');
  return snap.data().teacherId;
}
async function ownedClass(uid, classId) {
  const teacherId = await teacher(uid), ref = db.doc(`classes/${documentId(classId)}`), snap = await ref.get();
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
const sessionExpired = s => Boolean(s.expiresAt && s.expiresAt <= now());
function safeSession(s) {
  s = unpackSession(s);
  const questions = s.questions.map((q, i) => i < s.currentIndex || q.status === 'answered' ? safeQuestion(q, true) : i === s.currentIndex ? safeQuestion(q) : { index: i });
  const result = s.status === 'playing' ? null : { ...summarize(s), seasonId: s.seasonId, saveStatus: 'confirmed', rankStatus: s.status === 'complete' && s.mode === 'regular' ? 'ready' : 'excluded' };
  return { sessionId: s.sessionId, gameId: s.gameId, versions: s.versions, seasonId: s.seasonId, mode: s.mode, status: s.status, currentIndex: s.currentIndex, revision: s.revision, feedbackIndex: s.feedbackIndex, startedAt: s.startedAt, expiresAt: s.expiresAt, progressState: s.progressState || 'running', savedAt: s.savedAt || null, uiState: s.uiState || null, timer: { policy: 'unlimited', remainingMs: null }, questions, result };
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

export const createTeacherSpace = call(async (data, uid) => {
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
export const recoverTeacherSpace = call(async (data, uid) => {
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
    const google = await tx.get(db.doc(`sheetConnections/${teacherId}`));
    const subjectRef = google.data()?.subject ? db.doc(`googleSubjects/${hash(google.data().subject)}`) : null;
    const subjectOwner = subjectRef ? await tx.get(subjectRef) : null;
    const epoch = space.data().authEpoch + 1;
    tx.update(keyRef, { active: false, usedAt: now() }); tx.update(teacherRef, { authEpoch: epoch });
    // Recovery invalidates Workspace access even when using the Functions fallback.
    // Existing teacher-owned files remain in Drive; reconnect before returning URLs.
    tx.delete(db.doc(`sheetConnections/${teacherId}`));
    if (subjectOwner?.data()?.teacherId === teacherId) tx.delete(subjectRef);
    tx.create(db.doc(`teacherBindings/${uid}`), { teacherId, epoch, active: true });
    tx.create(db.doc(`recoveryKeys/${newId}`), { teacherId, secretHash: digest(newSecret), version: epoch, active: true });
    return { teacherId, recoveryKey: `${newId}.${newSecret}` };
  });
  return result;
});
export const createClass = call(async (data, uid) => {
  fields(data, ['privateLabel', 'requestId']); requestId(data);
  const teacherId = await teacher(uid), privateLabel = nameOf(data.privateLabel);
  if (!privateLabel) fail('INVALID_NAME');
  const op = opRef(uid, 'createClass', data.requestId), fp = hash(JSON.stringify([privateLabel]));
  return allocateJoinCode(async tx => {
    const prior = checkOp(await tx.get(op), fp); if (prior) return prior;
    const classId = randomId(), code = generateJoinCode(randomBytes), codeDigest = digest(code);
    const codeRef = db.doc(`joinCodes/${codeDigest}`);
    if ((await tx.get(codeRef)).exists) throw new JoinCodeCollision();
    const result = { classId, code, privateLabel, globalOptIn: true };
    tx.create(db.doc(`classes/${classId}`), { ownerTeacherId: teacherId, privateLabel, status: 'active', joinEnabled: true, globalOptIn: true, codeCipher: codeCrypt(code), codeVersion: 1, createdAt: now() });
    tx.create(codeRef, { classId, codeVersion: 1, active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    tx.create(op, { fingerprint: fp, result }); return result;
  });
});
export const ensureClassJoinCode = call(async (data, uid) => {
  fields(data, ['classId']); const { ref, teacherId } = await ownedClass(uid, data.classId);
  return allocateJoinCode(async tx => {
    const snap = await tx.get(ref), cls = snap.data();
    if (!snap.exists || cls.ownerTeacherId !== teacherId) fail('FORBIDDEN');
    const oldCode = codeCrypt(cls.codeCipher, true);
    if (/^[0-9]{4}$/.test(oldCode)) return { classId: ref.id, code: oldCode };
    const code = generateJoinCode(randomBytes), codeDigest = digest(code), codeRef = db.doc(`joinCodes/${codeDigest}`);
    if ((await tx.get(codeRef)).exists) throw new JoinCodeCollision();
    // Atomic rollback record before changing only the displayed code. Existing
    // index/version, pending applications, students and learning records stay valid.
    tx.create(db.doc(`joinCodeBackups/${ref.id}:${codeDigest}`), { codeCipher: cls.codeCipher, codeVersion: cls.codeVersion, oldCodeDigest: digest(oldCode), newCodeDigest: codeDigest, createdAt: now() });
    tx.create(codeRef, { classId: ref.id, codeVersion: cls.codeVersion, active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    tx.update(ref, { codeCipher: codeCrypt(code) });
    return { classId: ref.id, code };
  });
});
export const listClasses = call(async (data, uid) => {
  fields(data, []); const teacherId = await teacher(uid);
  const snap = await db.collection('classes').where('ownerTeacherId', '==', teacherId).limit(50).get();
  return { classes: snap.docs.map(d => ({ classId: d.id, privateLabel: d.data().privateLabel, code: codeCrypt(d.data().codeCipher, true), status: d.data().status, joinEnabled: d.data().joinEnabled, globalOptIn: d.data().globalOptIn !== false })) };
});
export const listPendingStudents = call(async (data, uid) => {
  fields(data, ['classId']); const { ref } = await ownedClass(uid, data.classId);
  const snap = await ref.collection('students').where('status', '==', 'pending').limit(200).get();
  return { students: snap.docs.map(d => ({ studentId: d.id, privateName: d.data().privateName, checkMark: d.data().checkMark, classAlias: d.data().classAlias })) };
});
export const listClassSessions = call(async (data, uid) => {
  fields(data, ['classId', 'gameId']); if (data.gameId !== GAME.gameId) fail('INVALID_REQUEST');
  const { ref } = await ownedClass(uid, data.classId);
  const snap = await ref.collection('sessions').where('gameId', '==', GAME.gameId).limit(200).get();
  return { sessions: snap.docs.map(d => { const s = unpackSession(d.data()), result = summarize(s); return { sessionId: d.id, studentId: s.studentId, seasonId: s.seasonId, startedAt: s.startedAt, status: s.status, progressState: s.progressState || 'running', completion: result.completion, score: result.score, correct: result.correct, wrong: result.wrong, skipped: result.skipped, unanswered: result.unanswered }; }) };
});
export const getSessionDetails = call(async (data, uid) => {
  fields(data, ['classId', 'sessionId']); const { ref } = await ownedClass(uid, data.classId);
  const snap = await ref.collection('sessions').doc(documentId(data.sessionId)).get();
  if (!snap.exists) fail('NOT_FOUND');
  const s = unpackSession(snap.data()), studentSnap = await ref.collection('students').doc(s.studentId).get();
  return { result: { ...summarize(s), status: s.status, progressState: s.progressState || 'running' }, seasonId: s.seasonId, student: { privateName: studentSnap.data()?.privateName || '', classAlias: studentSnap.data()?.classAlias || '' }, answers: s.questions.filter(q => q.status === 'answered').map(q => ({ index: q.index, typeId: q.typeId, subtype: q.subtype, operands: q.operands, answer: q.answer, firstResponse: q.firstResponse, firstCorrect: q.firstCorrect, skipped: Boolean(q.skipped) })) };
});
export const setClassGlobalParticipation = call(async (data, uid) => {
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
export const approveStudent = call(async (data, uid) => {
  fields(data, ['classId', 'studentId']); const { ref } = await ownedClass(uid, data.classId), sid = documentId(data.studentId);
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
export const listClassStudents = call(async (data, uid) => {
  fields(data, ['classId']); const { ref } = await ownedClass(uid, data.classId);
  const snap = await ref.collection('students').where('status', '==', 'active').limit(200).get();
  return { students: snap.docs.map(d => ({ studentId: d.id, privateName: d.data().privateName, classAlias: d.data().classAlias, checkMark: d.data().checkMark, pinReady: d.data().pinReady === true, globalOptIn: d.data().globalOptIn !== false, bestScores: d.data().bestScores || {} })) };
});
export const renameStudent = call(async (data, uid) => {
  fields(data, ['classId', 'studentId', 'privateName', 'requestId']); requestId(data);
  const { ref } = await ownedClass(uid, data.classId), sid = documentId(data.studentId), privateName = nameOf(str(data.privateName, 100));
  if (!privateName) fail('INVALID_NAME');
  const sref = ref.collection('students').doc(sid), op = opRef(uid, 'renameStudent', data.requestId), fp = hash(JSON.stringify([data.classId, sid, privateName]));
  return db.runTransaction(async tx => {
    const [prior, snap, sheet] = await Promise.all([tx.get(op), tx.get(sref), tx.get(db.doc(`sheetExports/${data.classId}`))]);
    const saved = checkOp(prior, fp); if (saved) return saved;
    if (!snap.exists || snap.data().status !== 'active') fail('NOT_FOUND');
    tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'rename', classId: data.classId, studentId: sid, before: snap.data(), changedBy: uid, createdAt: now() });
    tx.update(sref, { privateName, renamedAt: now() });
    if (sheet.data()?.spreadsheetId) tx.set(db.doc(`sheetJobs/${data.classId}`), { state: 'pending', dirty: randomId(), nextRunAt: 0 });
    const result = { studentId: sid, privateName }; tx.create(op, { fingerprint: fp, result }); return result;
  });
});
export const removeStudent = call(async (data, uid) => {
  fields(data, ['classId', 'studentId', 'requestId']); requestId(data);
  const { ref } = await ownedClass(uid, data.classId), sid = documentId(data.studentId), sref = ref.collection('students').doc(sid);
  const op = opRef(uid, 'removeStudent', data.requestId), fp = hash(JSON.stringify([data.classId, sid]));
  return db.runTransaction(async tx => {
    const [prior, snap, sheet] = await Promise.all([tx.get(op), tx.get(sref), tx.get(db.doc(`sheetExports/${data.classId}`))]);
    const saved = checkOp(prior, fp); if (saved) return saved;
    if (!snap.exists || !['active', 'removed'].includes(snap.data().status)) fail('NOT_FOUND');
    if (snap.data().status === 'removed') return { status: 'removed' };
    const s = snap.data(), bound = db.doc(`studentBindings/${s.uid}`), binding = await tx.get(bound);
    const keys = Object.keys(s.bestScores || {});
    if (keys.length > 100) fail('RATE_LIMITED');
    const ranks = await Promise.all(keys.map(key => rankRefs(tx, data.classId, sid, key)));
    // Keep a restorable record before revoking membership and removing projections.
    tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'remove', classId: data.classId, studentId: sid, before: s, binding: binding.data() || null, ranks: ranks.map(r => ({ classEntryPath: r.ce.path, globalEntryPath: r.ge.path, classEntry: r.ces.data() || null, globalEntry: r.ges.data() || null, classCountPath: r.cc.path, globalCountPath: r.gc.path, classCount: r.ccs.data() || null, globalCount: r.gcs.data() || null })), changedBy: uid, createdAt: now() });
    tx.update(sref, { status: 'removed', removedAt: now(), removedBy: uid });
    if (binding.data()?.classId === data.classId && binding.data()?.studentId === sid) tx.update(bound, { active: false, removed: true });
    for (const r of ranks) {
      if (r.ces.exists) { tx.delete(r.ce); tx.set(r.cc, { counts: scoreCounts(r.ccs.data()?.counts, r.ces.data().score, null), updatedAt: now() }); }
      if (r.ges.exists) { tx.delete(r.ge); tx.set(r.gc, { counts: scoreCounts(r.gcs.data()?.counts, r.ges.data().score, null), updatedAt: now() }); }
    }
    if (sheet.data()?.spreadsheetId) tx.set(db.doc(`sheetJobs/${data.classId}`), { state: 'pending', dirty: randomId(), nextRunAt: 0 });
    const result = { status: 'removed' }; tx.create(op, { fingerprint: fp, result }); return result;
  });
});
export const getTeacherLeaderboard = call(async (data, uid) => {
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
export const issueStudentReturnTicket = call(async (data, uid) => {
  fields(data, ['classId', 'studentId']); const { ref } = await ownedClass(uid, data.classId);
  const studentId = documentId(data.studentId), snap = await ref.collection('students').doc(studentId).get();
  if (!snap.exists || snap.data().status !== 'active') fail('NOT_FOUND');
  const ticket = randomBytes(16).toString('base64url'), ticketHash = digest(ticket);
  await db.doc(`studentReturnTickets/${ticketHash}`).create({ classId: data.classId, studentId, pinVersion: snap.data().pinVersion || 0, expiresAt: new Date(Date.now() + 600000).toISOString(), usedAt: null });
  return { ticket, expiresInSeconds: 600 };
});
export const redeemStudentReturnTicket = call(async (data, uid) => {
  fields(data, ['ticket', 'requestId']); requestId(data);
  const ticket = str(data.ticket, 80), ticketRef = db.doc(`studentReturnTickets/${digest(ticket)}`), op = opRef(uid, 'redeemTicket', data.requestId), fingerprint = hash(ticket);
  return db.runTransaction(async tx => {
    const [prior, token, existing, pending, teacherBinding] = await Promise.all([tx.get(op), tx.get(ticketRef), tx.get(db.doc(`studentBindings/${uid}`)), tx.get(db.doc(`joinRequests/${uid}`)), tx.get(db.doc(`teacherBindings/${uid}`))]);
    if (teacherBinding.exists) fail('FORBIDDEN');
    const previous = checkOp(prior, fingerprint);
    if (previous) {
      if (!existing.data()?.active) fail('FORBIDDEN');
      const member = await tx.get(studentRef(existing.data()));
      if (!member.exists || member.data().status !== 'active' || member.data().uid !== uid || (member.data().pinVersion || 0) !== (token.data()?.pinVersion || 0)) fail('FORBIDDEN');
      return previous;
    }
    if (!token.exists || token.data().usedAt || token.data().expiresAt <= now()) fail('FORBIDDEN');
    const { classId, studentId } = token.data(), studentDoc = db.doc(`classes/${classId}/students/${studentId}`), studentSnap = await tx.get(studentDoc);
    if (existing.exists && (existing.data().active || existing.data().removed || existing.data().classId !== classId || existing.data().studentId !== studentId)) fail('FORBIDDEN');
    if (pending.exists && (pending.data().status !== 'joined' || pending.data().classId !== classId || pending.data().studentId !== studentId)) fail('FORBIDDEN');
    if (!studentSnap.exists || studentSnap.data().status !== 'active' || (token.data().pinVersion || 0) !== (studentSnap.data().pinVersion || 0)) fail('FORBIDDEN');
    const oldUid = studentSnap.data().uid, oldBinding = db.doc(`studentBindings/${oldUid}`), oldPointer = db.doc(`activeSessions/${digest(`${oldUid}:${GAME.gameId}`)}`);
    const [bindingSnap, pointerSnap] = await Promise.all([tx.get(oldBinding), tx.get(oldPointer)]);
    if (oldUid !== uid) deviceMoveBackup(tx, classId, studentId, studentSnap.data(), uid, bindingSnap, existing, pointerSnap);
    tx.update(ticketRef, { usedAt: now(), usedBy: uid });
    if (bindingSnap.exists) tx.update(oldBinding, { active: false });
    tx.update(studentDoc, { uid });
    tx.set(db.doc(`studentBindings/${uid}`), { classId, studentId, active: true, bindingVersion: (bindingSnap.data()?.bindingVersion || 0) + 1, pinVersion: studentSnap.data().pinVersion || 0 });
    if (pointerSnap.exists && oldUid !== uid) { tx.set(db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`), pointerSnap.data()); tx.delete(oldPointer); }
    const result = loginStatus(studentSnap.data());
    tx.create(op, { fingerprint, result }); return result;
  });
});
export const detachStudentDevice = call(async (data, uid) => {
  fields(data, []);
  const bindingRef = db.doc(`studentBindings/${uid}`);
  await db.runTransaction(async tx => { const snap = await tx.get(bindingRef); if (snap.exists && snap.data().active) tx.update(bindingRef, { active: false }); });
  return { status: 'detached' };
});
export const requestJoin = call(async (data, uid, context = {}) => {
  fields(data, ['code', 'privateName', 'pin', 'pinConfirm', 'requestId']); requestId(data); await loginRate(uid, context, 'register');
  if (data.privateName !== undefined && typeof data.privateName !== 'string') fail('INVALID_NAME');
  const code = codeOf(data.code), privateName = nameOf(data.privateName), idx = db.doc(`joinCodes/${digest(code)}`);
  const pending = db.doc(`joinRequests/${uid}`);
  const result = await db.runTransaction(async tx => {
    const [joined, old, codeSnap, teacherBinding] = await Promise.all([tx.get(db.doc(`studentBindings/${uid}`)), tx.get(pending), tx.get(idx), tx.get(db.doc(`teacherBindings/${uid}`))]);
    if (teacherBinding.exists) fail('FORBIDDEN');
    if (!codeSnap.exists || !codeSnap.data().active || codeSnap.data().expiresAt <= now()) fail('JOIN_UNAVAILABLE');
    const classId = codeSnap.data().classId, classSnap = await tx.get(db.doc(`classes/${classId}`));
    if (!classSnap.exists || classSnap.data().status !== 'active' || !classSnap.data().joinEnabled || classSnap.data().codeVersion !== codeSnap.data().codeVersion) fail('JOIN_UNAVAILABLE');
    if (joined.exists) {
      if (!joined.data().active || joined.data().classId !== classId) fail('FORBIDDEN');
      const member = await tx.get(studentRef(joined.data()));
      if (!member.exists || member.data().status !== 'active' || member.data().uid !== uid) fail('FORBIDDEN');
      return { ...loginStatus(member.data()), checkMark: member.data().checkMark };
    }
    if (old.exists) {
      if (old.data().classId !== classId) fail('FORBIDDEN');
      const sref = db.doc(`classes/${classId}/students/${old.data().studentId}`), snap = await tx.get(sref);
      if (!snap.exists || snap.data().status !== 'pending' || snap.data().uid !== uid) fail('FORBIDDEN');
      return enrollPending(tx, uid, pending, old, sref, snap);
    }
    if (!privateName) fail('INVALID_NAME');
    pinPair(data);
    const studentId = randomId(), checkMark = String(randomBytes(1)[0] % 90 + 10), classAlias = aliasOf(studentId);
    tx.create(db.doc(`classes/${classId}/students/${studentId}`), { uid, privateName, checkMark, classAlias, status: 'active', globalOptIn: true, pinReady: true, pinVersion: 1, createdAt: now(), joinedAt: now() });
    tx.create(pinRef(classId, studentId), createPin(data.pin, `${classId}:${studentId}`, secret));
    tx.create(db.doc(`studentBindings/${uid}`), { classId, studentId, active: true, bindingVersion: 1, pinVersion: 1 });
    return { status: 'approved', checkMark, classAlias, privateName, globalParticipation: true };
  });
  return result;
});
function enrollPending(tx, uid, pendingRef, pending, sref, snap) {
  const s = snap.data(), p = pending.data();
  tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'enroll-pending', classId: p.classId, studentId: p.studentId, before: s, pending: p, createdAt: now() });
  tx.update(sref, { status: 'active', globalOptIn: true, joinedAt: now() });
  tx.create(db.doc(`studentBindings/${uid}`), { classId: p.classId, studentId: p.studentId, active: true, bindingVersion: 1 });
  tx.update(pendingRef, { status: 'joined' });
  return { status: 'pin-required', classAlias: s.classAlias, privateName: s.privateName, checkMark: s.checkMark, globalParticipation: true };
}
async function enrollLegacyPending(uid) {
  const bound = db.doc(`studentBindings/${uid}`), pendingRef = db.doc(`joinRequests/${uid}`);
  const candidate = await pendingRef.get(); if (!candidate.exists || candidate.data().status === 'joined') return;
  await db.runTransaction(async tx => {
    const [binding, pending] = await Promise.all([tx.get(bound), tx.get(pendingRef)]);
    if (binding.exists || !pending.exists || pending.data().status === 'joined') return;
    const {classId, studentId} = pending.data(), sref = db.doc(`classes/${classId}/students/${studentId}`);
    const [cls, snap] = await Promise.all([tx.get(db.doc(`classes/${classId}`)), tx.get(sref)]);
    if (!cls.exists || cls.data().status !== 'active' || !cls.data().joinEnabled || !snap.exists || snap.data().status !== 'pending' || snap.data().uid !== uid) return;
    enrollPending(tx, uid, pendingRef, pending, sref, snap);
  });
}
export const getStudentStatus = call(async (data, uid) => {
  fields(data, []); await enrollLegacyPending(uid); const s = await student(uid, true);
  if (s) return { status: s.data.pinReady && s.pinVersion === s.data.pinVersion ? 'approved' : 'pin-required', classAlias: s.data.classAlias, privateName: s.data.privateName, globalParticipation: s.data.globalOptIn !== false };
  return { status: 'new' };
});

const pinRef = (classId, studentId) => db.doc(`studentPins/${classId}:${studentId}`);
function pinPair(data) { if (!validPin(data.pin) || data.pin !== data.pinConfirm) fail('INVALID_PIN'); }
async function loginRate(uid, context, operation) {
  await rateLimit(`network:${context.network || 'unknown'}`, `student-${operation}`, 60, 900000);
  await rateLimit(uid, `student-${operation}`, 10, 900000);
  if (operation === 'roster' || operation === 'register') await rateLimit('student-login-global', 'class-code', 300, 60000);
}
function loginStatus(s) { return { status: s.pinReady ? 'approved' : 'pin-required', privateName: s.privateName, classAlias: s.classAlias, globalParticipation: s.globalOptIn !== false }; }
function deviceMoveBackup(tx, classId, studentId, before, uid, oldBinding, newBinding, pointer) {
  tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'device-login', classId, studentId, before, oldBinding: oldBinding.data() || null, newBinding: newBinding.data() || null, activeSession: pointer.data() || null, changedBy: uid, createdAt: now() });
}
function rosterGrant(uid, classId, codeVersion) {
  const payload = Buffer.from(JSON.stringify({ uid, classId, codeVersion, expires: Date.now() + 600000 })).toString('base64url');
  return `${payload}.${digest(`roster:${payload}`)}`;
}
function readGrant(grant, uid) {
  const [payload, signature] = str(grant, 1000).split('.');
  const expected = Buffer.from(digest(`roster:${payload}`)), actual = Buffer.from(signature || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('LOGIN_FAILED');
  let data; try { data = JSON.parse(Buffer.from(payload, 'base64url')); } catch { fail('LOGIN_FAILED'); }
  if (data.uid !== uid || !Number.isFinite(data.expires) || data.expires <= Date.now()) fail('LOGIN_FAILED');
  documentId(data.classId); return data;
}
export const getClassLoginRoster = call(async (data, uid, context = {}) => {
  fields(data, ['code']); await loginRate(uid, context, 'roster');
  // Shared across anonymous accounts, addresses and Worker instances. A
  // conservative aggregate ceiling also bounds distributed code enumeration.
  const code = codeOf(data.code), index = await db.doc(`joinCodes/${digest(code)}`).get();
  if (!index.exists || !index.data().active || index.data().expiresAt <= now()) fail('JOIN_UNAVAILABLE');
  const classId = index.data().classId, cls = await db.doc(`classes/${classId}`).get();
  if (!cls.exists || cls.data().status !== 'active' || !cls.data().joinEnabled || cls.data().codeVersion !== index.data().codeVersion) fail('JOIN_UNAVAILABLE');
  const rows = await db.doc(`classes/${classId}`).collection('students').where('status', '==', 'active').limit(200).get();
  if (rows.size >= 200) fail('ROSTER_LIMIT');
  const students = rows.docs.sort((a, b) => a.id.localeCompare(b.id)).map((doc, i) => ({ studentId: doc.id, privateName: doc.data().privateName || '이름 없음', classAlias: doc.data().classAlias, choiceNumber: i + 1, pinReady: doc.data().pinReady === true }));
  return { grant: rosterGrant(uid, classId, cls.data().codeVersion), students };
});
export const setStudentPin = call(async (data, uid) => {
  fields(data, ['pin', 'pinConfirm', 'requestId']); requestId(data); pinPair(data);
  await rateLimit(uid, 'pin-setup', 10, 900000);
  const binding = await student(uid, true); if (!binding) fail('FORBIDDEN');
  const ref = studentRef(binding), credentialRef = pinRef(binding.classId, binding.studentId);
  const op = opRef(uid, 'setStudentPin', data.requestId), fingerprint = digest(JSON.stringify([binding.classId, binding.studentId, data.pin]));
  return db.runTransaction(async tx => {
    const [snap, bound, credential, prior] = await Promise.all([tx.get(ref), tx.get(db.doc(`studentBindings/${uid}`)), tx.get(credentialRef), tx.get(op)]);
    if (!snap.exists || snap.data().status !== 'active' || snap.data().uid !== uid || !bound.data()?.active) fail('FORBIDDEN');
    const previous = checkOp(prior, fingerprint); if (previous) { if (bound.data().pinVersion !== snap.data().pinVersion || !snap.data().pinReady || !verifyPin(data.pin, credential.data(), `${binding.classId}:${binding.studentId}`, secret)) fail('FORBIDDEN'); return previous; }
    // Only an existing authenticated legacy binding or a teacher return ticket
    // grants this migration. An already configured PIN is never overwritten.
    if (snap.data().pinReady === true || credential.data()?.enabled === true) fail('PIN_ALREADY_SET');
    const version = (snap.data().pinVersion || 0) + 1;
    tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'pin-migration', classId: binding.classId, studentId: binding.studentId, before: snap.data(), binding: bound.data(), credential: credential.data() || null, changedBy: uid, createdAt: now() });
    tx.set(credentialRef, createPin(data.pin, `${binding.classId}:${binding.studentId}`, secret, version));
    tx.update(ref, { pinReady: true, pinVersion: version });
    tx.update(db.doc(`studentBindings/${uid}`), { pinVersion: version });
    const result = loginStatus({ ...snap.data(), pinReady: true }); tx.create(op, { fingerprint, result }); return result;
  });
});
export const loginStudentPin = call(async (data, uid, context = {}) => {
  fields(data, ['grant', 'studentId', 'pin', 'requestId']); requestId(data);
  await loginRate(uid, context, 'pin');
  const grant = readGrant(data.grant, uid), sid = documentId(data.studentId), ref = db.doc(`classes/${grant.classId}/students/${sid}`), credentialRef = pinRef(grant.classId, sid);
  // Count before checking the PIN, in an independent committed transaction:
  // throwing from the authentication transaction cannot roll back the count.
  await rateLimit(`student:${grant.classId}:${sid}`, 'pin', 6, 900000);
  const op = opRef(uid, 'loginStudentPin', data.requestId), fingerprint = digest(JSON.stringify([grant.classId, sid, data.pin]));
  const result = await db.runTransaction(async tx => {
    const [snap, credential, cls, existing, prior, teacherBinding] = await Promise.all([tx.get(ref), tx.get(credentialRef), tx.get(db.doc(`classes/${grant.classId}`)), tx.get(db.doc(`studentBindings/${uid}`)), tx.get(op), tx.get(db.doc(`teacherBindings/${uid}`))]);
    if (teacherBinding.exists || !cls.exists || cls.data().status !== 'active' || !cls.data().joinEnabled || cls.data().codeVersion !== grant.codeVersion || !snap.exists || snap.data().status !== 'active' || !snap.data().pinReady || !credential.exists || credential.data().version !== snap.data().pinVersion) fail('LOGIN_FAILED');
    if (credential.data().locked || !verifyPin(data.pin, credential.data(), `${grant.classId}:${sid}`, secret)) {
      const failedAttempts = Math.min(5, (credential.data().failedAttempts || 0) + 1);
      tx.update(credentialRef, { failedAttempts, locked: failedAttempts >= 5 });
      // Commit the failure counter before rejecting. Five consecutive failures
      // require the teacher to change/reset the PIN, even after 15 minutes.
      return { loginDenied: true };
    }
    const s = snap.data(), previous = checkOp(prior, fingerprint);
    if (previous) { if (s.uid !== uid || !existing.data()?.active || existing.data().pinVersion !== s.pinVersion) fail('LOGIN_FAILED'); return previous; }
    if (existing.exists && (existing.data().classId !== grant.classId || existing.data().studentId !== sid || existing.data().removed)) fail('FORBIDDEN');
    const oldBinding = db.doc(`studentBindings/${s.uid}`), oldPointer = db.doc(`activeSessions/${digest(`${s.uid}:${GAME.gameId}`)}`), newPointer = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`);
    const [bound, pointer] = await Promise.all([tx.get(oldBinding), tx.get(oldPointer)]);
    if (s.uid !== uid) deviceMoveBackup(tx, grant.classId, sid, s, uid, bound, existing, pointer);
    if (s.uid !== uid) { if (bound.exists) tx.update(oldBinding, { active: false }); if (pointer.exists) { tx.set(newPointer, pointer.data()); tx.delete(oldPointer); } }
    tx.update(ref, { uid });
    tx.update(credentialRef, { failedAttempts: 0, locked: false });
    tx.set(db.doc(`studentBindings/${uid}`), { classId: grant.classId, studentId: sid, active: true, bindingVersion: (bound.data()?.bindingVersion || 0) + 1, pinVersion: s.pinVersion });
    const result = loginStatus(s); tx.create(op, { fingerprint, result }); return result;
  });
  if (result.loginDenied) fail('LOGIN_FAILED');
  return result;
});
export const changeStudentPin = call(async (data, uid) => {
  fields(data, ['classId', 'studentId', 'pin', 'pinConfirm', 'reset', 'requestId']); requestId(data);
  if (data.reset !== true) pinPair(data);
  else if (data.pin !== undefined || data.pinConfirm !== undefined) fail('INVALID_REQUEST');
  const { ref } = await ownedClass(uid, data.classId), sid = documentId(data.studentId), memberRef = ref.collection('students').doc(sid), credentialRef = pinRef(data.classId, sid);
  const op = opRef(uid, 'changeStudentPin', data.requestId), fingerprint = digest(JSON.stringify([data.classId, sid, data.reset === true, data.pin]));
  return db.runTransaction(async tx => {
    const [member, credential, prior] = await Promise.all([tx.get(memberRef), tx.get(credentialRef), tx.get(op)]);
    const previous = checkOp(prior, fingerprint); if (previous) return previous;
    if (!member.exists || member.data().status !== 'active') fail('NOT_FOUND');
    const s = member.data(), boundRef = db.doc(`studentBindings/${s.uid}`), bound = await tx.get(boundRef), version = (s.pinVersion || 0) + 1;
    tx.create(db.doc(`studentAdminBackups/${randomId()}`), { action: 'pin-change', classId: data.classId, studentId: sid, before: s, binding: bound.data() || null, credential: credential.data() || null, changedBy: uid, createdAt: now() });
    tx.set(credentialRef, data.reset ? { enabled: false, version } : createPin(data.pin, `${data.classId}:${sid}`, secret, version));
    tx.update(memberRef, { pinReady: !data.reset, pinVersion: version });
    if (bound.exists) tx.update(boundRef, { active: false });
    tx.delete(db.doc(`rateLimits/${digest(`student:${data.classId}:${sid}:pin`)}`));
    const result = { studentId: sid, pinReady: !data.reset }; tx.create(op, { fingerprint, result }); return result;
  });
});

export const getStudentGames = call(async (data, uid) => {
  fields(data, []); const binding = await student(uid);
  const games = [];
  for (const game of GAME_CATALOG) {
    const pointer = await db.doc(`activeSessions/${digest(`${uid}:${game.gameId}`)}`).get();
    const active = pointer.exists ? await readStudentSession(pointer.data().sessionId, uid, binding) : null;
    games.push({ ...game, activeSession: active?.status === 'playing' ? active : null });
  }
  return { games };
});
export const saveSession = call(async (data, uid) => {
  fields(data, ['sessionId','expectedRevision','uiState','requestId']); requestId(data);
  const binding = await student(uid), sid = documentId(data.sessionId), ref = db.doc(`classes/${binding.classId}/sessions/${sid}`);
  if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) fail('INVALID_REQUEST');
  const op = opRef(uid, 'saveSession', data.requestId), fingerprint = hash(JSON.stringify([sid, data.uiState]));
  return db.runTransaction(async tx => {
    const [snap, member, prior] = await Promise.all([tx.get(ref),tx.get(studentRef(binding)),tx.get(op)]);
    await assertStudentTx(tx, member, binding, uid);
    const previous = checkOp(prior, fingerprint); if (previous) return previous;
    if (!snap.exists || snap.data().studentId !== binding.studentId || snap.data().status !== 'playing') fail('SESSION_NOT_ACTIVE');
    const s = unpackSession(snap.data()); if (sessionExpired(s)) fail('SESSION_EXPIRED');
    if (data.expectedRevision !== s.revision) fail('REVISION_CONFLICT');
    let uiState; try { uiState = checkedProgressUI(s, data.uiState); } catch { fail('INVALID_PROGRESS'); }
    if (s.storageVersion !== 2) tx.create(db.doc(`sessionProgressBackups/${randomId()}`), { classId: binding.classId, studentId: binding.studentId, sessionId: sid, before: snap.data(), changedBy: uid, createdAt: now() });
    Object.assign(s, { progressState: 'paused', savedAt: now(), uiState, storageVersion: 2, expiresAt: null, revision: s.revision + 1 });
    tx.update(ref, { progressState: s.progressState, savedAt: s.savedAt, uiState, storageVersion: 2, expiresAt: null, revision: s.revision });
    const result = JSON.parse(JSON.stringify({ session: safeSession(s), saveStatus: 'confirmed', recordKind: 'progress' }));
    tx.create(op, { fingerprint, resultJson: JSON.stringify(result) }); return result;
  });
});
export const resumeSession = call(async (data, uid) => {
  fields(data, ['sessionId','expectedRevision','requestId']); requestId(data);
  if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) fail('INVALID_REQUEST');
  const binding = await student(uid), sid = documentId(data.sessionId), ref = db.doc(`classes/${binding.classId}/sessions/${sid}`);
  const op = opRef(uid, 'resumeSession', data.requestId), fingerprint = hash(sid);
  return db.runTransaction(async tx => {
    const [snap, member, prior] = await Promise.all([tx.get(ref),tx.get(studentRef(binding)),tx.get(op)]);
    await assertStudentTx(tx, member, binding, uid);
    const previous = checkOp(prior, fingerprint); if (previous) return previous;
    if (!snap.exists || snap.data().studentId !== binding.studentId || snap.data().status !== 'playing') fail('SESSION_NOT_ACTIVE');
    const s = unpackSession(snap.data()); if (sessionExpired(s)) fail('SESSION_EXPIRED');
    if (data.expectedRevision !== s.revision) fail('REVISION_CONFLICT');
    if (s.progressState === 'paused') { s.progressState = 'running'; s.revision++; tx.update(ref, { progressState: 'running', revision: s.revision }); }
    const result = JSON.parse(JSON.stringify(safeSession(s))); tx.create(op, { fingerprint, resultJson: JSON.stringify(result) }); return result;
  });
});
export const startSession = call(async (data, uid) => {
  fields(data, ['gameId', 'mode', 'requestId']); requestId(data);
  if (data.gameId !== GAME.gameId || data.mode !== 'regular') fail('INVALID_REQUEST');
  const binding = await student(uid), fingerprint = hash(JSON.stringify([data.gameId, data.mode]));
  const op = opRef(uid, 'startSession', data.requestId), active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`);
  return db.runTransaction(async tx => {
    const [prior, pointer, classSnap, member] = await Promise.all([tx.get(op), tx.get(active), tx.get(db.doc(`classes/${binding.classId}`)), tx.get(studentRef(binding))]);
    await assertStudentTx(tx, member, binding, uid);
    const previous = checkOp(prior, fingerprint);
    if (previous) {
      const saved = await tx.get(db.doc(`classes/${binding.classId}/sessions/${previous.sessionId}`));
      return safeSession(saved.data());
    }
    if (!classSnap.exists || classSnap.data().status !== 'active') fail('FORBIDDEN');
    if (pointer.exists) {
      const old = await tx.get(db.doc(`classes/${binding.classId}/sessions/${pointer.data().sessionId}`));
      if (old.exists && old.data().status === 'playing' && !sessionExpired(old.data())) {
        tx.create(op, { fingerprint, result: { sessionId: old.id } });
        return safeSession(old.data());
      }
    }
    const seed = randomBytes(4).readUInt32BE(), sessionId = randomId(), startedAt = now();
    const s = buildSession(seed); Object.assign(s, { sessionId, studentId: binding.studentId, classId: binding.classId, startedAt, seasonId: seasonOf(startedAt), expiresAt: null, progressState: 'running', storageVersion: 2, revision: 0, mode: 'regular' });
    tx.create(db.doc(`classes/${binding.classId}/sessions/${sessionId}`), packSession(s));
    tx.set(active, { sessionId }); tx.create(op, { fingerprint, result: { sessionId } });
    return safeSession(s);
  });
});

async function readStudentSession(id, uid, binding) {
  id = str(id, 80);
  const ref = db.doc(`classes/${binding.classId}/sessions/${id}`), snap = await ref.get();
  if (!snap.exists || snap.data().studentId !== binding.studentId) fail('FORBIDDEN');
  if (snap.data().status === 'playing' && sessionExpired(snap.data())) {
    return db.runTransaction(async tx => {
      const current = await tx.get(ref), s = unpackSession(current.data());
      if (s.status === 'playing' && sessionExpired(s)) {
        s.status = 'incomplete'; s.endReason = 'expired'; s.finishedAt = now();
        const active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`), pointer = await tx.get(active);
        tx.update(ref, { status: s.status, endReason: s.endReason, finishedAt: s.finishedAt });
        if (pointer.exists && pointer.data().sessionId === id) tx.delete(active);
      }
      return safeSession(s);
    });
  }
  return safeSession(snap.data());
}
export const getSession = call(async (data, uid) => {
  fields(data, ['sessionId']); return readStudentSession(data.sessionId, uid, await student(uid));
});

export const submitAnswer = call(async (data, uid) => {
  fields(data, ['sessionId', 'questionId', 'response', 'skip', 'expectedRevision', 'requestId']); requestId(data);
  const binding = await student(uid), sessionId = str(data.sessionId, 80), questionId = str(data.questionId, 80);
  if (data.skip !== undefined && data.skip !== true) fail('INVALID_REQUEST');
  if (data.skip && data.response !== undefined) fail('INVALID_REQUEST');
  if (!data.skip && !(typeof data.response === 'string' || typeof data.response === 'number' || Array.isArray(data.response))) fail('INVALID_REQUEST');
  if (Array.isArray(data.response) && (data.response.length !== 2 || data.response.some(x => !Number.isInteger(x) || x < 0 || x > 2))) fail('INVALID_REQUEST');
  const fingerprint = hash(JSON.stringify([sessionId, questionId, data.skip || false, data.response]));
  const op = opRef(uid, 'submitAnswer', data.requestId), sref = db.doc(`classes/${binding.classId}/sessions/${sessionId}`);
  return db.runTransaction(async tx => {
    const [prior, snap, member] = await Promise.all([tx.get(op), tx.get(sref), tx.get(studentRef(binding))]);
    await assertStudentTx(tx, member, binding, uid);
    const previous = checkOp(prior, fingerprint); if (previous) return previous;
    if (!snap.exists || snap.data().studentId !== binding.studentId || snap.data().status !== 'playing') fail('SESSION_NOT_ACTIVE');
    const s = unpackSession(snap.data()); if (sessionExpired(s)) fail('SESSION_EXPIRED'); if (s.progressState === 'paused') fail('SESSION_PAUSED');
    if (data.expectedRevision !== undefined && data.expectedRevision !== s.revision) fail('REVISION_CONFLICT');
    const q = s.questions[s.currentIndex]; if (!q || q.id !== questionId) fail('REVISION_CONFLICT');
    const result = data.skip ? { accepted: skipQuestion(q), final: true, correct: false, item: q } : evaluateStep(q, data.response);
    if (!result.accepted) return { accepted: false, reason: result.reason, session: safeSession(s) };
    s.feedbackIndex = q.index; s.uiState = null; s.revision++;
    if (result.final) s.currentIndex++;
    let refs, rankStudent, rankClass, sheetExport;
    if (s.currentIndex === 50 && result.final) {
      const [studentSnap, classSnap, rank, sheet] = await Promise.all([
        tx.get(studentRef(binding)), tx.get(db.doc(`classes/${binding.classId}`)),
        rankRefs(tx, binding.classId, binding.studentId, boardOf(s.seasonId)),
        tx.get(db.doc(`sheetExports/${binding.classId}`))
      ]);
      if (!studentSnap.exists || studentSnap.data().status !== 'active' || !classSnap.exists) fail('FORBIDDEN');
      rankStudent = studentSnap.data(); rankClass = classSnap.data(); refs = rank;
      // Export outbox is part of the Firestore commit, never a Google request.
      // The scheduled worker rechecks owner, binding epoch, and connection.
      if (sheet.data()?.spreadsheetId) {
        const connection = await tx.get(db.doc(`sheetConnections/${rankClass.ownerTeacherId}`));
        sheetExport = connection.data()?.status === 'connected' && connection.data()?.subject === sheet.data().subject;
      }
      s.status = 'complete'; s.finishedAt = now(); s.endReason = 'complete';
    }
    const response = JSON.parse(JSON.stringify({ accepted: true, final: Boolean(result.final), correct: Boolean(result.correct), session: safeSession(s) }));
    if (result.final) tx.set(sref.collection('answers').doc(String(q.index).padStart(2, '0')), { questionIndex: q.index, typeId: q.typeId, subtype: q.subtype, firstResponse: q.firstResponse, firstCorrect: q.firstCorrect, skipped: Boolean(q.skipped), requestId: data.requestId, receivedAt: now() });
    tx.update(sref, { questionsJson: JSON.stringify(s.questions), currentIndex: s.currentIndex, feedbackIndex: s.feedbackIndex, uiState: null, revision: s.revision, status: s.status, finishedAt: s.finishedAt || null, endReason: s.endReason || null });
    if (refs) projectRank(tx, refs, s, rankStudent, rankClass, studentRef(binding));
    if (sheetExport) tx.set(db.doc(`sheetJobs/${binding.classId}`), { state: 'pending', dirty: `${s.sessionId}:${s.revision}`, nextRunAt: 0 });
    tx.create(op, { fingerprint, resultJson: JSON.stringify(response) }); return response;
  });
});

export const finishSession = call(async (data, uid) => {
  fields(data, ['sessionId', 'reason', 'requestId']); requestId(data);
  const binding = await student(uid), sessionId = str(data.sessionId, 80);
  if (!['quit', 'complete'].includes(data.reason)) fail('INVALID_REQUEST');
  const op = opRef(uid, 'finishSession', data.requestId), fingerprint = hash(JSON.stringify([sessionId, data.reason]));
  const sref = db.doc(`classes/${binding.classId}/sessions/${sessionId}`), active = db.doc(`activeSessions/${digest(`${uid}:${GAME.gameId}`)}`);
  return db.runTransaction(async tx => {
    const [prior, snap, pointer, member] = await Promise.all([tx.get(op), tx.get(sref), tx.get(active), tx.get(studentRef(binding))]);
    await assertStudentTx(tx, member, binding, uid);
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

export const setGlobalParticipation = call(async (data, uid) => {
  fields(data, ['enabled']); if (typeof data.enabled !== 'boolean') fail('INVALID_REQUEST');
  const binding = await student(uid), sref = studentRef(binding), classRef = db.doc(`classes/${binding.classId}`);
  await db.runTransaction(async tx => {
    const [current, cls] = await Promise.all([tx.get(sref), tx.get(classRef)]);
    await assertStudentTx(tx, current, binding, uid);
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

export const getLeaderboard = call(async (data, uid) => {
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
    const [scoreText, id, signature] = str(data.cursor, 250).split('.');
    if (signature !== digest(`${boardId}:${scoreText}:${id}`).slice(0, 16) || !/^\d{1,3}$/.test(scoreText) || !/^[a-f0-9]{32}$/.test(id)) fail('INVALID_REQUEST');
    query = query.startAfter(Number(scoreText), id);
  }
  const rows = await query.get(), me = binding && (data.scope === 'class' ? binding.studentId : digest(`${binding.classId}:${binding.studentId}:${key}`).slice(0, 32));
  const rankFor = score => 1 + Object.entries(counts).reduce((n, [point, amount]) => n + (Number(point) > score ? amount : 0), 0);
  const entries = rows.docs.map(d => ({ displayAlias: d.data().displayAlias, score: d.data().score, rank: rankFor(d.data().score), isMe: d.id === me }));
  let myEntry = null;
  if (me) { const own = await db.doc(`${path}/entries/${me}`).get(); if (own.exists) myEntry = { displayAlias: own.data().displayAlias, score: own.data().score, rank: rankFor(own.data().score), isMe: true }; }
  const last = rows.docs.at(-1), nextCursor = rows.size === pageSize ? `${last.data().score}.${last.id}.${digest(`${boardId}:${last.data().score}:${last.id}`).slice(0, 16)}` : null;
  return { boardKey: `${key}:${data.scope}`, scope: data.scope, asOf: now(), projectionVersion: 1, entries, nextCursor, myEntry, rankStatus: 'ready' };
});
