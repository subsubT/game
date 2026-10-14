// Read-only complete Firestore snapshot. Credentials and documents stay ignored.
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='.cp5-test-artifacts/checkpoint-c';
async function main(){
 const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
 auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
 const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
 const base='/v1/projects/math3-dev/databases/(default)/documents';
 await mkdir(dir,{recursive:true});
 const mode=process.argv[2]||'backup';
 if(mode==='backup'){
  const documents={};
  let pageToken;const ids=new Set(['students','sessions','entries']);
  do {const r=await api.post(base+':listCollectionIds',{pageSize:100,...(pageToken?{pageToken}:{})});for(const id of r.body.collectionIds||[])ids.add(id);pageToken=r.body.nextPageToken;}while(pageToken);
  // Group queries include entries underneath missing board parent documents.
  for(const id of ids){
   const r=await api.post(base+':runQuery',{structuredQuery:{from:[{collectionId:id,allDescendants:true}]}});
   for(const row of r.body||[]){const d=row.document;if(d)documents[d.name.split('/documents/')[1]]=d;}
   console.log(JSON.stringify({snapshotCollectionRead:true,documentsSoFar:Object.keys(documents).length}));
  }
  const data=JSON.stringify({project:'math3-dev',createdAt:new Date().toISOString(),documents});
  await writeFile(dir+'/firestore-before.json',data,{flag:'wx'});
  const evidence={project:'math3-dev',snapshotSaved:true,documents:Object.keys(documents).length,sha256:createHash('sha256').update(data).digest('hex')};
  await writeFile(dir+'/backup-summary.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }else if(mode==='preserved'){
  const before=JSON.parse(await readFile(dir+'/firestore-before.json','utf8'));let checked=0;
  const synthetic=new Set(Object.entries(before.documents).filter(([p,d])=>/^classes\/[^/]+$/.test(p)&&d.fields?.privateLabel?.stringValue==='C검증1014').map(([p])=>p.split('/')[1]));
  const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  for(const [path,d] of Object.entries(before.documents)){
   // No existing class/student/session or connection is used as a mutable fixture.
   if(synthetic.has(path.split('/')[1])||(!/^classes\/[^/]+(?:$|\/(students|sessions)\/)/.test(path)&&!path.startsWith('sheetConnections/')))continue;
   const r=await api.get('/v1/'+d.name,{resolveOnHTTPError:true});
   if(r.status!==200||JSON.stringify(canonical(r.body.fields))!==JSON.stringify(canonical(d.fields)))throw Error('Original data changed');checked++;
  }
  const evidence={originalRecordsUnchanged:true,checked,checkedAt:new Date().toISOString()};await writeFile(dir+'/preservation.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }else throw Error('Unknown mode');
}
main().catch(()=>{console.error('Checkpoint C backup/preservation failed; credentials and database data withheld');process.exitCode=1;});
