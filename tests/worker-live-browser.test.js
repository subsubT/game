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
    assert.match(code, /^[0-9]{4}$/);
    await t.getByText('연결 안 됨', {exact:true}).waitFor();
    await t.getByLabel('비공개 학급 이름').fill('CP5격리검증반');
    await t.getByRole('button', { name: '학급 만들기' }).click();
    await t.getByRole('button', { name: /CP5공개검증반/ }).click();
    await t.locator('.code').getByText(code).waitFor();

    await s.goto(`${site}/1math3.html`);
    await s.getByRole('button', { name: '학급 참여하기' }).click();
    await s.getByLabel('학급 참여 코드').fill(code);
    await s.getByRole('button', { name: '학급 참여하기' }).click();
    await s.getByText('학급에 참여했어요.').waitFor();
    await t.getByRole('button',{name:'새로고침'}).click();
    await t.getByRole('tab',{name:/학생 1/}).click();
    await t.getByRole('button',{name:'이름 변경',exact:true}).click();
    await t.getByLabel('새 학생 이름').fill('교사변경이름');
    await t.getByRole('button',{name:'이름 저장',exact:true}).click();
    await t.getByText('학생 이름을 변경했습니다.').waitFor();
    await t.locator('#student-rows').getByText('교사변경이름',{exact:true}).waitFor();
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
    let returnedState;
    const returning = await browser.newContext();
    try {
      const r = await returning.newPage();
      await r.goto(`${site}/1math3.html`);
      await r.getByRole('button',{name:'학급 참여하기'}).click();
      await r.getByLabel('선생님에게 받은 일회용 복귀 코드').fill(ticket);
      await r.getByRole('button',{name:'내 기록 이어받기'}).click();
      await r.getByRole('button',{name:'기록 도전 계속'}).waitFor();
      returnedState=await returning.storageState({indexedDB:true});
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
      await r.getByRole('button',{name:/CP5공개검증반/}).click();
      await r.getByRole('tab',{name:/학생 1/}).click();
      r.once('dialog',dialog=>dialog.dismiss());
      await r.getByRole('button',{name:'학생 삭제',exact:true}).click();
      await r.locator('#student-rows').getByText('교사변경이름',{exact:true}).waitFor();
      r.once('dialog',dialog=>dialog.accept());
      await r.getByRole('button',{name:'학생 삭제',exact:true}).click();
      await r.getByText('학생을 학급에서 삭제했습니다.').waitFor();
      await r.getByText('소속 학생이 없습니다.').waitFor();
      const removed=await browser.newContext({storageState:returnedState});
      try{const p=await removed.newPage();await p.goto(`${site}/1math3.html`);await p.getByRole('button',{name:'학급 참여하기',exact:true}).waitFor();await p.getByRole('button',{name:'학급 참여하기',exact:true}).click();await p.getByLabel('학급 참여 코드').fill(code);await p.getByRole('button',{name:'학급 참여하기',exact:true}).click();await p.getByText('학급에 참여하지 못했어요.',{exact:false}).waitFor();}finally{await removed.close();}
    } finally { await recovered.close(); }
    assert.deepEqual(errors, []);
  } finally {
    await teacher.close(); await student.close(); await browser.close();
  }
});
