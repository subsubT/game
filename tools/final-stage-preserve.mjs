// Compare only pre-existing records. Values stay in private backup/evidence.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
async function main(){
 const dir='.cp5-test-artifacts/final-stage',before=JSON.parse(await readFile(dir+'/firestore-before.json','utf8'));
 const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
 const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 const originals=Object.entries(before.documents).filter(([p])=>/^classes\/[^/]+(?:$|\/(students|sessions)\/)/.test(p)||p.startsWith('sheetConnections/')||p.startsWith('boardCounts/')||/^(classBoards|globalBoards)\//.test(p));
 const differences=[];let checked=0;
 for(let offset=0;offset<originals.length;offset+=8){
  const rows=await Promise.all(originals.slice(offset,offset+8).map(async([path,d])=>{
   const r=await api.get('/v1/'+d.name,{resolveOnHTTPError:true});
   if(r.status!==200||JSON.stringify(canonical(r.body.fields))!==JSON.stringify(canonical(d.fields))){const changed=[...new Set([...Object.keys(d.fields||{}),...Object.keys(r.body.fields||{})])].filter(k=>JSON.stringify(canonical(d.fields?.[k]))!==JSON.stringify(canonical(r.body.fields?.[k])));return {path,status:r.status,changed,before:d,after:r.body};}return null;
  }));differences.push(...rows.filter(Boolean));checked+=rows.length;
  if(checked%400===0)console.log(JSON.stringify({preservationChecked:checked,total:originals.length}));
 }
 await writeFile(dir+'/preservation-differences.json',JSON.stringify(differences));
 const evidence={originalRecordsUnchanged:differences.length===0,checked,differences:differences.map(d=>({collection:d.path.split('/')[0],fields:d.changed,status:d.status})),checkedAt:new Date().toISOString()};
 await writeFile(dir+'/preservation.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));if(differences.length)process.exitCode=1;
}
main().catch(e=>{console.error(JSON.stringify({preservationFailed:true,code:typeof e.code==='string'?e.code:'NETWORK_OR_AUTH',status:e.status||null}));process.exitCode=1;});
