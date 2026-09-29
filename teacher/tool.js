const root = document.querySelector('#tool');
const config = globalThis.MATH3_FIREBASE_CONFIG;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
if (!config?.apiKey || !config?.projectId) root.textContent = 'firebase-config.js에 개발 프로젝트 설정을 입력해 주세요.';
else {
  const version = '12.19.0';
  const [appSdk, authSdk, fnSdk] = await Promise.all(['app', 'auth', config.workerApiOrigin ? null : 'functions'].map(x => x ? import(`https://www.gstatic.com/firebasejs/${version}/firebase-${x}.js`) : null));
  const app = appSdk.initializeApp(config, 'math3-teacher');
  const auth = authSdk.getAuth(app), fn = fnSdk?.getFunctions(app, config.region || 'asia-northeast3');
  if (config.emulators) {
    authSdk.connectAuthEmulator(auth, `http://${config.emulators.host || '127.0.0.1'}:${config.emulators.auth || 9099}`, { disableWarnings: true });
    if (fnSdk) fnSdk.connectFunctionsEmulator(fn, config.emulators.host || '127.0.0.1', config.emulators.functions || 5001);
  }
  await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
  if (!auth.currentUser) await authSdk.signInAnonymously(auth);
  const call = async (name, data) => {
    if (!config.workerApiOrigin) return (await fnSdk.httpsCallable(fn, name)(data)).data;
    const endpoint = new URL(`${config.workerApiOrigin.replace(/\/$/, '')}/api/${name}`);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('INVALID_WORKER_URL');
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || result.error?.code || 'NETWORK_UNAVAILABLE');
    return result.result;
  };
  const state = { classes: [], recoveryKey: '', error: '', hasSpace: false };
  async function refresh() {
    try { state.classes = (await call('listClasses', {})).classes; state.hasSpace = true; state.error = ''; }
    catch { state.classes = []; state.hasSpace = false; }
    render();
  }
  function render() {
    root.innerHTML = `<p class="error" role="alert">${esc(state.error)}</p>${state.hasSpace ? `<section><h2>새 학급</h2><form id="create-class"><label class="input-label" for="label">비공개 학급 이름</label><input class="text-input" id="label" maxlength="12" required><button class="button" type="submit">학급 만들기</button></form></section>` : `<p>관리 공간을 만들거나 복구 키로 되찾으세요.</p><button class="button" data-action="create-space">관리 공간 만들기</button><form id="recover-space"><label class="input-label" for="recovery">복구 키</label><input class="text-input" id="recovery" autocomplete="off" required><button class="button secondary" type="submit">관리 공간 되찾기</button></form>`}
      ${state.recoveryKey ? `<div class="notice warn"><strong>복구 키를 지금 안전하게 보관하세요.</strong><p class="micro">이 화면을 떠나면 다시 볼 수 없습니다.</p><code style="overflow-wrap:anywhere">${esc(state.recoveryKey)}</code><div><button class="button light" data-action="hide-key">보관했어요</button></div></div>` : ''}
      ${state.classes.map(c => `<section class="panel"><h2>${esc(c.privateLabel)}</h2><p>참여 코드 <strong>${esc(c.code)}</strong> · 전체 순위 기본 공개 ${c.globalOptIn ? '켜짐' : '꺼짐'}</p><button class="button secondary" data-action="pending" data-class="${esc(c.classId)}">대기 학생 확인</button><button class="button light" data-action="roster" data-class="${esc(c.classId)}">승인 학생·복귀 코드</button><button class="button light" data-action="class-global" data-class="${esc(c.classId)}" data-enabled="${!c.globalOptIn}">전체 순위 등록 ${c.globalOptIn ? '끄기' : '켜기'}</button><div id="pending-${esc(c.classId)}"></div><div id="roster-${esc(c.classId)}"></div></section>`).join('')}`;
  }
  root.addEventListener('click', async e => {
    const button = e.target.closest('[data-action]'); if (!button) return;
    button.disabled = true;
    try {
      if (button.dataset.action === 'create-space') { const result = await call('createTeacherSpace', { requestId: crypto.randomUUID() }); state.recoveryKey = result.recoveryKey || ''; await refresh(); }
      if (button.dataset.action === 'hide-key') { state.recoveryKey = ''; render(); }
      if (button.dataset.action === 'class-global') { await call('setClassGlobalParticipation', { classId: button.dataset.class, enabled: button.dataset.enabled === 'true' }); await refresh(); }
      if (button.dataset.action === 'pending') {
        const classId = button.dataset.class, students = (await call('listPendingStudents', { classId })).students;
        const target = document.getElementById(`pending-${classId}`);
        target.innerHTML = students.length ? students.map(s => `<p>${esc(s.privateName || '이름 없음')} · 별명 ${esc(s.classAlias)} · 대조 표식 <strong>${esc(s.checkMark)}</strong> <button class="button light" data-action="approve" data-class="${esc(classId)}" data-student="${esc(s.studentId)}">승인</button></p>`).join('') : '<p>대기 중인 학생이 없습니다.</p>';
      }
      if (button.dataset.action === 'roster') {
        const classId = button.dataset.class, students = (await call('listClassStudents', { classId })).students;
        const target = document.getElementById(`roster-${classId}`);
        target.innerHTML = students.length ? students.map(s => `<p>${esc(s.privateName || '이름 없음')} · ${esc(s.classAlias)} · 표식 ${esc(s.checkMark)} <button class="button light" data-action="ticket" data-class="${esc(classId)}" data-student="${esc(s.studentId)}">복귀 코드 발급</button></p>`).join('') : '<p>승인된 학생이 없습니다.</p>';
      }
      if (button.dataset.action === 'approve') { await call('approveStudent', { classId: button.dataset.class, studentId: button.dataset.student }); button.parentElement.textContent = '승인 완료'; }
      if (button.dataset.action === 'ticket') { const result = await call('issueStudentReturnTicket', { classId: button.dataset.class, studentId: button.dataset.student }); button.parentElement.innerHTML = `10분 유효 · 한 번만 사용: <code>${esc(result.ticket)}</code>`; }
    } catch (error) { state.error = error.message || '요청 실패'; render(); }
    finally { button.disabled = false; }
  });
  root.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      if (e.target.id === 'create-class') { await call('createClass', { privateLabel: document.querySelector('#label').value, requestId: crypto.randomUUID() }); await refresh(); }
      if (e.target.id === 'recover-space') { const result = await call('recoverTeacherSpace', { recoveryKey: document.querySelector('#recovery').value, requestId: crypto.randomUUID() }); state.recoveryKey = result.recoveryKey; await refresh(); }
    } catch (error) { state.error = error.message || '요청 실패'; render(); }
  });
  await refresh();
}
