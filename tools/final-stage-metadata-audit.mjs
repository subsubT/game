// Explain expected metadata differences without printing code/cipher values.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
async function main(){
 const dir='.cp5-test-artifacts/final-stage',diffs=JSON.parse(await readFile(dir+'/preservation-differences.json','utf8')),before=JSON.parse(await readFile(dir+'/firestore-before.json','utf8'));
 const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
 const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true}),base='/v1/projects/math3-dev/databases/(default)/documents';
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b)),expected=[];
 for(const d of diffs){
  if(d.path.startsWith('boardCounts/')&&same(d.changed,['updatedAt'])&&same(d.before.fields.counts,d.after.fields.counts)){expected.push('global score distribution unchanged; metadata timestamp only');continue;}
  if(d.before.fields.privateLabel?.stringValue==='CP5실제검증반'&&same(d.changed,['codeCipher'])){
   const result=await api.post(base+':runQuery',{structuredQuery:{from:[{collectionId:'joinCodeBackups'}],where:{fieldFilter:{field:{fieldPath:'codeCipher'},op:'EQUAL',value:d.before.fields.codeCipher}}}});
   const backup=result.body.find(r=>r.document?.name.split('/documents/')[1].startsWith('joinCodeBackups/'+d.path.split('/')[1]+':'))?.document;
   if(!backup)throw Error('Legacy code backup missing');
   const oldKey=backup.fields.oldCodeDigest.stringValue,newKey=backup.fields.newCodeDigest.stringValue;
   const [oldIndex,newIndex]=await Promise.all([api.get(base+'/joinCodes/'+oldKey),api.get(base+'/joinCodes/'+newKey)]);
   if(!same(oldIndex.body.fields,before.documents['joinCodes/'+oldKey].fields)||newIndex.body.fields.classId.stringValue!==d.path.split('/')[1]||!newIndex.body.fields.active.booleanValue)throw Error('Join alias mismatch');
   expected.push('existing labelled QA class used the pre-existing 8-to-4-digit migration; atomic backup, original alias and expiry preserved');continue;
  }
  throw Error('Unexpected original record difference');
 }
 const preservation=JSON.parse(await readFile(dir+'/preservation.json','utf8'));
 const report={existingLearningAndScoresPreserved:true,metadataExceptions:expected,checkedOriginalRecords:preservation.checked,originalRecordsWithoutFieldChanges:preservation.checked-diffs.length};
 await writeFile(dir+'/metadata-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(()=>{console.error('Metadata audit failed; codes and ciphertext withheld');process.exitCode=1;});
