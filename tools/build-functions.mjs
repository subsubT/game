import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('functions/lib/', root), { recursive: true });
await copyFile(new URL('src/games/1math3/core.js', root), new URL('functions/lib/core.js', root));
await copyFile(new URL('src/server/join-code.js', root), new URL('functions/lib/join-code.js', root));
console.log('Copied shared game core and join-code generator to functions/lib');
