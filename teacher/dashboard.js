const app = document.querySelector('#app');
const message = document.querySelector('#message');
const config = globalThis.MATH3_FIREBASE_CONFIG;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const todaySeason = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const dateLabel = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '기록 없음';
const empty = text => `<p class="empty">${escapeHtml(text)}</p>`;
const nameOf = s => s?.privateName || s?.classAlias || '이름 없음';
const typeNames = { add_three_small: '세 수 덧셈', subtract_three_small: '세 수 뺄셈', make_ten: '10 만들기', subtract_from_ten: '10에서 빼기', make_ten_then_add: '10 만들고 더하기' };
const state = { classes: [], selected: null, pending: [], students: [], sessions: [], board: [], season: todaySeason(), tab: 'home', studentId: null, sessionId: null, details: null, recoveryKey: '', ticket: null, busy: false, loadVersion: 0, error: '', google: null };
let call, auth, authSdk;

function say(text, error = false) {
  message.hidden = !text; message.textContent = text || ''; message.classList.toggle('error', error);
  if (text) message.scrollIntoView({ block: 'nearest' });
}
function errorText(error) {
  const code = String(error?.code || error?.message || '').split('/').at(-1).toUpperCase().replaceAll('-', '_');
  if (['CREDENTIAL_ALREADY_IN_USE','EMAIL_ALREADY_IN_USE','ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL','GOOGLE_ACCOUNT_CONFLICT'].includes(code)) return '이 Google 계정은 다른 관리 공간에 연결되어 있습니다. 현재 학급은 유지됩니다. 기존 관리 공간을 확인하거나 복구 키를 사용하세요.';
  if (code === 'GOOGLE_ACCOUNT_MISMATCH') return '기존에 연결한 Google 계정을 선택해 주세요. 계정 간 학급 이전은 자동으로 하지 않습니다.';
  if (code === 'OAUTH_STATE_INVALID' || code === 'OAUTH_CODE_REPLAY') return 'Google 승인 요청이 만료되었거나 이미 사용되었습니다. 이 화면의 Google 연결을 눌러 새 요청을 시작하고 10분 안에 승인해 주세요. 학급과 게임 기록은 그대로입니다.';
  if (code === 'REAUTH_REQUIRED') return 'Google 권한을 다시 승인해 주세요. 게임 기록은 정상 보관되어 있습니다.';
  if (code === 'GOOGLE_NOT_CONFIGURED' || code === 'OPERATION_NOT_ALLOWED') return 'Google 연동 설정이 준비되지 않았습니다. 기존 학급 기능은 계속 사용할 수 있습니다.';
  if (code === 'SHEET_CREATE_UNCERTAIN') return '관리표 생성 응답을 확인하지 못했습니다. 잠시 후 다시 시도하면 기존 문서를 검색합니다. 중복 생성을 막기 위해 새 문서는 추가로 만들지 않습니다.';
  if (code === 'SHEET_DUPLICATES') return '이 학급의 관리표가 여러 개 발견되었습니다. 파일을 삭제하지 않고 연결을 멈췄습니다. 운영자에게 확인해 주세요.';
  if (code === 'EXPORT_LIMIT') return '현재 내보내기 한도(학급당 회차·학생 각각 199개)를 넘었습니다. 기존 관리표는 유지되며 운영자의 용량 조정이 필요합니다.';
  if (code === 'SYNC_BUSY') return '동기화가 진행 중입니다. 잠시 후 다시 확인해 주세요.';
  if (code === 'GOOGLE_ACCESS_DENIED' || code === 'SHEET_UNAVAILABLE') return '관리표 접근 권한을 확인해 주세요. Google을 다시 연결해도 게임 기록은 유지됩니다.';
  if (code.startsWith('GOOGLE_')) return 'Google 연결 또는 동기화를 완료하지 못했습니다. 잠시 후 다시 시도하세요. 게임 기록은 정상 보관됩니다.';
  if (code.includes('FORBIDDEN') || code.includes('PERMISSION_DENIED')) return '이 관리 공간에 접근할 수 없습니다. 복구가 필요하면 복구 키를 사용하세요.';
  if (code.includes('AUTH') || code.includes('UNAUTHENTICATED')) return '인증이 만료되었습니다. 화면을 새로고침해 다시 연결하세요.';
  if (code.includes('RATE_LIMITED') || code.includes('RESOURCE_EXHAUSTED')) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
  if (code.includes('INVALID_NAME')) return '학급 이름을 확인해 주세요.';
  if (code.includes('NOT_FOUND')) return '해당 자료를 찾을 수 없습니다. 새로고침해 주세요.';
  if (code.includes('NETWORK') || code.includes('FETCH')) return '네트워크 연결을 확인하고 다시 시도하세요.';
  return '요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.';
}
function selectedClass() { return state.classes.find(c => c.classId === state.selected); }
function sessionsFor(id) { return state.sessions.filter(s => s.studentId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
function studentStats(id) {
  const sessions = sessionsFor(id), complete = sessions.filter(s => s.completion === 'complete');
  return { latest: sessions[0], best: complete.length ? Math.max(...complete.map(s => s.score)) : null };
}
function renderAuth() {
  app.innerHTML = `<div class="auth stack"><section class="card"><h2>교사 관리 공간</h2><p>이 브라우저의 익명 인증으로 관리 공간을 확인했습니다. 처음 사용한다면 새 공간을 만들고, 기존 공간으로 돌아오려면 복구 키를 입력하세요.</p><p class="muted small">브라우저 데이터가 지워지거나 기기를 바꾸면 복구 키가 필요합니다. 학급 참여 코드는 복구에 사용할 수 없습니다.</p></section><div class="auth-grid"><section class="card"><h3>새 교사</h3><p>새 관리 공간을 시작합니다.</p><button class="button" data-action="create-space">관리 공간 만들기</button></section><section class="card"><h3>기존 공간 복구</h3><form id="recover-space"><div class="field"><label for="recovery">복구 키</label><input id="recovery" type="password" autocomplete="off" required></div><button class="button secondary">관리 공간 되찾기</button></form></section></div></div>`;
  if (config.enableGoogleProvider) app.querySelector('.auth').insertAdjacentHTML('beforeend','<section class="card"><h3>Google을 연결했던 교사</h3><p>기존 Google 계정으로 관리 공간을 확인합니다.</p><button class="button secondary" data-action="google-signin">Google로 돌아오기</button></section>');
}
function renderSheets() {
  const g = state.google, sheet = g?.sheet;
  if (g?.unavailable) return `<section class="card" id="sheets-panel"><h3>선택 · Google Sheets</h3><p><strong>Google 연결 상태를 확인하지 못했습니다.</strong></p><p class="muted small">잠시 후 다시 확인해 주세요. 학급 관리와 게임 기록은 계속 사용할 수 있습니다.</p><button class="button secondary small" data-action="sheet-refresh">연결 상태 다시 확인</button></section>`;
  const status = !g?.configured ? 'Google 연동 준비 중' : g.reauthRequired ? 'Google 재인증 필요' : !g.connected ? '연결 안 됨' : !sheet ? '관리표 없음' : sheet.status === 'syncing' ? '동기화 중' : sheet.status === 'synced' ? '최근 동기화 완료' : sheet.status === 'failed' ? '동기화 실패' : '관리표 없음';
  const ready = g?.sheetsAvailable;
  return `<section class="card" id="sheets-panel"><h3>선택 · Google Sheets</h3><p><strong>${status}</strong></p><p class="muted small">Google 없이도 학급을 관리할 수 있습니다. 연결하면 별명 중심의 관리표를 만들고 완료 기록을 자동으로 내보냅니다. 관리표의 수정은 게임 기록에 반영되지 않습니다.</p>${!g?.connected || g?.reauthRequired ? `<button class="button secondary small" data-action="google-connect" ${g?.configured?'':'disabled'}>${g?.reauthRequired?'Google 다시 승인':'Google 연결'}</button>` : `<button class="button secondary small" data-action="google-disconnect">Google 연결 해제</button>`}${ready && state.selected ? `<p>${!sheet?.url ? '<button class="button small" data-action="sheet-create">이 학급 관리표 만들기</button>' : `<button class="button small" data-action="sheet-sync">지금 동기화</button> <a class="button secondary small" href="${escapeHtml(sheet.url)}" target="_blank" rel="noopener noreferrer">스프레드시트 열기 ↗</a>`}</p>`:''}${sheet?.lastSyncedAt?`<p class="muted small">최근 동기화: ${dateLabel(sheet.lastSyncedAt)}</p>`:''}${sheet?.errorCode?`<p class="small">${escapeHtml(errorText({code:sheet.errorCode}))}</p>`:''}</section>`;
}
async function refreshSheets() {
  const classId = state.selected;
  try { const g = config.workerApiOrigin ? await call('getGoogleConnectionStatus',classId?{classId}:{}) : {configured:false}; if(classId===state.selected)state.google=g; }
  catch { if(classId===state.selected)state.google={unavailable:true}; }
}
async function connectGoogle() {
  // Firebase identity linking preserves uid. Workspace consent remains a separate
  // server code flow, whose subject must match the verified Firebase provider.
  if (config.enableGoogleProvider && auth.currentUser.isAnonymous) {
    const uid = auth.currentUser.uid;
    await authSdk.linkWithPopup(auth.currentUser,new authSdk.GoogleAuthProvider());
    if(auth.currentUser.uid!==uid)throw Error('GOOGLE_ACCOUNT_MISMATCH');
    await auth.currentUser.getIdToken(true);
  }
  const result = await call('beginGoogleConnection',{});
  const launch = new URL(result.authorizationUrl);
  if(launch.origin!==new URL(config.workerApiOrigin).origin||launch.pathname!=='/oauth/google/start')throw Error('GOOGLE_CONNECTION_FAILED');
  location.assign(launch.href);
}
function recoveryNotice() {
  if (!state.recoveryKey) return '';
  return `<section class="notice" role="alert"><h3>새 복구 키를 지금 보관하세요</h3><p>이 키는 지금 한 번만 표시됩니다. 기기를 바꾸거나 브라우저 데이터를 지웠을 때 필요합니다. 복구에 사용하면 기존 키는 무효가 되고 새 키가 발급됩니다.</p><div class="key"><code>${escapeHtml(state.recoveryKey)}</code></div><p><button class="button secondary" data-action="hide-key">안전하게 보관했어요</button></p></section>`;
}
function renderShell() {
  const cls = selectedClass();
  const choices = state.classes.map(c => `<button class="class-choice" data-action="select-class" data-id="${escapeHtml(c.classId)}" aria-current="${c.classId === state.selected}">${escapeHtml(c.privateLabel)}<span>${c.joinEnabled ? '참여 열림' : '참여 닫힘'} · 전체 순위 ${c.globalOptIn ? '등록 중' : '등록 해제'}</span></button>`).join('');
  app.innerHTML = `${recoveryNotice()}<div class="layout"><aside class="card sidebar"><h2>내 학급</h2><div class="class-list">${choices || '<p class="muted">아직 학급이 없습니다.</p>'}</div><form id="create-class"><div class="field"><label for="class-label">비공개 학급 이름</label><input id="class-label" maxlength="12" required placeholder="예: 1학년 2반"></div><button class="button secondary">학급 만들기</button></form>${renderSheets()}</aside><div class="content">${cls ? renderClass(cls) : `<section class="card"><h2>첫 학급을 만들어 주세요</h2><p>왼쪽에서 학급을 만든 뒤 참여 코드를 학생에게 알려 주세요.</p></section>`}</div></div>`;
}
function renderClass(cls) {
  const tabs = [['home','한눈에 보기'],['pending',`승인 대기 ${state.pending.length}`],['students',`학생 ${state.students.length}`],['records','학생 기록'],['rank','학급 순위']];
  return `<div class="heading-row"><div><p class="muted small">현재 선택한 학급</p><h2>${escapeHtml(cls.privateLabel)}</h2></div><button class="button secondary small" data-action="refresh">새로고침</button></div><div class="summary"><div class="stat">참여 상태<strong>${cls.joinEnabled ? '열림' : '닫힘'}</strong></div><div class="stat">승인 학생<strong>${state.students.length}명</strong></div><div class="stat">승인 대기<strong>${state.pending.length}명</strong></div><div class="stat">완료 기록<strong>${state.sessions.filter(s=>s.completion==='complete').length}회</strong></div></div><div class="tabs" role="tablist" aria-label="학급 관리">${tabs.map(([id,label])=>`<button role="tab" class="tab" data-action="tab" data-tab="${id}" aria-selected="${state.tab===id}">${label}</button>`).join('')}</div><div role="tabpanel">${renderTab(cls)}</div>`;
}
function renderTab(cls) {
  if (state.tab === 'home') return `<div class="stack"><section class="card"><h3>학급 참여 코드</h3><p class="code">${escapeHtml(cls.code)}</p><p class="muted small">학생에게 이 코드를 알려 주고 신청 후 ‘승인 대기’에서 확인하세요. 교사 인증이나 복구에는 사용할 수 없습니다.</p><p>전체 순위 등록: <span class="pill ${cls.globalOptIn?'':'off'}">${cls.globalOptIn?'켜짐':'꺼짐'}</span> · 학생별 독립 별명을 사용하며 학급과 실제 이름은 공개되지 않습니다.</p><button class="button ${cls.globalOptIn?'danger':'secondary'}" data-action="class-global">전체 순위 등록 ${cls.globalOptIn?'해제':'복원'}</button></section><div class="two"><section class="card"><h3>지금 처리할 일</h3>${state.pending.length?`<p>승인 대기 학생 ${state.pending.length}명이 있습니다.</p><button class="button" data-action="tab" data-tab="pending">승인 대기 보기</button>`:empty('승인을 기다리는 학생이 없습니다.')}</section><section class="card"><h3>최근 게임 기록</h3>${recentRecords()}</section></div></div>`;
  if (state.tab === 'pending') return `<section class="card"><div class="heading-row"><h3>참여 신청</h3><button class="button secondary small" data-action="refresh">다시 확인</button></div>${state.pending.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>이름</th><th>별명</th><th>대조 표식</th><th>상태</th><th>작업</th></tr></thead><tbody>${state.pending.map(s=>`<tr><td>${escapeHtml(nameOf(s))}</td><td>${escapeHtml(s.classAlias)}</td><td>${escapeHtml(s.checkMark)}</td><td><span class="pill wait">승인 대기</span></td><td><button class="button small" data-action="approve" data-id="${escapeHtml(s.studentId)}">승인</button></td></tr>`).join('')}</tbody></table></div>` : empty('참여 신청을 기다리는 학생이 없습니다.')}</section>`;
  if (state.tab === 'students') return `<section class="card"><div class="heading-row"><h3>승인된 학생</h3><div class="field"><label for="student-search" class="visually-hidden">학생 찾기</label><input id="student-search" type="search" placeholder="이름 또는 별명 찾기" autocomplete="off"></div></div>${state.students.length?`<div class="table-wrap"><table class="data"><thead><tr><th>이름 / 별명</th><th>상태</th><th>최고 점수</th><th>최근 수행</th><th>전체 등록</th><th>작업</th></tr></thead><tbody id="student-rows">${state.students.map(s=>{const x=studentStats(s.studentId);return `<tr data-search="${escapeHtml(`${nameOf(s)} ${s.classAlias}`.toLowerCase())}"><td><strong>${escapeHtml(nameOf(s))}</strong><br><span class="muted small">${escapeHtml(s.classAlias)}</span></td><td><span class="pill">승인됨</span></td><td>${x.best===null?'—':`${x.best}점`}</td><td>${x.latest?dateLabel(x.latest.startedAt):'기록 없음'}</td><td>${s.globalOptIn?'켜짐':'꺼짐'}</td><td class="row-actions"><button class="button secondary small" data-action="student" data-id="${escapeHtml(s.studentId)}">기록 보기</button><button class="button secondary small" data-action="ticket" data-id="${escapeHtml(s.studentId)}">복귀 티켓</button></td></tr>`}).join('')}</tbody></table></div>`:empty('승인된 학생이 없습니다.')}</section>`;
  if (state.tab === 'records') return renderRecords();
  return renderRank(cls);
}
function recentRecords() {
  const rows=[...state.sessions].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,4);
  return rows.length?`<ul>${rows.map(s=>{const student=state.students.find(x=>x.studentId===s.studentId);return `<li>${escapeHtml(nameOf(student))} · ${s.score}점 · ${s.completion==='complete'?'완료':'미완료'} · ${dateLabel(s.startedAt)}</li>`}).join('')}</ul>`:empty('아직 게임 기록이 없습니다.');
}
function renderRecords() {
  const student=state.students.find(s=>s.studentId===state.studentId);
  const sessions=student?sessionsFor(student.studentId):[];
  const stats=student?studentStats(student.studentId):null;
  return `<div class="stack"><section class="card"><h3>학생별 1math3 기록</h3><div class="field"><label for="record-student">학생 선택</label><select id="record-student"><option value="">학생을 선택하세요</option>${state.students.map(s=>`<option value="${escapeHtml(s.studentId)}" ${s.studentId===state.studentId?'selected':''}>${escapeHtml(nameOf(s))} · ${escapeHtml(s.classAlias)}</option>`).join('')}</select></div>${student?`<p>최고 점수 <strong>${stats.best===null?'기록 없음':`${stats.best}점`}</strong> · 최근 점수 <strong>${stats.latest?`${stats.latest.score}점`:'기록 없음'}</strong></p>`:''}</section>${student?`<div class="two"><section class="card"><h3>회차 목록</h3>${sessions.length?`<div class="record-list">${sessions.map((s,i)=>`<button class="record" data-action="session" data-id="${escapeHtml(s.sessionId)}" aria-current="${s.sessionId===state.sessionId}"><strong>${i+1}번째 기록 · ${s.score}점 · ${s.completion==='complete'?'완료':'미완료'}</strong><br>${dateLabel(s.startedAt)} · 정답 ${s.correct} · 오답 ${s.wrong} · 건너뜀 ${s.skipped}</button>`).join('')}</div>`:empty('아직 기록이 없습니다.')}</section><section class="card" id="session-detail">${renderDetails()}</section></div>`:''}</div>`;
}
function promptOf(a) {
  const [x,y,z]=a.operands||[];
  switch(a.typeId){
    case 'make_ten': return a.subtype==='a+blank=10'?`${x} + □ = 10`:a.subtype==='blank+a=10'?`□ + ${x} = 10`:a.subtype==='10=a+blank'?`10 = ${x} + □`:`10 = □ + ${x}`;
    case 'subtract_from_ten': return a.subtype==='result_blank'?`10 − ${y} = □`:`10 − □ = ${10-a.answer}`;
    case 'add_three_small': return `${x} + ${y} + ${z} = □`;
    case 'subtract_three_small': return `${x} − ${y} − ${z} = □`;
    default: return `${x} + ${y} + ${z} = □`;
  }
}
function responseOf(a) {
  if(a.skipped) return '건너뜀';
  if(a.typeId==='make_ten_then_add'){
    const pair=a.firstResponse?.pair?.value;
    const chosen=Array.isArray(pair)?pair.map(i=>`${i+1}번 카드(${a.operands?.[i] ?? '?'})`).join(' + '):'선택 기록 없음';
    const sum=a.firstResponse?.sum?.value;
    return `카드쌍: ${chosen} · 최종 답: ${sum ?? '미입력'}`;
  }
  return String(a.firstResponse?.answer ?? '응답 기록 없음');
}
function renderDetails() {
  const d=state.details;
  if(!state.sessionId) return empty('회차를 선택하면 문항별 풀이를 볼 수 있습니다.');
  if(!d) return '<p class="loading">회차를 불러오는 중…</p>';
  return `<h3>문항별 상세</h3><p><strong>${d.result.score}점</strong> · ${d.result.completion==='complete'?'완료':'미완료'} · 정답 ${d.result.correct} · 오답 ${d.result.wrong} · 건너뜀 ${d.result.skipped} · 미응답 ${d.result.unanswered}</p><div class="detail-list">${d.answers.map(a=>`<article class="question"><strong>${a.index+1}번 · ${escapeHtml(typeNames[a.typeId]||a.typeId)} · ${a.skipped?'건너뜀':a.firstCorrect?'정답':'오답'}</strong><div>${escapeHtml(promptOf(a))}</div><div>첫 응답: ${escapeHtml(responseOf(a))}</div><div>정답: ${escapeHtml(a.answer)}</div></article>`).join('')}</div>${d.result.unanswered?`<p class="muted">미응답 ${d.result.unanswered}문항은 풀이 기록이 없습니다.</p>`:''}`;
}
function renderRank(cls) {
  return `<div class="stack"><section class="card"><h3>학급 순위</h3><div class="field"><label for="season">월 선택</label><input id="season" type="month" value="${escapeHtml(state.season)}"></div><p class="muted small">1math3 정규 완료 회차의 월별 학생 최고 점수입니다. 같은 점수는 공동 순위입니다.</p>${state.board.length?`<div class="table-wrap"><table class="data"><thead><tr><th>순위</th><th>학급 별명</th><th>최고 점수</th></tr></thead><tbody>${state.board.map(e=>`<tr><td>${e.rank}위</td><td>${escapeHtml(e.displayAlias)}</td><td>${e.score}점</td></tr>`).join('')}</tbody></table></div>`:empty('이 달에 완료한 학생 기록이 없습니다.')}</section><section class="card"><h3>전체 순위 공개 설정</h3><p>현재 이 학급의 등록은 <strong>${cls.globalOptIn?'켜짐':'꺼짐'}</strong>입니다. 전체 순위에는 독립 별명과 점수만 표시됩니다.</p><button class="button ${cls.globalOptIn?'danger':'secondary'}" data-action="class-global">전체 순위 등록 ${cls.globalOptIn?'해제':'복원'}</button></section></div>`;
}
async function refreshClasses(preferred) {
  const classes=(await call('listClasses',{})).classes;
  state.classes=classes;
  state.selected=classes.some(c=>c.classId===preferred)?preferred:classes.some(c=>c.classId===state.selected)?state.selected:classes[0]?.classId||null;
  if(state.selected) await loadClass(); else { await refreshSheets(); renderShell(); }
}
async function loadClass() {
  const id=state.selected, version=++state.loadVersion;
  app.innerHTML='<p class="loading">학급 자료를 불러오는 중…</p>';
  const [pending,students,sessions,board]=await Promise.all([
    call('listPendingStudents',{classId:id}),call('listClassStudents',{classId:id}),
    call('listClassSessions',{classId:id,gameId:'1math3'}),call('getTeacherLeaderboard',{classId:id,seasonId:state.season}),refreshSheets()
  ]);
  if(version!==state.loadVersion||id!==state.selected)return;
  state.pending=pending.students;state.students=students.students;state.sessions=sessions.sessions;state.board=board.entries;
  if(!state.students.some(s=>s.studentId===state.studentId)){state.studentId=null;state.sessionId=null;state.details=null;}
  renderShell();
}
async function work(fn, success) {
  if(state.busy)return;
  state.busy=true; document.querySelectorAll('button').forEach(b=>b.disabled=true);say('');
  try{await fn();if(success)say(success);}catch(error){say(errorText(error),true);}
  finally{state.busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);const connect=app.querySelector('[data-action="google-connect"]');if(connect&&!state.google?.configured)connect.disabled=true;}
}
async function initialize() {
  if(!config?.apiKey||!config?.projectId){app.innerHTML=empty('Firebase 연결 설정을 확인해 주세요.');return;}
  try {
    const v='12.19.0';
    const [appSdk,aSdk,fnSdk]=await Promise.all(['app','auth',config.workerApiOrigin?null:'functions'].map(x=>x?import(`https://www.gstatic.com/firebasejs/${v}/firebase-${x}.js`):null));
    authSdk=aSdk;
    const firebaseApp=appSdk.initializeApp(config,'math3-teacher');auth=aSdk.getAuth(firebaseApp);
    const fn=fnSdk?.getFunctions(firebaseApp,config.region||'asia-northeast3');
    if(config.emulators){aSdk.connectAuthEmulator(auth,`http://${config.emulators.host||'127.0.0.1'}:${config.emulators.auth||9099}`,{disableWarnings:true});if(fnSdk)fnSdk.connectFunctionsEmulator(fn,config.emulators.host||'127.0.0.1',config.emulators.functions||5001);}
    await aSdk.setPersistence(auth,aSdk.browserLocalPersistence);
    if(!auth.currentUser)await aSdk.signInAnonymously(auth);
    call=async(name,data)=>{
      if(!config.workerApiOrigin)return(await fnSdk.httpsCallable(fn,name)(data)).data;
      const endpoint=new URL(`${config.workerApiOrigin.replace(/\/$/,'')}/api/${name}`);
      if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['localhost','127.0.0.1'].includes(endpoint.hostname)))throw Error('INVALID_WORKER_URL');
      const token=await auth.currentUser.getIdToken();
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({data})});
      const result=await response.json();
      if(!response.ok){const error=new Error(result.error?.code||'NETWORK_UNAVAILABLE');error.code=result.error?.code;throw error;}
      return result.result;
    };
    try{await refreshClasses();
      const outcome=/^#sheets=([A-Z_]+|connected)$/.exec(location.hash)?.[1];
      if(outcome){history.replaceState(null,'',location.pathname+location.search);say(outcome==='connected'?'Google 연결이 완료되었습니다. 학급 관리표를 만들 수 있습니다.':errorText({code:outcome}),outcome!=='connected');}
    }catch(error){
      const code=String(error.code||error.message||'').toUpperCase().replaceAll('-', '_');
      if(code.includes('FORBIDDEN')||code.includes('PERMISSION_DENIED'))renderAuth();
      else{app.innerHTML='<section class="card"><h2>연결을 확인할 수 없습니다</h2><button class="button" data-action="retry-init">다시 시도</button></section>';say(errorText(error),true);}
    }
  }catch(error){app.innerHTML='<section class="card"><h2>인증 연결 실패</h2><button class="button" data-action="retry-init">다시 시도</button></section>';say(errorText(error),true);}
}

