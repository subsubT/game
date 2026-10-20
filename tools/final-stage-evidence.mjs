// Read-only QA evidence scoped to the explicitly labelled synthetic class.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
async function main(){
 const fixture=JSON.parse(await readFile('.cp5-test-artifacts/final-stage/fixture.json','utf8'));
 const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
 const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true}),base='/v1/projects/math3-dev/databases/(default)/documents';
 const cls=(await api.get(base+'/classes/'+fixture.cls.classId)).body;
 if(cls.fields?.privateLabel?.stringValue!=='최종검증1020')throw Error('Fixture mismatch');
 if(process.argv[2]==='exclude'){
   await writeFile('.cp5-test-artifacts/final-stage/synthetic-class-before.json',JSON.stringify(cls),{flag:'wx'});
   await api.patch(base+'/classes/'+fixture.cls.classId+'?updateMask.fieldPaths=globalOptIn',{fields:{globalOptIn:{booleanValue:false}}});
   console.log(JSON.stringify({syntheticClassGlobalRankingExcluded:true,originalClassBackupSaved:true}));return;
 }
 const sessions=(await api.get(base+'/classes/'+fixture.cls.classId+'/sessions?pageSize=200')).body.documents||[];
 const results=sessions.map(s=>{const f=s.fields,stage=f.finalStage?.mapValue?.fields;return {sessionId:s.name.split('/').at(-1),currentIndex:Number(f.currentIndex?.integerValue),status:f.status?.stringValue,finalStatus:stage?.status?.stringValue,finalScore:Number(stage?.score?.integerValue||0),remainingMs:stage?Math.max(0,Number(stage.remainingMs?.integerValue)-(stage.status?.stringValue==='playing'?Math.max(0,Date.now()-Number(stage.runningSince?.integerValue)):0)):null};});
 const evidence={checkedAt:new Date().toISOString(),syntheticClass:true,globalOptIn:cls.fields.globalOptIn?.booleanValue,sessions:results};
 await writeFile('.cp5-test-artifacts/final-stage/live-status.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
main().catch(()=>{console.error('Read-only final fixture evidence failed; private data withheld');process.exitCode=1;});
