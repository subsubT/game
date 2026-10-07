// Reports only filenames/categories, never matching secret values.
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const patterns=[
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/],
 ['Google refresh token',/\b1\/\/[A-Za-z0-9_-]{40,}/],
 ['Google access token',/\bya29\.[A-Za-z0-9_-]{30,}/],
 ['Google client secret',/\bGOCSPX-[A-Za-z0-9_-]{20,}/],
 ['JWT credential',/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/]
];
const failures=[];
function check(name,content){for(const [kind,re] of patterns)if(re.test(content))failures.push({file:name,kind});}
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files)check(file,await readFile(resolve(root,file),'utf8'));
async function artifact(path,prefix=''){for(const e of await readdir(path,{withFileTypes:true})){
 if(e.isDirectory())await artifact(resolve(path,e.name),prefix+e.name+'/');
 else check('dist-pages/'+prefix+e.name,await readFile(resolve(path,e.name),'utf8'));
}}
await artifact(resolve(root,'dist-pages'));
if(failures.length){console.error(JSON.stringify({failures}));process.exitCode=1;}
else console.log(JSON.stringify({trackedFiles:files.length,artifactScan:'PASS',credentialPatterns:'PASS',publicFirebaseKeysAllowed:true}));
