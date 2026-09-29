import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);

test('direct-file HTML loads a current classic script', async () => {
  const html = await readFile(new URL('1math3.html', root), 'utf8');
  assert.match(html, /<script defer src="src\/student\/1math3\.bundle\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]*type="module"/);
  execFileSync(process.execPath, ['tools/build-1math3.mjs', '--check'], { cwd: new URL('.', root) });
});

test('classic script renders the game without a module loader or server', async () => {
  const bundle = await readFile(new URL('src/student/1math3.bundle.js', root), 'utf8');
  const app = { innerHTML: '', addEventListener() {}, querySelector() { return null; } };
  const toggle = { addEventListener() {} };
  const document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#sound-toggle') return toggle;
      if (selector === '.topbar' || selector === 'footer') return { inert: false };
      throw new Error(`Unexpected selector: ${selector}`);
    },
    addEventListener() {},
  };
  const localStorage = { getItem() { return null; }, setItem() {} };
  runInNewContext(bundle, { document, localStorage, requestAnimationFrame() {}, console });
  await Promise.resolve();
  await Promise.resolve();
  assert.match(app.innerHTML, /수학 별 모으기/);
  assert.match(app.innerHTML, /혼자 연습 시작하기/);
  assert.match(app.innerHTML, /전체 순위 기본 공개/);
});
