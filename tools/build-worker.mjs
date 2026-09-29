import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('functions/index.js', root), 'utf8');
const names = [...source.matchAll(/^export const (\w+) = call\(/gm)].map(match => match[1]);
if (names.length < 15) throw new Error('Functions export list changed unexpectedly');

let body = source
  .replace(/^import \{ onCall, HttpsError \} from 'firebase-functions\/v2\/https';\r?\n/, '')
  .replace(/^import \{ initializeApp \} from 'firebase-admin\/app';\r?\n/, '')
  .replace(/^import \{ getFirestore \} from 'firebase-admin\/firestore';\r?\n/, '')
  .replace("from './lib/core.js'", "from '../../src/games/1math3/core.js'")
  .replace(/initializeApp\(\);\r?\nconst db = getFirestore\(\);\r?\n/, '')
  .replace(/^const region = 'asia-northeast3';\r?\n/m, '')
  .replace(/^const secret = process\.env\.MATH3_SERVER_SECRET.*\r?\n/m, '')
  .replace(/^const uidOf = .*\r?\n/m, '')
  .replace(/^if \(!secret\) throw new Error\('MATH3_SERVER_SECRET is required'\);\r?\n/m, '')
  .replace(/^const fail = .*\r?\n/m, "const fail = (code, message = code) => { throw new ApiError(code, message); };\n")
  .replace(/^const options = .*\r?\n/m, '')
  .replace(/^const call = .*\r?\n/m, 'const call = handler => handler;\n')
  .replace(/^export const (\w+) = call\(/gm, 'const $1 = call(');

if (body.includes('HttpsError') || body.includes('onCall(') || body.includes('getFirestore()') || body.includes('process.env.MATH3_SERVER_SECRET')) throw new Error('Functions wrapper not fully replaced');
body = body.replace(/\r\n/g, '\n');
const oldCursor = `  if (data.cursor) {
    const [scoreText, id, signature] = str(data.cursor, 250).split('.');
    if (signature !== digest(\`\${boardId}:\${scoreText}:\${id}\`).slice(0, 16) || !/^\\d{1,3}$/.test(scoreText) || !/^[a-f0-9]{32}$/.test(id)) fail('INVALID_REQUEST');
    query = query.startAfter(Number(scoreText), id);
  }`;
const newCursor = `  if (data.cursor) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(str(data.cursor, 4096), 'base64url').toString('utf8')); } catch { fail('INVALID_REQUEST'); }
    if (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || cursor[0].length > 2048 || cursor[1] !== digest(\`\${boardId}:\${cursor[0]}\`).slice(0, 16)) fail('INVALID_REQUEST');
    query = query.startAfterToken(cursor[0]);
  }`;
const oldNext = "const last = rows.docs.at(-1), nextCursor = rows.size === pageSize ? `${last.data().score}.${last.id}.${digest(`${boardId}:${last.data().score}:${last.id}`).slice(0, 16)}` : null;";
const newNext = "const nextCursor = rows.nextPageToken ? Buffer.from(JSON.stringify([rows.nextPageToken, digest(`${boardId}:${rows.nextPageToken}`).slice(0, 16)])).toString('base64url') : null;";
if (!body.includes(oldCursor) || !body.includes(oldNext)) throw new Error('Leaderboard cursor source changed unexpectedly');
body = body.replace(oldCursor, newCursor).replace(oldNext, newNext);
// Imports belong at module scope; the Function body starts at the first shared constant.
const imports = body.slice(0, body.indexOf('const alphabet ='));
const generated = `// Generated from functions/index.js by tools/build-worker.mjs. Do not edit directly.\nimport { ApiError } from './error.js';\n${imports}\nexport const handlerNames = Object.freeze(${JSON.stringify(names)});\nexport function createHandlers(db, secret) {\n  if (!secret) throw new Error('MATH3_SERVER_SECRET is required');\n${body.slice(body.indexOf('const alphabet =')).replace(/^/gm, '  ')}\n  return { ${names.join(', ')} };\n}\n`;
const target = new URL('worker/src/generated-handlers.js', root);
if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== generated) { console.error('Worker handlers are out of date. Run: npm run build:worker'); process.exitCode = 1; }
  else console.log(`Worker handlers current (${names.length} CP3 methods).`);
} else {
  await writeFile(target, generated);
  console.log(`Generated Worker handlers (${names.length} CP3 methods).`);
}
