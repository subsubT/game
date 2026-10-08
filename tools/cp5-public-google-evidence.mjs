// Restricted to the documented synthetic fixture. Never print credentials.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
class EvidenceError extends Error {}
const check=(ok,reason)=>{if(!ok)throw new EvidenceError(reason);};
async function main(){
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
const base='/v1/projects/math3-dev/databases/(default)/documents',classId='96f09e79e62f14d98c7836f5530f91d0',teacherId='08e9014175c48979decec823f71a70f3';
const file='.cp5-test-artifacts/final/public-google-baseline.json',mode=process.argv[2];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function doc(path){const r=await api.get(base+'/'+path,{resolveOnHTTPError:true});return r.status===404?null:r.body;}
async function rows(path){const r=await api.get(base+'/'+path+'?pageSize=200');check(!r.body.nextPageToken,'Fixture exceeds evidence limit');return(r.body.documents||[]).sort((a,b)=>a.name.localeCompare(b.name));}
async function state(){
 const cls=await doc('classes/'+classId);check(cls.fields.privateLabel.stringValue==='CP5일반검증반','Fixture label mismatch');check(cls.fields.ownerTeacherId.stringValue===teacherId,'Fixture owner mismatch');
 const [connection,exp,job,teacher,students,sessions]=await Promise.all([doc('sheetConnections/'+teacherId),doc('sheetExports/'+classId),doc('sheetJobs/'+classId),doc('teachers/'+teacherId),rows('classes/'+classId+'/students'),rows('classes/'+classId+'/sessions')]);
 return{checkedAt:new Date().toISOString(),class:cls,connection,export:exp,job,teacher,students,sessions};
}
const current=await state();
if(mode==='baseline'){
 await writeFile(file,JSON.stringify(current,null,2),{flag:'wx'});
 console.log(JSON.stringify({backupSaved:true,testClassConfirmed:true,students:current.students.length,sessions:current.sessions.length,teacherIdConfirmed:true,connected:current.connection?.fields.status.stringValue==='connected',exportStatus:current.export?.fields.status.stringValue}));
}else if(['disconnected','restored'].includes(mode)){
 const before=JSON.parse(await readFile(file,'utf8'));
 check(hash(current.class)===hash(before.class),'Original class changed');check(hash(current.students)===hash(before.students),'Original students changed');check(hash(current.sessions)===hash(before.sessions),'Canonical sessions changed');check(current.export.fields.spreadsheetId.stringValue===before.export.fields.spreadsheetId.stringValue,'Spreadsheet identity changed');
 if(mode==='disconnected')check(current.connection===null,'Connection is still present');else{check(current.connection.fields.status.stringValue==='connected','Connection is not restored');check(current.export.fields.status.stringValue==='synced','Export is not synced');check(Date.parse(current.connection.fields.connectedAt.stringValue)>Date.parse(before.connection.fields.connectedAt.stringValue),'New OAuth connection not observed');}
 const evidence={checkedAt:new Date().toISOString(),mode,teacherIdPreserved:true,classPreserved:true,originalStudentsUnchanged:true,canonicalSessionsUnchanged:true,sameSpreadsheet:true,connectionDeleted:!current.connection,encryptedCredentialPresent:!!current.connection&&/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(current.connection.fields.refreshCipher.stringValue),connectedAt:current.connection?.fields.connectedAt?.stringValue,lastSyncedAt:current.export?.fields.lastSyncedAt?.stringValue,students:current.students.length,sessions:current.sessions.length};
 await writeFile('.cp5-test-artifacts/final/public-google-'+mode+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}else throw new EvidenceError('Unknown evidence mode');
}
// Never dump database documents, credentials, API exceptions or assertion diffs.
main().catch(error=>{console.error(JSON.stringify({evidenceFailure:true,reason:error instanceof EvidenceError?error.message:'Authenticated evidence read failed'}));process.exitCode=1;});
