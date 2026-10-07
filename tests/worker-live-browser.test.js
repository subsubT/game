import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const origin = 'https://subsubt.github.io';
const published = process.env.MATH3_PAGES_TEST === '1';
const site = origin + (published ? '/game' : '');

test('live Firebase and Worker teacher-to-student browser flow', { skip: process.env.MATH3_LIVE_TEST !== '1', timeout: 900000 }, async () => {
  const serveLocal = async route => {
    try {
      const path = resolve(root, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
      if (!path.startsWith(root)) throw Error('outside root');
      const body = await readFile(path);
      await route.fulfill({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  };
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const teacher = await browser.newContext(), student = await browser.newContext();
  if (!published) {
    await teacher.route(`${origin}/**`, serveLocal);
    await student.route(`${origin}/**`, serveLocal);
  }
  const t = await teacher.newPage(), s = await student.newPage();
  const errors = [];
  for (const page of [t, s]) page.on('pageerror', error => errors.push(error.message));
  try {
    await t.goto(`${site}/teacher/index.html`);
    await t.getByRole('button', { name: '관리 공간 만들기' }).waitFor({ timeout: 30000 });
    await t.getByRole('button', { name: '관리 공간 만들기' }).click();
    const recoveryKey = await t.locator('.notice .key code').textContent();
    await t.getByLabel('비공개 학급 이름').fill('CP5공개검증반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.locator('.code').waitFor();
    const code = (await t.locator('.code').textContent()).trim();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    await t.getByText('연결 안 됨', {exact:true}).waitFor();
    await t.getByLabel('비공개 학급 이름').fill('CP5격리검증반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.getByRole('button', { name: /CP5공개검증반/ }).click();
    await t.locator('.code').getByText(code).waitFor();

    await s.goto(`${site}/1math3.html`);
    await s.getByRole('button', { name: '학급 참여하기' }).click();
    await s.getByLabel('학급 참여 코드').fill(code);
    await s.getByRole('button', { name: '참여 신청하기' }).click();
    await s.getByText('승인을 기다리고 있어요.').waitFor();
    await t.getByRole('button', { name: '새로고침' }).click();
    await t.getByRole('tab', { name: /승인 대기/ }).click();
    await t.getByRole('button', { name: '승인', exact: true }).click();
    await t.getByText('학생을 승인했습니다.').waitFor();
    await t.getByRole('button', {name:/CP5격리검증반/}).click();
    await t.getByRole('tab', {name:/학생 0/}).waitFor();
    await t.getByRole('tab', {name:/승인 대기 0/}).click();
    await t.getByText('참여 신청을 기다리는 학생이 없습니다.').waitFor();
    await t.getByRole('button', {name:/CP5공개검증반/}).click();
    await s.getByRole('button', { name: '승인 상태 다시 확인' }).click();
    await s.getByRole('button', { name: '기록 도전 계속' }).click();
    await s.getByRole('button', { name: '시작하기' }).click();
    await s.getByText('1 / 50').waitFor();

    for (let index = 1; index <= 50; index++) {
      await s.getByRole('button', { name: '문제 건너뛰기' }).click();
      if (index === 1) {
        let resolveLost;
        const lost = new Promise(resolve => { resolveLost = resolve; });
        const dropAcknowledgement = async route => { await route.fetch(); await route.abort(); resolveLost(); };
        await s.route('**/submitAnswer', dropAcknowledgement);
        await s.getByRole('button', { name: '건너뛰기 확정' }).click();
        await lost;
        await s.unroute('**/submitAnswer', dropAcknowledgement);
        await s.getByText('저장 상태를 확인하지 못했어요. 다시 눌러 주세요.').waitFor();
      }
      await s.getByRole('button', { name: '건너뛰기 확정' }).click();
      await s.getByText('건너뛰었어요.').waitFor();
      if (index === 1) { await s.reload(); await s.getByText('건너뛰었어요.').waitFor(); }
      await s.getByRole('button', { name: index === 50 ? '결과 보기' : '다음 문제' }).click();
      if (index % 10 === 0 && index < 50) await s.getByRole('button', { name: '계속 풀기' }).click();
    }
    await s.getByText('서버 저장 완료').waitFor();
    await s.getByText('순위 반영 완료').waitFor();
    await s.getByRole('tab', { name: '우리 반 순위' }).click();
    await s.locator('.rank-row').first().waitFor();
    assert.match(await s.locator('.rank-row').first().textContent(), /0점/);
    await s.getByRole('tab', { name: '전체 순위' }).click();
    await s.locator('.rank-row').first().waitFor();
    await s.locator('.rank-row.me').getByText('0점', {exact:true}).waitFor();
    await t.getByRole('button', {name:'새로고침'}).click();
    await t.getByRole('tab', { name: /학생 기록/ }).click();
    await t.getByLabel('학생 선택').selectOption({ index: 1 });
    await t.getByRole('button', { name: /1번째 기록/ }).click();
    await t.getByText('문항별 상세').waitFor();
    assert.equal(await t.locator('.question').count(), 50);
    await t.getByRole('tab', { name: /학급 순위/ }).click();
    await t.getByText('0점').first().waitFor();
    t.once('dialog', dialog=>dialog.accept());
    await t.getByRole('button',{name:'전체 순위 등록 해제'}).click();
    await t.getByText('전체 순위 등록을 해제했습니다.').waitFor();
    t.once('dialog', dialog=>dialog.accept());
    await t.getByRole('button',{name:'전체 순위 등록 복원'}).click();
    await t.getByText('전체 순위 등록을 복원했습니다.').waitFor();
    await t.getByRole('tab',{name:/학생/}).first().click();
    t.once('dialog', dialog=>dialog.accept());
    await t.getByRole('button',{name:'복귀 티켓'}).click();
    await t.getByText('10분 동안 한 번만').waitFor();
    const ticket = await t.locator('.content .notice .key code').textContent();
    const returning = await browser.newContext();
    try {
      const r = await returning.newPage();
      await r.goto(`${site}/1math3.html`);
      await r.getByRole('button',{name:'학급 참여하기'}).click();
      await r.getByLabel('선생님에게 받은 일회용 복귀 코드').fill(ticket);
      await r.getByRole('button',{name:'내 기록 이어받기'}).click();
      await r.getByRole('button',{name:'기록 도전 계속'}).waitFor();
    } finally { await returning.close(); }
    await t.setViewportSize({width:390,height:844});
    assert.equal(await t.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const recovered = await browser.newContext();
    try {
      const r = await recovered.newPage();
      await r.goto(`${site}/teacher/index.html`);
      await r.getByLabel('복구 키').fill(recoveryKey);
      await r.getByRole('button',{name:'관리 공간 되찾기'}).click();
      await r.getByRole('button',{name:/CP5공개검증반/}).waitFor();
      await r.locator('.notice .key code').waitFor();
    } finally { await recovered.close(); }
    assert.deepEqual(errors, []);
  } finally {
    await teacher.close(); await student.close(); await browser.close();
  }
});
