import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const origin = 'https://subsubt.github.io';

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
  await teacher.route(`${origin}/**`, serveLocal);
  await student.route(`${origin}/**`, serveLocal);
  const t = await teacher.newPage(), s = await student.newPage();
  const errors = [];
  for (const page of [t, s]) page.on('pageerror', error => errors.push(error.message));
  try {
    await t.goto(`${origin}/teacher/index.html`);
    await t.getByRole('button', { name: '관리 공간 만들기' }).waitFor({ timeout: 30000 });
    await t.getByRole('button', { name: '관리 공간 만들기' }).click();
    await t.getByLabel('비공개 학급 이름').fill('브라우저 검증반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.locator('.code').waitFor();
    const code = (await t.locator('.code').textContent()).trim();
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);

    await s.goto(`${origin}/1math3.html`);
    await s.getByRole('button', { name: '학급 참여하기' }).click();
    await s.getByLabel('학급 참여 코드').fill(code);
    await s.getByRole('button', { name: '참여 신청하기' }).click();
    await s.getByText('승인을 기다리고 있어요.').waitFor();
    await t.getByRole('button', { name: '새로고침' }).click();
    await t.getByRole('tab', { name: /승인 대기/ }).click();
    await t.getByRole('button', { name: '승인', exact: true }).click();
    await t.getByText('학생을 승인했습니다.').waitFor();
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
    assert.match(await s.locator('.rank-row').first().textContent(), /0점/);
    await t.getByRole('tab', { name: /학생 기록/ }).click();
    await t.getByLabel('학생 선택').selectOption({ index: 1 });
    await t.getByRole('button', { name: /1번째 기록/ }).click();
    await t.getByText('문항별 상세').waitFor();
    assert.equal(await t.locator('.question').count(), 50);
    await t.getByRole('tab', { name: /학급 순위/ }).click();
    await t.getByText('0점').first().waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await teacher.close(); await student.close(); await browser.close();
  }
});
