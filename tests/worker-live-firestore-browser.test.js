// Opt-in browser check of the deployed math3-dev Firestore Rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const site = 'https://subsubt.github.io';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

test('actual browser Firebase SDK cannot read or write Firestore directly', { skip: process.env.MATH3_LIVE_TEST !== '1', timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const context = await browser.newContext();
    await context.route(`${site}/**`, async route => {
      try {
        const path = resolve(root, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
        if (!path.startsWith(root)) throw Error('outside root');
        await route.fulfill({ status: 200, contentType: mime[extname(path)] || 'application/octet-stream', body: await readFile(path) });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    const page = await context.newPage();
    await page.goto(`${site}/teacher/index.html`);
    await page.getByRole('button', { name: '관리 공간 만들기' }).click();
    await page.getByLabel('비공개 학급 이름').fill('규칙검증반');
    await page.getByRole('button', { name: '학급 만들기' }).click();
    const classId = await page.locator('[data-action="pending"]').first().getAttribute('data-class');
    assert.ok(classId);
    const result = await page.evaluate(async id => {
      const appSdk = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js');
      const fs = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const db = fs.getFirestore(appSdk.getApp('math3-teacher'));
      const ref = fs.doc(db, 'classes', id);
      const outcome = {};
      try { await fs.getDoc(ref); outcome.read = 'allowed'; } catch (error) { outcome.read = error.code; }
      try { await fs.setDoc(ref, { forged: 500 }); outcome.write = 'allowed'; } catch (error) { outcome.write = error.code; }
      return outcome;
    }, classId);
    assert.deepEqual(result, { read: 'permission-denied', write: 'permission-denied' });
  } finally { await browser.close(); }
});
