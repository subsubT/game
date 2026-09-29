import { GAME, questionExplanation, summarize } from '../games/1math3/core.js';
import { MockGameService } from '../services/mock-game-service.js';
import { FirebaseGameService } from '../services/firebase-game-service.js';

const live = Boolean(globalThis.MATH3_FIREBASE_CONFIG?.apiKey && globalThis.MATH3_FIREBASE_CONFIG?.projectId);
const service = live ? new FirebaseGameService() : new MockGameService();
const root = document.querySelector('#app');
const ui = { view: 'home', tab: 'global', draft: '', selected: [], busy: false, sound: false, error: '', board: null };
let session = service.memory.session;
if (session?.status === 'playing') {
  const pending = session.questions[session.feedbackIndex];
  if (pending?.status === 'answered') ui.view = 'feedback';
  else if (pending?.step === 'sum' && pending.firstResponse?.pair) ui.view = 'pairFeedback';
  else ui.view = 'playing';
}
else if (session?.status === 'complete' || session?.status === 'incomplete') ui.view = 'result';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const btn = (label, action, cls = 'button') => `<button type="button" class="${cls}" data-action="${action}">${label}</button>`;
const titleType = id => ({ add_three_small: '세 수 더하기', subtract_three_small: '세 수 빼기', make_ten: '10 만들기', subtract_from_ten: '10에서 빼기', make_ten_then_add: '10을 만들고 더하기' })[id] || id;
const currentSeason = () => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${parts.find(x => x.type === 'year').value}-${parts.find(x => x.type === 'month').value}`; };
const active = () => session?.questions[session.currentIndex];
const summary = () => session?.result || summarize(session);

function render() {
  if (ui.view === 'home') root.innerHTML = homeView();
  else if (ui.view === 'join') root.innerHTML = joinView();
  else if (ui.view === 'intro') root.innerHTML = introView();
  else if (ui.view === 'playing') root.innerHTML = gameView();
  else if (ui.view === 'pairFeedback') root.innerHTML = pairFeedbackView();
  else if (ui.view === 'feedback') root.innerHTML = feedbackView();
  else if (ui.view === 'pause') root.innerHTML = pauseView();
  else if (ui.view === 'skipConfirm' || ui.view === 'quitConfirm') root.innerHTML = confirmView();
  else if (ui.view === 'result') root.innerHTML = resultView();
  else if (ui.view === 'review') root.innerHTML = reviewView();
  document.querySelector('.topbar').inert = ui.view === 'skipConfirm' || ui.view === 'quitConfirm';
  document.querySelector('footer').inert = ui.view === 'skipConfirm' || ui.view === 'quitConfirm';
  requestAnimationFrame(() => {
    const focus = root.querySelector('[autofocus]') || root.querySelector('[role="alertdialog"] button') || (ui.refocus ? root.querySelector(ui.refocus) : null);
    if (focus) focus.focus(); else { const heading = root.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus(); } }
    ui.refocus = null;
    if (focus && focus.matches('input')) focus.setSelectionRange?.(focus.value.length, focus.value.length);
  });
}

function homeView() {
  const joined = service.memory.approved;
  const rankText = live ? '서버에서 확정된 기록만 보여 줍니다.' : '모두 예시 별명과 예시 점수예요. 실제 학생 기록이 아니에요.';
  const settingText = live ? '설정은 서버에 저장돼요.' : '지금 설정은 모의예요.';
  return `<section class="panel hero"><div class="hero-star" aria-hidden="true">🌟</div><div class="eyebrow">1학년 2학기 수학 · 2단원</div><h1>수학 별 모으기</h1><p>덧셈과 뺄셈 문제를 풀고<br>별을 차곡차곡 모아 보아요.</p><div class="summary-grid"><div class="summary-item"><strong>50문항</strong>천천히 풀어요</div><div class="summary-item"><strong>5가지</strong>수학 놀이</div><div class="summary-item"><strong>쉬는 시간</strong>10문제마다 있어요</div></div><div class="actions">${btn('혼자 연습 시작하기', 'practice')} ${btn(joined ? '기록 도전 시작' : '학급 참여하기', joined ? 'record' : 'join', 'button secondary')}</div><p class="micro muted">시간 제한이 없어요. 연습 기록은 공식 순위에 올라가지 않아요.</p></section>
  <section class="panel"><div class="panel-title"><div><h2>친구들 순위</h2><p class="muted">${rankText}</p></div><span class="pill">전체 순위 기본 공개</span></div>${rankTabs()}<div id="rank-content">${rankContent()}</div><label class="toggle-label"><input type="checkbox" data-global-toggle ${service.memory.globalParticipation ? 'checked' : ''} ${live && !service.memory.approved ? 'disabled' : ''}><span>전체 순위에 내 최고 기록 등록 허용<br><span class="micro muted">현재 ${service.memory.globalParticipation ? '켜짐' : '꺼짐'} · 기본값은 켜짐. 꺼도 순위 조회는 할 수 있어요. ${settingText}</span></span></label><div class="notice micro">전체 순위에는 학급과 분리된 별명과 최고점만 보입니다.</div>${live ? `<div class="actions">${btn('학생 바꾸기', 'switch-student', 'button light')}</div>` : ''}</section>`;
}
function rankTabs() { return `<div class="tabs" role="tablist" aria-label="순위 범위"><button class="tab" type="button" role="tab" aria-selected="${ui.tab === 'class'}" data-action="tab-class">우리 반 순위</button><button class="tab" type="button" role="tab" aria-selected="${ui.tab === 'global'}" data-action="tab-global">전체 순위</button></div>`; }
function rankContent() {
  if (!ui.board) return `<p class="muted">${esc(ui.boardError || '순위를 불러오는 중…')}</p>`;
  const season = ui.board.boardKey.split(':')[3] || currentSeason();
  return `<p class="pill">1math3 · ${season} · ${live ? '확정 기록' : '예시 데이터'}</p><div>${ui.board.entries.length ? ui.board.entries.map(r => `<div class="rank-row ${r.isMe ? 'me' : ''}"><strong>${r.rank}위</strong><span>${esc(r.displayAlias)}${r.isMe ? ' (나)' : ''}</span><span>${r.score}점</span></div>`).join('') : '<p class="muted">아직 순위 기록이 없어요.</p>'}</div>`;
}
async function loadBoard() { try { ui.board = await service.getLeaderboard(ui.tab, ui.view === 'result' && session?.seasonId ? session.seasonId : currentSeason()); ui.boardError = ''; } catch { ui.board = null; ui.boardError = ui.tab === 'class' && !service.memory.approved ? '우리 반 순위는 선생님 승인 후 볼 수 있어요.' : '순위를 불러오지 못했어요. 다시 눌러 주세요.'; } if (ui.view === 'home' || ui.view === 'result') render(); }

function joinView() {
  const state = service.memory.joined ? (service.memory.approved ? 'approved' : 'pending') : 'new';
  return `<section class="panel"><div class="eyebrow">학급 참여${live ? '' : ' · 모의 체험'}</div><h1>우리 반과 함께할까요?</h1><p class="muted">참여 코드를 선생님에게 받아 적어요. ${live ? '선생님이 대조 표식을 확인한 뒤 승인하면 기록 도전을 시작할 수 있어요.' : '아래 참여와 승인은 모두 예시예요. 이 모의 화면은 실제 학급이나 학생 정보를 저장하지 않아요.'}</p>
  ${state === 'new' ? `<label class="input-label" for="join-code">학급 참여 코드</label><input id="join-code" class="text-input" maxlength="12" autocomplete="off" placeholder="8자리 코드"><label class="input-label" for="nickname">선생님께 보일 이름 (선택)</label><input id="nickname" class="text-input" maxlength="12" autocomplete="off" placeholder="이름 없이 참여할 수 있어요"><p id="join-error" class="error" role="status">${esc(ui.error)}</p><div class="actions">${btn('참여 신청하기', 'join-submit')} ${btn('처음으로', 'home', 'button light')}</div>${live ? `<hr><label class="input-label" for="return-ticket">선생님에게 받은 일회용 복귀 코드</label><input id="return-ticket" class="text-input" autocomplete="off" maxlength="80"><div class="actions">${btn('내 기록 이어받기', 'redeem-ticket', 'button secondary')}</div>` : ''}` : `<div class="notice"><strong>${state === 'pending' ? '승인을 기다리고 있어요.' : `우리 반 별명: ${esc(service.memory.classAlias)}`}</strong><br>${state === 'pending' ? `대조 표식 ${esc(service.memory.checkMark || '')} · 승인 전에는 혼자 연습만 할 수 있어요.` : live ? '선생님이 승인했어요.' : '선생님이 확인한 모의 참여 상태예요.'}</div><p class="error" role="status">${esc(ui.error)}</p><div class="actions">${state === 'pending' ? (live ? btn('승인 상태 다시 확인', 'refresh-status', 'button secondary') : btn('선생님 승인 체험', 'approve-demo', 'button secondary')) : btn('기록 도전 계속', 'record')} ${btn('혼자 연습하기', 'practice', 'button light')} ${btn('처음으로', 'home', 'button light')}</div>`}</section>`;
}
function introView() {
  const regular = ui.mode === 'regular';
  const publicNotice = regular
    ? '<strong>전체 순위 등록 기본값은 켜짐이에요.</strong><br>등록을 켜면 정규 회차를 끝냈을 때 학급과 분리된 별명으로 전체 순위에 들어갈 수 있어요. 순위 조회는 등록을 꺼도 가능해요.'
    : '<strong>혼자 연습한 결과는 순위에 포함되지 않아요.</strong><br>전체 순위 등록 설정은 다음 기록 도전을 위한 선택이에요.';
  return `<section class="panel"><div class="eyebrow">${regular ? `우리 반 · ${esc(service.memory.classAlias)}` : '혼자 연습'}</div><h1>${regular ? '기록 도전 준비!' : '연습 준비!'}</h1><p>5가지 문제를 10문제씩, 모두 50문제 풀어요.<br>정답은 별 1개와 10점이에요. 틀려도 괜찮아요!</p><div class="notice warn">${publicNotice}${live ? '' : '<br>지금은 모의 설정이라 실제 순위에는 저장되지 않아요.'}</div><label class="toggle-label" style="margin-top:18px"><input type="checkbox" id="global-setting" ${service.memory.globalParticipation ? 'checked' : ''} ${live && !regular ? 'disabled' : ''}><span>전체 순위에 내 최고 기록 등록 허용<br><span class="micro muted">현재 ${service.memory.globalParticipation ? '켜짐' : '꺼짐'} · 처음 기본값은 켜짐, 언제든 바꿀 수 있어요</span></span></label><p class="micro muted">10문제마다 쉬어갈 수 있어요. 시간 제한은 없어요. 먼저 확정한 답이 점수에 반영돼요.</p><p class="error" role="status">${esc(ui.error)}</p><div class="actions">${btn('시작하기', 'start-now')} ${btn('그만두기', 'home', 'button light')}</div></section>`;
}
function problemText(q) {
  if (q.prompt) return q.prompt;
  const [a, b, c] = q.operands;
  switch (q.typeId) {
    case 'add_three_small': return q.subtype.startsWith('objects') ? `바구니에 사과 ${a}개, 배 ${b}개, 귤 ${c}개가 있어요. 모두 몇 개일까요?` : `${a} + ${b} + ${c} = □`;
    case 'subtract_three_small': return q.subtype.startsWith('objects') ? `구슬 ${a}개에서 ${b}개를 쓰고 ${c}개를 더 썼어요. 몇 개 남았나요?` : `${a} − ${b} − ${c} = □`;
    case 'make_ten': {
      const f = q.subtype; if (f === 'a+blank=10') return `${a} + □ = 10`; if (f === 'blank+a=10') return `□ + ${a} = 10`; if (f === '10=a+blank') return `10 = ${a} + □`; return `10 = □ + ${a}`;
    }
    case 'subtract_from_ten': return q.subtype === 'result_blank' ? `10 − ${b} = □` : `10 − □ = ${10 - q.answer}`;
    case 'make_ten_then_add': return `${a} + ${b} + ${c} = ?`;
  }
}
function visual(q) {
  if (q.visual === 'groups') return `<div class="visual" aria-label="${q.operands.join(', ')}개씩 세 묶음">${q.operands.map((n, i) => `<div class="group" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<span class="counter ${i === 1 ? 'alt' : ''}">${i === 0 ? '🍎' : i === 1 ? '🍐' : '🍊'}</span>`).join('')}</div>`).join('<span class="operator" aria-hidden="true">+</span>')}</div>`;
  if (q.visual === 'take-away') { const answer = q.operands[0] - q.operands[1] - q.operands[2]; return `<div class="visual" aria-label="처음 ${q.operands[0]}개에서 ${q.operands[1]}개와 ${q.operands[2]}개를 빼면 ${answer}개가 남아요">${Array.from({ length: q.operands[0] }, (_, i) => `<span class="counter ${i >= answer ? 'alt' : ''}">${i >= answer ? '⊘' : '🔵'}</span>`).join('')}<span class="operator">→</span><span class="counter">남은 수 ${answer}</span></div>`; }
  if (q.visual === 'ten-frame') {
    let full = q.typeId === 'make_ten' ? q.operands[0] : 10;
    if (q.typeId === 'subtract_from_ten' && q.subtype === 'result_blank') full = 10 - q.operands[1];
    return `<div class="tenframe" role="img" aria-label="십 배열판, ${full}칸을 채웠어요">${Array.from({ length: 10 }, (_, i) => `<span class="ten-cell ${i < full ? 'filled' : 'empty'}">${i < full ? '●' : '□'}</span>`).join('')}</div>`;
  }
  if (q.step === 'sum') { const rest = [0,1,2].find(i => !q.selectedPair?.includes(i)); return `<div class="visual story" aria-label="${q.operands[q.selectedPair[0]]} 더하기 ${q.operands[q.selectedPair[1]]}는 10, 남은 수 ${q.operands[rest]}"><span>고른 두 카드 ${q.operands[q.selectedPair[0]]} + ${q.operands[q.selectedPair[1]]} = 10</span><span class="operator">+</span><span>남은 카드 ${q.operands[rest]}</span></div>`; }
  return `<p class="story">고를 수 있는 카드가 세 장 있어요.<br>10이 되는 두 장을 골라 보세요.</p>`;
}
function gameView() {
  const q = active(); if (!q) return '<section class="panel">문제를 불러오지 못했어요.</section>';
  const count = q.index + 1, pair = q.typeId === 'make_ten_then_add' && q.step === 'pair';
  return `<section class="panel"><div class="progress-wrap"><div><div class="question-head"><span class="pill">${q.round}라운드 · ${titleType(q.typeId)}</span><span class="star-count" aria-label="별 ${summary().stars}개">⭐ ${summary().stars} / 50</span></div><div class="progress" role="progressbar" aria-label="전체 진행" aria-valuemin="0" aria-valuemax="50" aria-valuenow="${count}"><span style="width:${count * 2}%"></span></div></div><strong>${count} / 50</strong></div>
  <h1 class="problem" id="problem">${esc(problemText(q))}</h1>${visual(q)}
  ${pair ? `<p class="story">10이 되는 두 카드를 골라 보세요.</p><div class="card-row" role="group" aria-label="카드 두 장 선택하기">${q.operands.map((n, i) => `<button type="button" class="card-choice" data-action="card" data-index="${i}" aria-pressed="${ui.selected.includes(i)}" aria-label="${i + 1}번 카드 ${n}">${n}<span class="sr-only">번</span></button>`).join('')}</div><p class="micro muted" style="text-align:center">같은 숫자 카드도 카드 위치를 보고 선택해요. 선택 ${ui.selected.length}/2</p>${btn('고른 카드 확인', 'submit-pair')}<p class="error" role="status">${esc(ui.error)}</p>` : `<div class="${q.typeId === 'make_ten_then_add' ? 'story' : 'sr-only'}">${q.typeId === 'make_ten_then_add' ? '이제 세 수의 합을 입력해요.' : ''}</div><div class="answer-row"><span class="operator" aria-hidden="true">내 답</span><div id="answer-display" class="number-display" role="status" aria-label="입력한 답">${esc(ui.draft || '□')}</div><span class="operator" aria-hidden="true">개</span></div><div class="keypad" role="group" aria-label="숫자 키패드">${['1','2','3','4','5','6','7','8','9','지우기','0','확인'].map(v => `<button type="button" class="key" data-action="${v === '지우기' ? 'clear' : v === '확인' ? 'submit-number' : 'digit'}" ${v === '지우기' || v === '확인' ? '' : `data-value="${v}"`}>${v}</button>`).join('')}</div><p class="error" role="status">${esc(ui.error)}</p>`}
  <div class="actions">${btn('문제 건너뛰기', 'skip', 'button light')} ${btn('게임 그만하기', 'quit', 'button danger')}</div></section>`;
}
function feedbackView() {
  const q = session.questions[session.feedbackIndex ?? session.currentIndex - 1]; const correct = q?.firstCorrect;
  if (!q) { ui.view = 'playing'; return gameView(); }
  const explanation = q.explanation || (q.typeId === 'make_ten_then_add' && !q.firstResponse?.pair?.correct ? `10이 되는 카드 위치는 ${q.validPairs.map(p => `${p[0] + 1}번과 ${p[1] + 1}번`).join(' 또는 ')}예요. 세 수의 합은 ${q.answer}예요.` : questionExplanation(q));
  return `<section class="panel"><div class="eyebrow">${q.index + 1}번 문제 · 첫 답 기록 완료</div><h1>${q.skipped ? '건너뛰었어요.' : correct ? '맞았어요! 별 하나!' : '괜찮아요, 함께 확인해요.'}</h1><div class="problem">${esc(problemText(q))}</div><div class="feedback ${correct ? 'correct' : 'incorrect'}"><strong>${q.skipped ? '이 문제는 0점이에요.' : correct ? `정답이에요! ${q.earnedPoints}점` : `정답은 ${q.answer}예요.`}</strong><br>${esc(explanation)}</div><p class="notice micro">처음 답한 결과는 그대로예요. 나중에 복습으로 다시 맞혀도 원래 점수는 바뀌지 않아요.</p><p class="error" role="status">${esc(ui.error)}</p><div class="actions">${btn(q.index === 49 ? '결과 보기' : '다음 문제', 'next-question')}</div></section>`;
}
function pairFeedbackView() {
  const q = session.questions[session.currentIndex]; const ok = q.firstResponse?.pair?.correct;
  return `<section class="panel"><div class="eyebrow">10 만들고 더하기 · 첫 단계</div><h1>${ok ? '좋은 짝을 골랐어요!' : '다른 짝도 10이 돼요.'}</h1><p class="story">${q.operands.map((n, i) => `${i + 1}번 ${n}`).join(' · ')}</p><div class="feedback ${ok ? 'correct' : 'incorrect'}">${ok ? '고른 두 카드의 합이 10이에요.' : `10이 되는 카드 위치: ${q.validPairs.map(p => `${p[0] + 1}번과 ${p[1] + 1}번`).join(' 또는 ')}예요.`}<br>이 문항은 카드 짝과 합을 모두 처음 맞혀야 별을 받아요.</div><div class="actions">${btn('이제 합을 입력할게요', 'continue-sum')}</div></section>`;
}
function pauseView() {
  const s = summary(), n = session.currentIndex;
  return `<section class="panel pause"><div class="hero-star">🌈</div><div class="eyebrow">잠깐 쉬어가도 좋아요</div><h1>${n}문제를 풀었어요!</h1><p class="pause-count">⭐ ${s.stars}개 모았어요</p><p>물도 마시고 손을 쭉 펴 보세요.<br>쉬지 않고 계속해도 괜찮아요.</p><div class="actions">${btn('계속 풀기', 'continue-game')} ${btn('여기서 그만하기', 'quit', 'button light')}</div></section>`;
}
function confirmView() {
  const skip = ui.view === 'skipConfirm';
  return `<div class="modal-overlay"><section class="panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><div class="eyebrow">확인해 주세요</div><h1 id="confirm-title">${skip ? '이 문제를 건너뛸까요?' : '게임을 그만할까요?'}</h1><p id="confirm-description">${skip ? '이 문제는 0점으로 기록되고 정답 풀이를 볼 수 있어요.' : '지금까지 답한 내용만 저장하고 미완료 회차로 남아요. 순위에는 들어가지 않아요.'}</p><p class="error" role="status">${esc(ui.error)}</p><div class="actions"><button type="button" class="button" data-action="${skip ? 'confirm-skip' : 'confirm-quit'}" autofocus>${skip ? '건너뛰기 확정' : '여기까지 기록하기'}</button>${btn('계속 풀기', 'cancel-confirm', 'button light')}</div></section></div>`;
}
function resultView() {
  const s = summary(), complete = session.status === 'complete';
  const official = live && session.mode === 'regular';
  const saveNotice = official ? `<strong>서버 저장 ${s.saveStatus === 'confirmed' ? '완료' : '확인 중'}</strong> · ${complete ? '50문항 완료' : '직접 종료한 미완료 회차'} · ${s.rankStatus === 'ready' ? '순위 반영 완료' : '순위 제외'}` : '<strong>연습용 모의 저장</strong> · 브라우저에 임시 보관했어요. 공식 순위에는 포함되지 않아요.';
  return `<section class="panel"><div class="hero-star">${complete ? '🎉' : '🌱'}</div><div class="eyebrow">${complete ? '50문항을 끝까지 풀었어요!' : '이번 게임은 여기까지예요.'}</div><h1>${complete ? '참 잘했어요!' : '수고했어요!'}</h1><p class="problem">${s.score}점 <span style="font-size:24px">/ 500점</span></p><div class="stats"><div class="stat"><strong>⭐ ${s.stars}</strong>별</div><div class="stat"><strong>${s.correct}</strong>처음 정답</div><div class="stat"><strong>${s.wrong}</strong>처음 오답</div><div class="stat"><strong>${s.skipped}</strong>건너뜀</div><div class="stat"><strong>${s.unanswered}</strong>미응답</div></div><p class="notice warn">${saveNotice}</p><div class="actions">${btn('틀린 문제 복습', 'review', 'button secondary')} ${btn('다시 도전하기', 'retry')} ${btn('처음 화면', 'home', 'button light')}</div></section><section class="panel"><h2>순위 확인</h2><p class="muted">${official ? '서버 확정 기록의 최고점만 표시해요.' : '연습 기록은 순위에 반영되지 않아요.'}</p>${rankTabs()}<div>${rankContent()}</div><label class="toggle-label"><input type="checkbox" data-global-toggle ${service.memory.globalParticipation ? 'checked' : ''} ${live && !service.memory.approved ? 'disabled' : ''}><span>전체 순위에 내 최고 기록 등록 허용<br><span class="micro muted">현재 ${service.memory.globalParticipation ? '켜짐' : '꺼짐'} · 기본값은 켜짐. 꺼도 순위 조회는 할 수 있어요.</span></span></label></section>`;
}
function reviewView() {
  const wrong = session.questions.filter(q => q.status === 'answered' && !q.firstCorrect);
  return `<section class="panel"><div class="eyebrow">내 문제만 다시 보기</div><h1>복습</h1><p class="notice">복습으로 다시 맞혀도 처음 점수와 별은 바뀌지 않아요.</p>${wrong.length ? wrong.map(q => `<article class="review-row"><strong>${q.index + 1}번</strong><span>${esc(problemText(q))}<br><span class="muted micro">${titleType(q.typeId)} · ${q.skipped ? '건너뜀' : `처음 답 ${esc(q.firstResponse?.answer ?? q.firstResponse?.sum?.value ?? '')}`}</span></span><span class="review-answer">정답 ${q.answer}<br><span class="micro">${esc(q.explanation || questionExplanation(q))}</span></span></article>`).join('') : '<p>복습할 오답이 없어요. 멋져요!</p>'}<div class="actions">${btn('다시 도전하기', 'retry')} ${btn('결과로 돌아가기', 'result', 'button light')}</div></section>`;
}
root.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]'); if (!b || ui.busy) return;
  const action = b.dataset.action;
  if (action === 'digit') { ui.refocus = `[data-action="digit"][data-value="${b.dataset.value}"]`; ui.draft = (ui.draft + b.dataset.value).slice(0, 2); ui.error = ''; render(); }
  else if (action === 'clear') { ui.refocus = '[data-action="clear"]'; ui.draft = ''; ui.error = ''; render(); }
  else if (action === 'card') { const i = Number(b.dataset.index); ui.refocus = `[data-action="card"][data-index="${i}"]`; ui.selected = ui.selected.includes(i) ? ui.selected.filter(x => x !== i) : ui.selected.length < 2 ? [...ui.selected, i] : ui.selected; render(); }
  else if (action === 'tab-class' || action === 'tab-global') { ui.refocus = `[data-action="${action}"]`; ui.tab = action.endsWith('class') ? 'class' : 'global'; ui.board = null; await loadBoard(); }
  else if (action === 'home') { ui.view = 'home'; ui.error = ''; render(); loadBoard(); }
  else if (action === 'join') { ui.view = 'join'; ui.error = ''; render(); }
  else if (action === 'join-submit') {
    const code = root.querySelector('#join-code').value, nickname = root.querySelector('#nickname').value.trim();
    ui.busy = true; try { const result = await service.joinClass(code, nickname); if (result.status !== 'pending') ui.error = '참여 코드를 확인해 주세요.'; else ui.error = ''; }
    catch { ui.error = '참여 신청을 확인하지 못했어요. 다시 시도해 주세요.'; }
    finally { ui.busy = false; render(); }
  }
  else if (action === 'approve-demo') { await service.approveDemo(); render(); }
  else if (action === 'redeem-ticket') { ui.busy = true; try { await service.redeemTicket(root.querySelector('#return-ticket').value.trim()); ui.error = ''; } catch { ui.error = '복귀 코드를 확인하지 못했어요. 선생님께 새 코드를 받아 주세요.'; } finally { ui.busy = false; render(); } }
  else if (action === 'refresh-status') { ui.busy = true; try { await service.refreshStatus(); ui.error = ''; } catch { ui.error = '승인 상태를 확인하지 못했어요.'; } finally { ui.busy = false; render(); } }
  else if (action === 'switch-student') { ui.busy = true; try { await service.switchStudent(); session = null; ui.view = 'home'; ui.board = null; ui.error = ''; } catch { ui.error = '학생 바꾸기를 완료하지 못했어요. 네트워크를 확인해 주세요.'; } finally { ui.busy = false; render(); loadBoard(); } }
  else if (action === 'practice' || action === 'record') { ui.mode = action === 'record' ? 'regular' : 'practice'; ui.view = 'intro'; render(); }
  else if (action === 'start-now') {
    ui.busy = true; try { if (ui.mode === 'regular') await service.setGlobalParticipation(root.querySelector('#global-setting').checked); session = await service.startSession(GAME.gameId, { mode: ui.mode }); ui.draft = ''; ui.view = session.status === 'playing' ? 'playing' : 'result'; ui.error = ''; } catch { ui.error = '시작 상태를 확인하지 못했어요. 다시 시도해 주세요.'; } finally { ui.busy = false; render(); }
  }
  else if (action === 'submit-number') await submit(ui.draft);
  else if (action === 'submit-pair') {
    if (ui.selected.length !== 2) { ui.error = '카드 두 장을 골라 주세요.'; render(); return; }
    ui.busy = true; try { const q = active(); const res = await service.submitAnswer(session.sessionId, q.id, ui.selected, crypto.randomUUID()); session = res.session; session.feedbackIndex = q.index; ui.view = 'pairFeedback'; ui.selected = []; ui.error = ''; } catch { ui.error = '저장 중 문제가 생겼어요. 다시 눌러 주세요.'; } finally { ui.busy = false; render(); }
  }
  else if (action === 'continue-sum') { ui.view = 'playing'; ui.draft = ''; render(); }
  else if (action === 'skip') { ui.view = 'skipConfirm'; render(); }
  else if (action === 'next-question') {
    const q = session.questions[session.feedbackIndex ?? session.currentIndex - 1]; if (q?.index === 49) { ui.busy = true; try { await service.finishSession(session.sessionId, 'complete'); session = service.memory.session; ui.view = 'result'; } catch { ui.error = '결과 저장을 확인하지 못했어요. 다시 눌러 주세요.'; } finally { ui.busy = false; ui.board = null; render(); loadBoard(); } }
    else if (q && q.index % 10 === 9) { ui.view = 'pause'; render(); }
    else { ui.draft = ''; ui.error = ''; ui.view = 'playing'; render(); }
  }
  else if (action === 'continue-game') { ui.view = 'playing'; ui.draft = ''; render(); }
  else if (action === 'quit') { ui.view = 'quitConfirm'; render(); }
  else if (action === 'retry') { ui.busy = true; try { session = await service.startSession(GAME.gameId, { mode: session.mode, restart: true, seed: Math.floor(Math.random() * 0xffffffff) }); ui.view = 'playing'; ui.draft = ''; ui.selected = []; ui.error = ''; } catch { ui.error = '다시 시작하지 못했어요.'; } finally { ui.busy = false; render(); } }
  else if (action === 'review') { ui.view = 'review'; render(); }
  else if (action === 'result') { ui.view = 'result'; render(); }
  else if (action === 'cancel-confirm') { ui.view = 'playing'; render(); }
  else if (action === 'confirm-skip') { ui.busy = true; try { const q = active(); const res = await service.skipAnswer(session.sessionId, q.id, crypto.randomUUID()); session = res.session; ui.view = 'feedback'; } catch { ui.error = '저장 상태를 확인하지 못했어요. 다시 눌러 주세요.'; } finally { ui.busy = false; render(); } }
  else if (action === 'confirm-quit') { ui.busy = true; try { await service.finishSession(session.sessionId, 'quit'); session = service.memory.session; ui.view = 'result'; } catch { ui.error = '종료 상태를 확인하지 못했어요. 다시 눌러 주세요.'; } finally { ui.busy = false; render(); } }
});

