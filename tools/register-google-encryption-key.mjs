import { randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--help')) {
  console.log('node tools/register-google-encryption-key.mjs --dev\nRegisters a new random AES-256 key directly via stdin, without displaying or saving its value. Refuses to replace an existing key.');
  process.exit(0);
}
if (process.argv.length !== 3 || process.argv[2] !== '--dev') throw Error('Use --dev for the documented math3-cp3-dev worker.');
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
if (config.name !== 'math3-cp3-dev' || config.vars.FIREBASE_PROJECT_ID !== 'math3-dev') throw Error('Development resource identity mismatch.');
const logDirectory = fileURLToPath(new URL('../.wrangler/logs/', import.meta.url));
await mkdir(logDirectory, {recursive:true});
const env = {...process.env,WRANGLER_LOG_PATH:logDirectory,WRANGLER_LOG:'error'};
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
let metadata;
try { metadata = (await promisify(execFile)(process.execPath,[cli,'versions','secret','list','--latest-version','--name',config.name],{cwd:root,env:{...env,WRANGLER_LOG:'log'}})).stdout; }
catch { throw Error('Could not read secret names. Check Wrangler authentication and selected account. No key was registered.'); }
if (!metadata.includes('-- Version ')) throw Error('Unexpected secret metadata response.');
if (/Secret Name:\s*GOOGLE_TOKEN_ENCRYPTION_KEY\b/.test(metadata)) throw Error('The encryption key already exists. It was preserved. Do not rotate it without a token migration plan.');
const child = spawn(process.execPath,[cli,'versions','secret','put','GOOGLE_TOKEN_ENCRYPTION_KEY','--name',config.name],{cwd:root,env,stdio:['pipe','ignore','ignore']});
child.stdin.on('error',()=>{});
child.stdin.end(randomBytes(32).toString('base64url')+'\n');
child.on('error',()=>{console.error('Wrangler could not start.');process.exitCode=1;});
child.on('exit',code=>{
  if(code!==0){console.error('Secret registration did not complete. Check account permissions; no key value was displayed or saved.');process.exitCode=1;}
  else console.log('Staged GOOGLE_TOKEN_ENCRYPTION_KEY for math3-cp3-dev without deploying. Key value was not displayed or saved.');
});
