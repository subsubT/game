// Restricted to the documented synthetic fixture. Never print credentials.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
const base='/v1/projects/math3-dev/databases/(default)/documents',classId='96f09e79e62f14d98c7836f5530f91d0',teacherId='08e9014175c48979decec823f71a70f3';
const file='.cp5-test-artifacts/final/public-google-baseline.json',mode=process.argv[2];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function doc(path){const r=await api.get(base+'/'+path,{resolveOnHTTPError:true});return r.status===404?null:r.body;}
async function rows(path){const r=await api.get(base+'/'+path+'?pageSize=200');assert.ok(!r.body.nextPageToken,'Fixture unexpectedly exceeds evidence limit');return(r.body.documents||[]).sort((a,b)=>a.name.localeCompare(b.name));}
async function state(){
 const cls=await doc('classes/'+classId);assert.equal(cls.fields.privateLabel.stringValue,'CP5일반검증반');assert.equal(cls.fields.ownerTeacherId.stringValue,teacherId);
 const [connection,exp,job,teacher,students,sessions]=await Promise.all([doc('sheetConnections/'+teacherId),doc('sheetExports/'+classId),doc('sheetJobs/'+classId),doc('teachers/'+teacherId),rows('classes/'+classId+'/students'),rows('classes/'+classId+'/sessions')]);
 return{checkedAt:new Date().toISOString(),class:cls,connection,export:exp,job,teacher,students,sessions};
}
const current=await state();
if(mode==='baseline'){
 await writeFile(file,JSON.stringify(current,null,2),{flag:'wx'});
 console.log(JSON.stringify({backupSaved:true,testClassConfirmed:true,students:current.students.length,sessions:current.sessions.length,teacherIdConfirmed:true,connected:current.connection?.fields.status.stringValue==='connected',exportStatus:current.export?.fields.status.stringValue}));
}else if(['disconnected','restored'].includes(mode)){
 const before=JSON.parse(await readFile(file,'utf8'));
 assert.equal(hash(current.students),hash(before.students),'Original students changed');assert.equal(hash(current.sessions),hash(before.sessions),'Canonical sessions changed');assert.equal(current.export.fields.spreadsheetId.stringValue,before.export.fields.spreadsheetId.stringValue,'Spreadsheet identity changed');
 if(mode==='disconnected')assert.ok(current.connection===null,'Connection is still present');else{assert.equal(current.connection.fields.status.stringValue,'connected');assert.equal(current.export.fields.status.stringValue,'synced');}
 const evidence={checkedAt:new Date().toISOString(),mode,teacherIdPreserved:true,classPreserved:true,originalStudentsUnchanged:true,canonicalSessionsUnchanged:true,sameSpreadsheet:true,connectionDeleted:!current.connection,encryptedCredentialPresent:!!current.connection&&/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(current.connection.fields.refreshCipher.stringValue),connectedAt:current.connection?.fields.connectedAt?.stringValue,lastSyncedAt:current.export?.fields.lastSyncedAt?.stringValue,students:current.students.length,sessions:current.sessions.length};
 await writeFile('.cp5-test-artifacts/final/public-google-'+mode+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}else throw Error('Unknown evidence mode');