root.addEventListener('change', async e => {
  if (e.target.matches('[data-global-toggle]')) { ui.refocus = '[data-global-toggle]'; await service.setGlobalParticipation(e.target.checked); ui.board = null; await loadBoard(); }
  if (e.target.id === 'global-setting') { await service.setGlobalParticipation(e.target.checked); const text = e.target.closest('.toggle-label')?.querySelector('.micro'); if (text) text.textContent = `현재 ${e.target.checked ? '켜짐' : '꺼짐'} · 처음 기본값은 켜짐, 언제든 바꿀 수 있어요`; }
});

async function submit(value) {
  if (ui.busy) return; ui.busy = true;
  try {
    const q = active(), res = await service.submitAnswer(session.sessionId, q.id, value, crypto.randomUUID());
    if (!res.accepted) { ui.error = res.reason === 'INVALID_NUMBER' ? '0~19 사이 숫자로 입력해 주세요.' : '이미 답을 확정한 문제예요.'; }
    else if (res.final) { session = res.session; session.feedbackIndex = q.index; ui.view = 'feedback'; ui.draft = ''; ui.error = ''; if (res.correct) playTone(); }
  } catch { ui.error = '답을 확인하지 못했어요. 같은 답으로 다시 시도해 주세요.'; }
  finally { ui.busy = false; render(); }
}

