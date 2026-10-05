// Only explicitly public files enter the Pages artifact. No deployment occurs here.
import { readFile,writeFile,mkdir,copyFile,readdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),review=process.argv.includes('--review-dev');
const publicKeys=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','region','workerApiOrigin'];
let metadata;
if(review){
 await import('../firebase-config.js');const source=globalThis.MATH3_FIREBASE_CONFIG;
 if(source?.projectId!=='math3-dev'||source.workerApiOrigin!=='https://math3-cp3-dev.subsubt-math3-dev.workers.dev')throw Error('Review development identity mismatch');
 metadata={environment:'review-dev',repositoryUrl:'https://github.com/subsubT/game.git',pagesUrl:'https://subsubt.github.io/game/',firebaseProjectId:source.projectId,workerName:'math3-cp3-dev',workerApiOrigin:source.workerApiOrigin,firebase:Object.fromEntries(publicKeys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]))};
}else{
 try{metadata=JSON.parse(process.env.MATH3_PUBLIC_DEPLOYMENT_CONFIG||'');}catch{throw Error('Production public deployment metadata is required; no development fallback');}
 const keys=['environment','repositoryUrl','pagesUrl','firebaseProjectId','workerName','workerApiOrigin','firebase'];
 if(!metadata||Object.keys(metadata).some(k=>!keys.includes(k))||metadata.environment!=='production'||metadata.repositoryUrl!=='https://github.com/subsubT/game.git'||metadata.pagesUrl!=='https://subsubt.github.io/game/')throw Error('Production deployment identity mismatch');
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(metadata.firebaseProjectId||'')||metadata.firebaseProjectId==='math3-dev'||!metadata.workerName||metadata.workerName==='math3-cp3-dev')throw Error('Separate production resources are required');
 const endpoint=new URL(metadata.workerApiOrigin);
 if(endpoint.protocol!=='https:'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password||endpoint.hostname.includes('math3-cp3-dev'))throw Error('Production Worker origin is invalid');
 if(!metadata.firebase||Object.keys(metadata.firebase).some(k=>!publicKeys.includes(k))||metadata.firebase.projectId!==metadata.firebaseProjectId||metadata.firebase.workerApiOrigin!==metadata.workerApiOrigin)throw Error('Public Firebase configuration does not match deployment metadata');
 for(const key of ['apiKey','authDomain','projectId','appId','workerApiOrigin'])if(typeof metadata.firebase[key]!=='string'||!metadata.firebase[key]||metadata.firebase[key].includes('REPLACE_'))throw Error('Public Firebase configuration is incomplete');
 if(metadata.firebase.authDomain!==metadata.firebaseProjectId+'.firebaseapp.com')throw Error('Firebase auth domain does not match the selected project');
}
const output=resolve(root,review?'dist-pages-review':'dist-pages');
const allowed=['index.html','1math1.html','1math2.html','1math3.html','src/student/1math3.css','src/student/1math3.bundle.js','teacher/index.html','teacher/dashboard.css','teacher/dashboard.js'];
for(const file of allowed){await mkdir(dirname(resolve(output,file)),{recursive:true});await copyFile(resolve(root,file),resolve(output,file));}
const config={...metadata.firebase,enableGoogleProvider:true};
await writeFile(resolve(output,'firebase-config.js'),'globalThis.MATH3_FIREBASE_CONFIG='+JSON.stringify(config)+';\n');
await writeFile(resolve(output,'.nojekyll'),'');
if(review)for(const file of ['1math3.html','teacher/index.html']){const path=resolve(output,file),html=await readFile(path,'utf8');await writeFile(path,html.replace('<body>','<body><p role="note">math3-dev 검토용 산출물 · 운영 배포 대상 아님 · 가상 데이터만 사용</p>'));}
const expected=new Set([...allowed,'firebase-config.js','.nojekyll']);
async function check(path,prefix=''){
 for(const entry of await readdir(path,{withFileTypes:true})){
  const name=prefix+entry.name;
  if(entry.isDirectory())await check(resolve(path,entry.name),name+'/');
  else if(!entry.isFile()||!expected.has(name))throw Error('Unexpected artifact file; publication refused');
 }
}
await check(output);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of allowed.slice(0,3))if(hash(await readFile(resolve(root,file)))!==hash(await readFile(resolve(output,file))))throw Error('Existing game preservation failed');
console.log(JSON.stringify({environment:metadata.environment,artifact:review?'dist-pages-review':'dist-pages',files:expected.size,oldGamesUnchanged:true,repositoryFilesExcluded:true}));
