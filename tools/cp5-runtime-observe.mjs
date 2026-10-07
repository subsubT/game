// Bounded runtime observation: discard URL queries, credentials and raw logs.
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {liveApiKey} from '../tests/live-config.js';
const root=resolve(import.meta.dirname,'..');
const child=spawn(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'tail','math3-cp3-dev','--format','json'],{cwd:root,stdio:['ignore','pipe','pipe']});
const evidence={checkedAt:new Date().toISOString(),events:0,serverErrors:0,internalErrors:0,statuses:{},probeRequests:0,probeFailed:false};
let buffer='';
child.stderr.on('data',()=>{});
child.stdout.on('data',chunk=>{
 buffer+=chunk;
 for(;;){
  const begin=buffer.indexOf('{');if(begin<0){buffer='';return;}
  let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=begin;i<buffer.length;i++){const c=buffer[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}}
  if(end<0)return;
  const raw=buffer.slice(begin,end);buffer=buffer.slice(end);
  try{const event=JSON.parse(raw);if(!event.event)continue;evidence.events++;const status=event.event.response?.status;if(Number.isInteger(status)){evidence.statuses[status]=(evidence.statuses[status]||0)+1;if(status>=500)evidence.serverErrors++;}evidence.internalErrors+=(event.logs||[]).filter(row=>['OAuth internal error','Worker internal error'].includes(row.message?.[0])).length;}catch{}
 }
});
const probe=setTimeout(async()=>{
 try{
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${await liveApiKey()}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
  const account=await response.json();if(!response.ok||!account.idToken)throw Error('AUTH_PROBE_FAILED');
  for(let i=0;i<3;i++){
   const r=await fetch('https://math3-cp3-dev.subsubt-math3-dev.workers.dev/api/getStudentStatus',{method:'POST',headers:{origin:'https://subsubt.github.io',authorization:'Bearer '+account.idToken,'content-type':'application/json'},body:'{"data":{}}'});
   await r.arrayBuffer();evidence.probeRequests++;if(r.status!==200)evidence.probeFailed=true;
  }
 }catch{evidence.probeFailed=true;}
},15000);
const timer=setTimeout(()=>child.kill(),60000);
await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);clearTimeout(probe);
await writeFile(resolve(root,'.cp5-test-artifacts/final/runtime-summary.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
if(evidence.serverErrors||evidence.internalErrors||evidence.probeFailed||!evidence.events)process.exitCode=1;