document.addEventListener('keydown', e => {
  if ((ui.view === 'skipConfirm' || ui.view === 'quitConfirm') && e.key === 'Escape') { e.preventDefault(); ui.view = 'playing'; render(); return; }
  if ((ui.view === 'skipConfirm' || ui.view === 'quitConfirm') && e.key === 'Tab') {
    const buttons = [...root.querySelectorAll('[role="alertdialog"] button:not([disabled])')], first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  const q = active();
  if (ui.view === 'playing' && (q?.typeId !== 'make_ten_then_add' || q?.step === 'sum')) {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); if (ui.draft.length < 2) ui.draft += e.key; ui.error = ''; render(); }
    else if (e.key === 'Backspace') { e.preventDefault(); ui.draft = ui.draft.slice(0, -1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(ui.draft); }
  }
});

document.querySelector('#sound-toggle').addEventListener('click', e => { ui.sound = !ui.sound; e.currentTarget.setAttribute('aria-pressed', String(ui.sound)); e.currentTarget.textContent = ui.sound ? '🔔 소리 켬' : '🔕 소리 끔'; });
function playTone() { if (!ui.sound) return; try { const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = 660; gain.gain.value = .035; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .1); oscillator.onended = () => context.close(); } catch {} }
render();
if (live) service.ready.then(() => { session = service.memory.session; if (session?.status === 'playing') { const pending = session.questions[session.feedbackIndex]; ui.view = pending?.status === 'answered' ? 'feedback' : session.questions[session.currentIndex]?.step === 'sum' ? 'pairFeedback' : 'playing'; } else if (session?.status === 'complete' || session?.status === 'incomplete') ui.view = 'result'; render(); loadBoard(); }).catch(() => { ui.boardError = 'Firebase 연결을 확인하지 못했어요. 설정과 네트워크를 확인해 주세요.'; render(); });
else loadBoard();
