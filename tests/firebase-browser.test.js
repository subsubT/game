import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const config = { apiKey: 'fake-api-key', authDomain: 'demo-1math3-checkpoint3.firebaseapp.com', projectId: 'demo-1math3-checkpoint3', appId: '1:123:web:abc', region: 'asia-northeast3', emulators: { host: '127.0.0.1', auth: 9099, functions: 5001 } };

test('teacher approval and a full official round work in Chromium', { timeout: 240000 }, async () => {
  const server = createServer(async (req, res) => {
    if (req.url === '/firebase-config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(`globalThis.MATH3_FIREBASE_CONFIG=${JSON.stringify(config)};`); return; }
    try {
      const path = resolve(root, `.${decodeURIComponent(req.url.split('?')[0])}`);
      if (!path.startsWith(root)) throw Error('outside root');
      const body = await readFile(path); res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const teacher = await browser.newContext(), student = await browser.newContext();
  const t = await teacher.newPage(), s = await student.newPage();
  const errors = [];
  for (const page of [t, s]) page.on('pageerror', error => errors.push(error.message));
  try {
    await t.goto(`${origin}/teacher/index.html`);
    await t.getByRole('button', { name: '관리 공간 만들기' }).waitFor({ timeout: 30000 });
    await t.getByRole('button', { name: '관리 공간 만들기' }).click();
    const recoveryKey = await t.locator('.notice .key code').textContent();
    await t.getByLabel('비공개 학급 이름').fill('브라우저 검증반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.locator('.code').waitFor();
    const code = (await t.locator('.code').textContent()).trim();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
    await t.getByLabel('비공개 학급 이름').fill('두 번째 반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.getByRole('button', { name: /브라우저 검증반/ }).click();
    await t.locator('.code').getByText(code).waitFor();

    await s.goto(`${origin}/1math3.html`);
    await s.getByRole('button', { name: '학급 참여하기' }).click();
    await s.getByLabel('학급 참여 코드').fill(code);
    await s.getByRole('button', { name: '참여 신청하기' }).click();
    await s.getByText('승인을 기다리고 있어요.').waitFor();
    await t.getByRole('button', { name: '새로고침' }).click();
    await t.getByRole('tab', { name: /승인 대기/ }).click();
    await t.getByRole('button', { name: '승인', exact: true }).click();
    await t.getByText('학생을 승인했습니다.').waitFor();
    await t.getByRole('button', { name: /두 번째 반/ }).click();
    await t.getByRole('tab', { name: /학생 0/ }).waitFor();
    await t.getByRole('tab', { name: /승인 대기 0/ }).click();
    await t.getByText('참여 신청을 기다리는 학생이 없습니다.').waitFor();
    await t.getByRole('button', { name: /브라우저 검증반/ }).click();
    await s.getByRole('button', { name: '승인 상태 다시 확인' }).click();
    await s.getByRole('button', { name: '기록 도전 계속' }).click();
    await s.getByRole('button', { name: '시작하기' }).click();
    try { await s.getByText('1 / 50').waitFor(); }
    catch (error) { throw new Error(`Game did not start: ${(await s.locator('body').innerText()).slice(0, 500)}`, { cause: error }); }

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
    await s.getByRole('tab', { name: '전체 순위' }).click();
    await s.locator('.rank-row').first().waitFor();
    assert.match(await s.locator('.rank-row').first().textContent(), /0점/);
    await t.getByRole('button', { name: '새로고침' }).click();
    await t.getByRole('tab', { name: /학생 기록/ }).click();
    await t.getByLabel('학생 선택').selectOption({ index: 1 });
    await t.getByRole('button', { name: /1번째 기록/ }).click();
    await t.getByText('문항별 상세').waitFor();
    assert.equal(await t.locator('.question').count(), 50);
    await t.getByRole('tab', { name: /학급 순위/ }).click();
    await t.getByText('0점').first().waitFor();
    t.once('dialog', dialog => dialog.accept());
    await t.getByRole('button', { name: '전체 순위 등록 해제' }).click();
    await t.getByText('전체 순위 등록을 해제했습니다.').waitFor();
    t.once('dialog', dialog => dialog.accept());
    await t.getByRole('button', { name: '전체 순위 등록 복원' }).click();
    await t.getByText('전체 순위 등록을 복원했습니다.').waitFor();
    await t.getByRole('tab', { name: /학생/ }).first().click();
    t.once('dialog', dialog => dialog.accept());
    await t.getByRole('button', { name: '복귀 티켓' }).click();
    await t.getByText('10분 동안 한 번만').waitFor();
    await t.setViewportSize({ width: 390, height: 844 });
    await t.getByRole('button', { name: /브라우저 검증반/ }).isVisible();
    assert.equal(await t.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const recovered = await browser.newContext();
    try {
      const r = await recovered.newPage();
      await r.goto(`${origin}/teacher/index.html`);
      await r.getByLabel('복구 키').fill(recoveryKey);
      await r.getByRole('button', { name: '관리 공간 되찾기' }).click();
      await r.getByRole('button', { name: /브라우저 검증반/ }).waitFor();
      await r.locator('.notice .key code').waitFor();
    } finally { await recovered.close(); }
    assert.deepEqual(errors, []);
  } finally {
    await teacher.close(); await student.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  }
});
