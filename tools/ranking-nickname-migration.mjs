// One-time, backed-up display-name migration. Never print names or credentials.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='.cp5-test-artifacts/ranking-nickname-20261021';
const project='math3-dev',base=`/v1/projects/${project}/databases/(default)/documents`;
let stage='authentication';
async function main(){
  const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project,nonInteractive:true};
  auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));
  await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
  const Client=require('firebase-tools/lib/apiv2.js').Client;
  const api=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
  async function group(collectionId){
    const r=await api.post(base+':runQuery',{structuredQuery:{from:[{collectionId,allDescendants:true}]}});
    return (r.body||[]).flatMap(x=>x.document?[x.document]:[]);
  }
  const mode=process.argv[2]||'plan';await mkdir(dir,{recursive:true});
  if(mode==='plan'){
    stage='snapshot';
    let snapshot;
    try { snapshot=JSON.parse(await readFile(dir+'/before.json','utf8')); }
    catch(e){if(e.code!=='ENOENT')throw e;snapshot={project,createdAt:new Date().toISOString(),students:await group('students'),entries:await group('entries'),counts:await group('boardCounts')};await writeFile(dir+'/before.json',JSON.stringify(snapshot),{flag:'wx'});}
    const changes=snapshot.entries.filter(e=>/\/(classBoards|globalBoards)\//.test(e.name)).map(e=>({name:e.name,before:e.fields.displayAlias,updateTime:e.updateTime}));
    await writeFile(dir+'/plan.json',JSON.stringify({project,changes}),{flag:'wx'});
    await writeFile(dir+'/rollback.json',JSON.stringify({project,writes:changes.map(c=>({update:{name:c.name,fields:{displayAlias:c.before}},updateMask:{fieldPaths:['displayAlias']},currentDocument:{exists:true}}))}),{flag:'wx'});
    console.log(JSON.stringify({backupSaved:true,rollbackSaved:true,students:snapshot.students.length,rankingEntries:snapshot.entries.length,plannedChanges:changes.length}));
  }else if(mode==='queue'){
    stage='queue private maintenance';
    const before=JSON.parse(await readFile(dir+'/before.json','utf8'));
    await api.post(base+':commit',{writes:[{update:{name:base.slice(4)+'/maintenance/rankingNickname20261021',fields:{status:{stringValue:'pending'},expectedEntries:{integerValue:String(before.entries.length)},studentPaths:{arrayValue:{values:before.students.map(s=>({stringValue:s.name.split('/documents/')[1]}))}}}},currentDocument:{exists:false}}]});
    console.log(JSON.stringify({privateMaintenanceQueued:true,students:before.students.length,entries:before.entries.length}));
  }else if(mode==='verify'){
    stage='verify maintenance and preservation';
    const before=JSON.parse(await readFile(dir+'/before.json','utf8')),plan=JSON.parse(await readFile(dir+'/plan.json','utf8'));
    const marker=(await api.get(base+'/maintenance/rankingNickname20261021')).body;
    assert.equal(marker.fields.status.stringValue,'complete');
    const names=new Map(before.students.map(d=>[d.name.split('/documents/')[1],d.fields.privateName?.stringValue?d.fields.privateName:d.fields.classAlias]));
    const expected=new Map(marker.fields.matched.arrayValue.values.map(v=>[v.mapValue.fields.path.stringValue,names.get(v.mapValue.fields.studentPath.stringValue)]));
    const current=new Map((await group('entries')).map(e=>[e.name,e]));
    for(const e of before.entries){
      const actual=current.get(e.name);assert.ok(actual,'Existing entry preserved');
      const path=e.name.split('/documents/')[1];assert.ok(expected.has(path),'Every original entry matched');assert.deepEqual(actual.fields,{...e.fields,displayAlias:expected.get(path)});
    }
    for(const [collection,docs] of [['students',before.students],['boardCounts',before.counts]]){
      const rows=new Map((await group(collection)).map(d=>[d.name,d]));
      for(const d of docs)assert.deepEqual(rows.get(d.name)?.fields,d.fields);
    }
    const changed=before.entries.filter(e=>current.get(e.name)?.fields.displayAlias?.stringValue!==e.fields.displayAlias?.stringValue).length;
    const evidence={result:'PASS',checkedAt:new Date().toISOString(),existingRanks:before.entries.length,nicknameFieldsChanged:changed,studentRecordsAndCountsUnchanged:true,scoresAndRankingOrderUnchanged:true};
    await writeFile(dir+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
  }else throw Error('Unsupported mode');
}
main().catch(e=>{console.error(JSON.stringify({migration:'FAIL',stage,status:e.status||e.statusCode||null,credentialsAndStudentData:'withheld'}));process.exitCode=1;});