app.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;
  if(form.id==='create-class')work(async()=>{const label=form.querySelector('#class-label').value.trim();const c=await call('createClass',{privateLabel:label,requestId:crypto.randomUUID()});state.tab='home';await refreshClasses(c.classId);},'새 학급을 만들었습니다.');
  if(form.id==='recover-space')work(async()=>{const key=form.querySelector('#recovery').value.trim();const result=await call('recoverTeacherSpace',{recoveryKey:key,requestId:crypto.randomUUID()});form.reset();state.recoveryKey=result.recoveryKey;await refreshClasses();},'관리 공간을 복구했습니다. 새 복구 키를 보관하세요.');
});
app.addEventListener('input',event=>{if(event.target.id==='student-search'){const q=event.target.value.trim().toLowerCase();document.querySelectorAll('#student-rows tr').forEach(row=>row.hidden=!row.dataset.search.includes(q));}});
app.addEventListener('change',event=>{
  if(event.target.id==='record-student'){state.studentId=event.target.value||null;state.sessionId=null;state.details=null;renderShell();}
  if(event.target.id==='season'&&/^20\d\d-(0[1-9]|1[0-2])$/.test(event.target.value)){state.season=event.target.value;work(async()=>{const result=await call('getTeacherLeaderboard',{classId:state.selected,seasonId:state.season});state.board=result.entries;renderShell();});}
});
app.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||state.busy)return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='google-connect')work(connectGoogle);
  if(action==='google-signin')work(async()=>{await authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider());await refreshClasses();});
  if(action==='sheet-create'||action==='sheet-sync')work(async()=>{
    const classId=state.selected;
    state.google={...state.google,sheet:{...state.google.sheet,status:'syncing'}};renderShell();
    try{await call(action==='sheet-create'?'createOrSelectSheet':'syncSheet',{classId});}
    finally{await refreshSheets();renderShell();}
  },'학급 관리표 동기화를 완료했습니다.');
    if(action==='sheet-refresh')work(async()=>{await refreshSheets();renderShell();});
    if(action==='google-disconnect'){
    if(!confirm('Google 자동 동기화를 중지할까요? 학습 기록과 Drive에 이미 만든 관리표는 남습니다.'))return;
    work(async()=>{const result=await call('disconnectSheets',{});await refreshSheets();renderShell();say(result.revocationPending?'앱 연결을 해제했습니다. Google 서버의 취소 응답을 확인하지 못했으므로 Google 계정의 앱 접근 권한에서도 연결을 취소해 주세요.':'Google 연결을 해제했습니다.');});
  }
  if(action==='retry-init'){app.innerHTML='<p class="loading">다시 연결하는 중…</p>';initialize();return;}
  if(action==='create-space')work(async()=>{const result=await call('createTeacherSpace',{requestId:crypto.randomUUID()});state.recoveryKey=result.recoveryKey||'';await refreshClasses();},'관리 공간을 만들었습니다. 복구 키를 보관하세요.');
  if(action==='hide-key'){state.recoveryKey='';renderShell();}
  if(action==='select-class'){state.selected=id;state.tab='home';state.studentId=null;state.sessionId=null;state.details=null;work(()=>loadClass());}
  if(action==='refresh')work(async()=>{await refreshClasses(state.selected);},'학급 자료를 새로 읽었습니다.');
  if(action==='tab'){state.tab=button.dataset.tab;work(()=>loadClass());}
  if(action==='approve')work(async()=>{const classId=state.selected;await call('approveStudent',{classId,studentId:id});const [pending,students]=await Promise.all([call('listPendingStudents',{classId}),call('listClassStudents',{classId})]);if(classId===state.selected){state.pending=pending.students;state.students=students.students;renderShell();}},'학생을 승인했습니다.');
  if(action==='student'){state.studentId=id;state.sessionId=null;state.details=null;state.tab='records';renderShell();}
  if(action==='session')work(async()=>{const classId=state.selected;state.sessionId=id;state.details=null;renderShell();const result=await call('getSessionDetails',{classId,sessionId:id});if(classId===state.selected&&id===state.sessionId){state.details=result;renderShell();}});
  if(action==='class-global'){
    const cls=selectedClass(),enabled=!cls.globalOptIn;
    if(!confirm(enabled?`${cls.privateLabel}의 기존 최고 기록을 전체 순위에 다시 등록할까요?`:`${cls.privateLabel}의 전체 순위 등록을 해제하고 공개된 기록을 제거할까요?`))return;
    work(async()=>{await call('setClassGlobalParticipation',{classId:cls.classId,enabled});await refreshClasses(cls.classId);},enabled?'전체 순위 등록을 복원했습니다.':'전체 순위 등록을 해제했습니다.');
  }
  if(action==='ticket'){
    const student=state.students.find(s=>s.studentId===id);if(!student||!confirm(`${nameOf(student)} 학생의 10분 유효 일회용 복귀 티켓을 발급할까요?`))return;
    work(async()=>{const result=await call('issueStudentReturnTicket',{classId:state.selected,studentId:id});state.ticket=result.ticket;const holder=document.createElement('section');holder.className='notice';holder.setAttribute('role','alert');holder.innerHTML=`<h3>${escapeHtml(nameOf(student))} 학생 복귀 티켓</h3><p>10분 동안 한 번만 사용할 수 있습니다. 학생의 1math3 화면에서 ‘복귀’에 입력하세요.</p><div class="key"><code>${escapeHtml(result.ticket)}</code></div><button class="button secondary small" data-action="hide-ticket">닫기</button>`;document.querySelector('.content').prepend(holder);},'복귀 티켓을 발급했습니다.');
  }
  if(action==='hide-ticket'){button.closest('.notice')?.remove();state.ticket=null;}
});
initialize();
setInterval(async()=>{
  if(!state.classes.length||state.busy||(!state.google?.connected&&!state.google?.unavailable))return;
  await refreshSheets();
  const panel=document.querySelector('#sheets-panel');if(panel&&!state.busy)panel.outerHTML=renderSheets();
},30000);
