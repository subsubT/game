import { GAME } from '../games/1math3/core.js';
import { GameService, MockGameService } from './mock-game-service.js';
import { defaultProgressUI } from '../games/session-progress.js';

const SESSION_KEY = '1math3.firebase.session';
const REQUEST_KEY = '1math3.firebase.requests';
const sdkVersion = '12.19.0';
const url = name => `https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-${name}.js`;

export class FirebaseGameService extends GameService {
  constructor(config = globalThis.MATH3_FIREBASE_CONFIG, storage = globalThis.localStorage) {
    super();
    if (!config?.apiKey || !config?.projectId || !config?.appId) throw new Error('Firebase config is missing');
    this.config = config; this.storage = storage; this.practice = new MockGameService(storage);
    this.memory = { joined: false, approved: false, globalParticipation: true, session: this.practice.memory.session, classAlias: '' };
    this.pending = JSON.parse(storage?.getItem(REQUEST_KEY) || '{}');
    this.ready = this.initialize();
  }
  async initialize() {
    const [appSdk, authSdk, functionsSdk] = await Promise.all([import(url('app')), import(url('auth')), this.config.workerApiOrigin ? null : import(url('functions'))]);
    this.authSdk = authSdk; this.functionsSdk = functionsSdk;
    const app = appSdk.initializeApp(this.config, 'math3-student');
    this.auth = authSdk.getAuth(app); this.functions = functionsSdk?.getFunctions(app, this.config.region || 'asia-northeast3');
    if (this.config.emulators) {
      authSdk.connectAuthEmulator(this.auth, `http://${this.config.emulators.host || '127.0.0.1'}:${this.config.emulators.auth || 9099}`, { disableWarnings: true });
      if (functionsSdk) functionsSdk.connectFunctionsEmulator(this.functions, this.config.emulators.host || '127.0.0.1', this.config.emulators.functions || 5001);
    }
    await this.auth.authStateReady();
    if (!this.auth.currentUser) await authSdk.signInAnonymously(this.auth);
    const status = await this.invoke('getStudentStatus', {});
    this.updateStatus(status);
    if (!this.memory.approved) this.storage?.removeItem(SESSION_KEY);
    else { try { await this.recoverPending(); await this.refreshGamesInternal(); } catch { this.memory.gameLoadError = true; this.memory.session = null; } }
    return this;
  }
  updateStatus(status) {
    this.memory.joined = status.status !== 'new'; this.memory.approved = status.status === 'approved';
    this.memory.classAlias = status.classAlias || ''; this.memory.checkMark = status.checkMark || '';
    this.memory.privateName = status.privateName || '';
    this.memory.pinRequired = status.status === 'pin-required';
    if (status.globalParticipation !== undefined) this.memory.globalParticipation = status.globalParticipation;
    return status;
  }
  async invoke(name, data) {
    if (this.config.workerApiOrigin) {
      const endpoint = new URL(`${this.config.workerApiOrigin.replace(/\/$/, '')}/api/${name}`);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('INVALID_WORKER_URL');
      const token = await this.auth.currentUser.getIdToken();
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data }), ...(['getFinalStage','startFinalStage','saveFinalStage','submitFinalAnswer'].includes(name)?{signal:AbortSignal.timeout(20000)}:{}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || result.error?.code || 'NETWORK_UNAVAILABLE');
      return result.result;
    }
    const callable = this.functionsSdk.httpsCallable(this.functions, name);
    try { return (await callable(data)).data; }
    catch (error) { throw new Error(error?.message || 'NETWORK_UNAVAILABLE'); }
  }
  async call(name, data) { await this.ready; return this.invoke(name, data); }
  async recoverPending(sessionId = null, discardConflicts = false) {
    for (const [key, entry] of Object.entries(this.pending)) {
      const name = key.startsWith('final:') ? key.split(':')[1] : key.startsWith('answer:') || key.startsWith('skip:') ? 'submitAnswer' : key.startsWith('save:') ? 'saveSession' : key.startsWith('resume:') ? 'resumeSession' : null;
      if (!name) continue;
      const data = JSON.parse(entry.body); if (sessionId && data.sessionId !== sessionId) continue;
      let result;
      try { result = await this.invoke(name, { ...data, requestId: entry.requestId }); }
      catch (error) {
        if (!discardConflicts || !['REVISION_CONFLICT','INVALID_PROGRESS','SESSION_PAUSED','SESSION_NOT_ACTIVE'].includes(error.message)) throw error;
        delete this.pending[key]; this.storage?.setItem(REQUEST_KEY, JSON.stringify(this.pending)); continue;
      }
      if (result.session) this.remember(result.session); else if (name === 'resumeSession') this.remember(result);
      delete this.pending[key]; this.storage?.setItem(REQUEST_KEY, JSON.stringify(this.pending));
    }
  }
  async refreshGamesInternal() {
    const result = await this.invoke('getStudentGames', {catalogVersion:2}); this.memory.games = result.games; this.memory.gameLoadError = false;
    const active = result.games.find(g => g.gameId === GAME.gameId)?.activeSession;
    this.memory.regularSession = active || null;
    if (active) this.remember(active);
    return result;
  }
  async getGames(discardConflicts = false) { await this.ready; await this.recoverPending(null, discardConflicts); return this.refreshGamesInternal(); }
  async finalRequest(name, sessionId, extra = {}) {
    await this.ready;
    const result = name === 'getFinalStage' ? await this.invoke(name,{sessionId}) : await this.mutation(name,{sessionId,expectedRevision:this.memory.session.finalStage.revision,...extra},`final:${name}:${sessionId}:${extra.questionId||''}`);
    if(this.memory.session?.sessionId===sessionId){this.memory.session.finalStage=result.finalStage;const r=this.memory.session.result;if(r)r.totalScore=r.score+(result.finalStage.status==='complete'?result.finalStage.score:0);}
    return result.finalStage;
  }
  async mutation(name, data, key) {
    await this.ready;
    const body = JSON.stringify(data), old = this.pending[key];
    if (old) {
      const previous = JSON.parse(old.body), current = { ...data };
      delete previous.expectedRevision; delete current.expectedRevision;
      if (JSON.stringify(previous) !== JSON.stringify(current)) throw new Error('REQUEST_CONFLICT');
    }
    const requestId = old?.requestId || crypto.randomUUID();
    if (!old) { this.pending[key] = { body, requestId }; this.storage?.setItem(REQUEST_KEY, JSON.stringify(this.pending)); }
    const result = await this.invoke(name, { ...(old ? JSON.parse(old.body) : data), requestId });
    delete this.pending[key]; this.storage?.setItem(REQUEST_KEY, JSON.stringify(this.pending));
    return result;
  }
  remember(session) { this.memory.session = session; if (session?.mode === 'regular') this.storage?.setItem(SESSION_KEY, session.sessionId); return session; }
  async refreshStatus() { return this.updateStatus(await this.call('getStudentStatus', {})); }
  async joinClass(code, nickname = '', pin, pinConfirm) {
    // PINs must never enter the persisted offline mutation queue.
    const result = await this.call('requestJoin', { code, privateName: nickname, pin, pinConfirm, requestId: crypto.randomUUID() });
    this.updateStatus(result); return result;
  }
  async getLoginRoster(code) { return this.call('getClassLoginRoster', { code }); }
  clearLocalInputs() { for (const key of Object.keys(this.storage || {})) if (key.startsWith('1math3.input.')) this.storage.removeItem(key); }
  async loginPin(grant, studentId, pin) {
    const result = await this.call('loginStudentPin', { grant, studentId, pin, requestId: crypto.randomUUID() });
    this.storage?.removeItem(SESSION_KEY); this.storage?.removeItem(REQUEST_KEY);
    this.clearLocalInputs();
    this.pending = {}; this.memory.session = null; this.memory.games = []; this.memory.regularSession = null;
    this.pinSetupId = null;
    this.updateStatus(result); return result;
  }
  async setPin(pin, pinConfirm) {
    await this.ready;
    // Retain only a non-secret request ID when a response is lost. A retry
    // with a different PIN must not be reported as having saved that PIN.
    this.pinSetupId ||= crypto.randomUUID();
    const result = await this.invoke('setStudentPin', { pin, pinConfirm, requestId: this.pinSetupId });
    this.pinSetupId = null;
    this.updateStatus(result); return result;
  }
  async redeemTicket(ticket) {
    const result = await this.mutation('redeemStudentReturnTicket', { ticket }, 'redeem-ticket');
    this.pinSetupId = null;
    this.updateStatus(result); return result;
  }
  async startSession(gameId, { mode = 'regular', restart = false } = {}) {
    if (mode === 'practice') return this.remember(await this.practice.startSession(gameId, { mode, restart }));
    const key = `start:${gameId}:${this.memory.session?.sessionId || 'first'}`;
    const result = await this.mutation('startSession', { gameId, mode }, key);
    return this.remember(result);
  }
  async saveSession(id, uiState) {
    if (this.memory.session?.mode === 'practice') return this.remember(await this.practice.saveSession(id, uiState));
    await this.ready;
    const before = this.memory.session?.revision;
    const hadSave = Boolean(this.pending[`save:${id}`]);
    await this.recoverPending(id);
    if (hadSave) return this.memory.session;
    if (before !== this.memory.session?.revision) uiState = defaultProgressUI(this.memory.session);
    const result = await this.mutation('saveSession', { sessionId: id, expectedRevision: this.memory.session.revision, uiState }, `save:${id}`);
    return this.remember(result.session);
  }
  async resumeSession(id) {
    if (this.memory.session?.mode === 'practice') return this.remember(await this.practice.resumeSession(id));
    await this.ready; await this.recoverPending(id);
    const fresh = await this.invoke('getSession', { sessionId: id }); this.remember(fresh);
    if (fresh.status !== 'playing' || fresh.progressState !== 'paused') return fresh;
    return this.remember(await this.mutation('resumeSession', { sessionId: id, expectedRevision: fresh.revision }, `resume:${id}`));
  }
  async getSession(id) {
    await this.ready;
    if (this.memory.session?.mode === 'practice') return this.practice.getSession(id);
    return this.remember(await this.invoke('getSession', { sessionId: id }));
  }
  async submitAnswer(id, questionId, response) {
    if (this.memory.session?.mode === 'practice') { const result = await this.practice.submitAnswer(id, questionId, response, crypto.randomUUID()); this.remember(result.session); return result; }
    const revision = this.memory.session?.revision;
    const key = `answer:${id}:${questionId}:${Array.isArray(response) ? 'pair' : 'number'}`;
    const result = await this.mutation('submitAnswer', { sessionId: id, questionId, response, expectedRevision: revision }, key);
    if (result.session) this.remember(result.session); return result;
  }
  async skipAnswer(id, questionId) {
    if (this.memory.session?.mode === 'practice') { const result = await this.practice.skipAnswer(id, questionId, crypto.randomUUID()); this.remember(result.session); return result; }
    const key = `skip:${id}:${questionId}`;
    const result = await this.mutation('submitAnswer', { sessionId: id, questionId, skip: true, expectedRevision: this.memory.session?.revision }, key);
    if (result.session) this.remember(result.session); return result;
  }
  async finishSession(id, reason = 'complete') {
    if (this.memory.session?.mode === 'practice') { const result = await this.practice.finishSession(id, reason); this.remember(await this.practice.getSession(id)); return result; }
    const result = await this.mutation('finishSession', { sessionId: id, reason }, `finish:${id}`);
    this.remember(await this.invoke('getSession', { sessionId: id })); return result;
  }
  async getLeaderboard(scope = 'global', seasonId) {
    return this.call('getLeaderboard', { gameId: GAME.gameId, rulesVersion: GAME.rulesVersion, curriculumVersion: GAME.curriculumVersion, seasonId, scope });
  }
  async setGlobalParticipation(enabled) {
    if (!this.memory.approved) { this.memory.globalParticipation = Boolean(enabled); return { enabled, status: 'pending' }; }
    const result = await this.call('setGlobalParticipation', { enabled: Boolean(enabled) });
    this.memory.globalParticipation = result.enabled; return result;
  }
  async switchStudent() {
    await this.ready;
    if (this.memory.joined) await this.invoke('detachStudentDevice', {});
    await this.authSdk.signOut(this.auth);
    this.storage?.removeItem(SESSION_KEY); this.storage?.removeItem(REQUEST_KEY);
    this.storage?.removeItem('1math3.mock.v1');
    this.clearLocalInputs();
    this.pending = {}; this.memory = { joined: false, approved: false, globalParticipation: true, session: null, classAlias: '' };
    this.pinSetupId = null;
    this.practice = new MockGameService(this.storage);
    await this.authSdk.signInAnonymously(this.auth);
  }
}
