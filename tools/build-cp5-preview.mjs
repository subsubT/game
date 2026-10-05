// Only development UI assets; never publishes the repository or server files.
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'.cp5-test-artifacts/preview-site');
await import('../firebase-config.js');
const source=globalThis.MATH3_FIREBASE_CONFIG;
if(source?.projectId!=='math3-dev'||source.workerApiOrigin!=='https://math3-cp3-dev.subsubt-math3-dev.workers.dev')throw Error('Development identity mismatch');
const publicConfig=Object.fromEntries(['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','region','workerApiOrigin'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
publicConfig.enableGoogleProvider=true;
const allowed=['teacher/index.html','teacher/dashboard.js','teacher/dashboard.css','1math3.html','src/student/1math3.css','src/student/1math3.bundle.js'];
for(const file of allowed){const target=resolve(out,'game',file);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,file),target);}
await writeFile(resolve(out,'game/firebase-config.js'),'globalThis.MATH3_FIREBASE_CONFIG='+JSON.stringify(publicConfig)+';\n');
const html=await readFile(resolve(out,'game/teacher/index.html'),'utf8');
await writeFile(resolve(out,'game/teacher/index.html'),html.replace('<body>','<body><p role="note" style="padding:12px;background:#fff4d6;text-align:center">math3-dev · CP5 임시 개발 검증 · 실제 학생 개인정보를 입력하지 마세요</p>').replace('</body>','<script type="module" src="./cp5-preview-check.js"></script></body>'));
await copyFile(resolve(root,'tools/cp5-preview-check.js'),resolve(out,'game/teacher/cp5-preview-check.js'));
await writeFile(resolve(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
const expected=new Set([...allowed.map(file=>'game/'+file),'game/firebase-config.js','game/teacher/cp5-preview-check.js','robots.txt']);
async function verifyDirectory(path,prefix=''){
  for(const entry of await readdir(path,{withFileTypes:true})){
    const name=prefix+entry.name;
    if(entry.isDirectory())await verifyDirectory(resolve(path,entry.name),name+'/');
    else if(!entry.isFile()||!expected.has(name))throw Error('Unexpected preview asset; deployment refused');
  }
}
await verifyDirectory(out);
await writeFile(resolve(root,'firebase.cp5-preview.json'),JSON.stringify({hosting:{site:'math3-dev',public:'.cp5-test-artifacts/preview-site',ignore:[],headers:[{source:'**',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Cache-Control',value:'no-store'},{key:'Referrer-Policy',value:'no-referrer'}]}]}},null,2)+'\n');
console.log('Built math3-dev preview from an explicit UI allowlist; no server, authentication files, or logs included.');
