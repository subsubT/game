// HTTP smoke checks only. Google authentication uses ordinary Chrome.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
if(config.name!=='math3-cp3-dev'||config.vars.FIREBASE_PROJECT_ID!=='math3-dev')throw Error('Development identity mismatch');
const dashboard=new URL(config.vars.GOOGLE_DASHBOARD_URL),origin=dashboard.origin;
if(!/^math3-dev--cp5-google-[a-z0-9]+\.web\.app$/.test(dashboard.hostname))throw Error('Use the recorded math3-dev preview, not an automated Google browser');
async function request(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});await response.arrayBuffer();return response;}
for(const path of ['/game/teacher/index.html','/game/teacher/dashboard.js','/game/teacher/dashboard.css','/game/teacher/cp5-preview-check.js','/game/1math3.html']){const r=await request(origin+path);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);}
for(const path of ['/worker/src/index.js','/game/.env.local','/game/docs/DEVELOPMENT_STATE.md','/firebase.cp5-preview.json'])assert.equal((await request(origin+path)).status,404);
const worker=new URL(config.vars.GOOGLE_REDIRECT_URI).origin;
const cors=await request(worker+'/api/getGoogleConnectionStatus',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}});
assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),origin);
console.log('Development preview HTTP/allowlist/noindex and Worker CORS PASS. Actual Google approval remains manual.');
