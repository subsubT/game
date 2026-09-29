import { GAME, buildSession, evaluateStep, skipQuestion, summarize } from '../games/1math3/core.js';

const STORAGE_KEY = '1math3.mock.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const currentSeason = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`; };

export class GameService {
  async startSession(_gameId, options = {}) { throw new Error('Not implemented'); }
  async getSession(_sessionId) { throw new Error('Not implemented'); }
  async submitAnswer(_sessionId, _questionId, _response, _requestId) { throw new Error('Not implemented'); }
  async skipAnswer(_sessionId, _questionId, _requestId) { throw new Error('Not implemented'); }
  async finishSession(_sessionId, _reason, _requestId) { throw new Error('Not implemented'); }
  async getLeaderboard(_scope) { throw new Error('Not implemented'); }
  async setGlobalParticipation(_enabled) { throw new Error('Not implemented'); }
}

export class MockGameService extends GameService {
  constructor(storage = globalThis.localStorage) {
    super(); this.storage = storage; this.memory = { session: null, history: [], globalParticipation: true, joined: false, approved: false };
    this.restore(); this.inflight = new Map();
  }
  restore() { try { this.memory = { ...this.memory, ...JSON.parse(this.storage?.getItem(STORAGE_KEY) || '{}') }; } catch {} }
  persist() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.memory)); } catch {} }
  async startSession(gameId, { mode = 'regular', seed = Math.floor(Math.random() * 0xffffffff), restart = false } = {}) {
    if (gameId !== GAME.gameId) throw new Error('UNKNOWN_GAME');
    if (mode === 'regular' && !this.memory.approved) throw new Error('PENDING_APPROVAL');
    if (!restart && this.memory.session?.status === 'playing') return clone(this.memory.session);
    const session = buildSession(seed); session.mode = mode; session.globalParticipation = this.memory.globalParticipation;
    session.sessionId = `mock-${seed >>> 0}-${Date.now().toString(36)}`;
    session.startedAt = new Date().toISOString(); session.seasonId = currentSeason();
    this.memory.session = session; this.persist(); return clone(session);
  }
  async getSession(id) { const s = this.memory.session; return s?.sessionId === id ? clone(s) : null; }
  async submitAnswer(id, questionId, response, requestId) {
    const key = `${id}/${requestId}`; if (this.inflight.has(key)) return this.inflight.get(key);
    const previous = this.memory.requests?.[key]; if (previous) { if (previous.fingerprint !== JSON.stringify([questionId, response])) throw new Error('REQUEST_CONFLICT'); return clone(previous.result); }
    const promise = Promise.resolve().then(() => {
      const s = this.requireSession(id), q = this.current(s, questionId); const result = evaluateStep(q, response);
      if (result.accepted) { s.feedbackIndex = q.index; if (result.final) s.currentIndex++; }
      const output = { ...clone(result), session: clone(s) };
      if (result.accepted) { this.memory.requests ||= {}; this.memory.requests[key] = { fingerprint: JSON.stringify([questionId, response]), result: clone(output) }; this.persist(); }
      return output;
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise); return promise;
  }
  async skipAnswer(id, questionId, requestId) {
    const key = `${id}/${requestId}`; if (this.inflight.has(key)) return this.inflight.get(key);
    const previous = this.memory.requests?.[key]; if (previous) { if (previous.fingerprint !== JSON.stringify([questionId, 'skip'])) throw new Error('REQUEST_CONFLICT'); return clone(previous.result); }
    const p = Promise.resolve().then(() => { const s = this.requireSession(id), q = this.current(s, questionId); const accepted = skipQuestion(q); if (accepted) { s.feedbackIndex = q.index; s.currentIndex++; } const output = { accepted, session: clone(s), item: clone(q) }; if (accepted) { this.memory.requests ||= {}; this.memory.requests[key] = { fingerprint: JSON.stringify([questionId, 'skip']), result: clone(output) }; this.persist(); } return output; }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p); return p;
  }
  async finishSession(id, reason = 'complete', requestId = crypto.randomUUID()) {
    const s = this.memory.session;
    if (!s || s.sessionId !== id) throw new Error('SESSION_NOT_ACTIVE');
    if (s.status === 'complete' || s.status === 'incomplete') { const result = { ...summarize(s), saveStatus: 'localOnly', rankStatus: 'excluded' }; return { result, saveStatus: 'localOnly', rankStatus: 'excluded' }; }
    s.status = reason === 'complete' && s.questions.every(q => q.status === 'answered') ? 'complete' : 'incomplete';
    s.finishedAt = new Date().toISOString(); const result = summarize(s); result.finishRequestId = requestId;
    const existing = this.memory.history.find(x => x.sessionId === id); if (!existing) this.memory.history.push(result);
    result.saveStatus = 'localOnly'; result.rankStatus = 'excluded';
    this.persist(); return { result, saveStatus: 'localOnly', rankStatus: 'excluded' };
  }
  async getLeaderboard(scope = 'global', seasonId = currentSeason()) {
    const rows = scope === 'class'
      ? [{ displayAlias: '우리 반 예시 별', score: 430, rank: 1, isMe: false }, { displayAlias: '나의 예시 자리', score: 410, rank: 2, isMe: true }, { displayAlias: '초록별 친구', score: 380, rank: 3, isMe: false }]
      : [{ displayAlias: '달빛 토끼', score: 490, rank: 1, isMe: false }, { displayAlias: '용감한 연필', score: 460, rank: 2, isMe: false }, { displayAlias: '나의 예시 자리', score: 420, rank: 3, isMe: true }];
    const visibleRows = this.memory.globalParticipation || scope === 'class' ? rows : rows.filter(r => !r.isMe);
    return { boardKey: `${GAME.gameId}:${GAME.rulesVersion}:${GAME.curriculumVersion}:${seasonId}:${scope}`, scope, entries: visibleRows.map(r => ({ ...r, displayAlias: `${r.displayAlias} · 예시` })), saveStatus: 'localOnly', rankStatus: 'example' };
  }
  async setGlobalParticipation(enabled) { this.memory.globalParticipation = Boolean(enabled); if (this.memory.session) this.memory.session.globalParticipation = Boolean(enabled); this.persist(); return { enabled: this.memory.globalParticipation, status: 'localOnly' }; }
  async joinClass(code, nickname = '') { if (!/^[A-Za-z0-9]{4,12}$/.test(code.trim())) return { status: 'invalid' }; this.memory.joined = true; this.memory.approved = false; const cleaned = String(nickname).normalize('NFC').trim().replace(/[\p{Cc}\p{Cf}]/gu, ''); this.memory.nickname = Array.from(cleaned).slice(0, 12).join(''); this.memory.classAlias = '초록별-27'; this.persist(); return { status: 'pending', classAlias: this.memory.classAlias, checkMark: '●●' }; }
  async approveDemo() { this.memory.approved = true; this.persist(); return { status: 'approved', classAlias: this.memory.classAlias }; }
  requireSession(id) { const s = this.memory.session; if (!s || s.sessionId !== id || s.status !== 'playing') throw new Error('SESSION_NOT_ACTIVE'); return s; }
  current(s, qid) { const q = s.questions[s.currentIndex]; if (!q || q.id !== qid) throw new Error('REVISION_CONFLICT'); return q; }
}
