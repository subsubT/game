// Reversible fault injection restricted to the explicitly created development fixture.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
const api=new (require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
const base='/v1/projects/math3-dev/databases/(default)/documents';
const classId='96f09e79e62f14d98c7836f5530f91d0',teacherId='08e9014175c48979decec823f71a70f3';
const exp=base+'/sheetExports/'+classId,conn=base+'/sheetConnections/'+teacherId;
const session=base+'/classes/'+classId+'/sessions/81a98032f62697637edbedd09869e1e4';
const backup='.cp5-test-artifacts/failure-fixture-backup.json',mode=process.argv[2];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
if(mode==='fail'){
 const e=(await api.get(exp+'?mask.fieldPaths=spreadsheetId&mask.fieldPaths=ownerTeacherId')).body;
 assert.equal(e.fields.ownerTeacherId.stringValue,teacherId);
 const ledger=(await api.get(session)).body;
 await writeFile(backup,JSON.stringify({spreadsheetId:e.fields.spreadsheetId.stringValue,ledgerHash:digest(ledger)},null,2));
 await api.patch(exp+'?updateMask.fieldPaths=spreadsheetId',{fields:{spreadsheetId:{stringValue:'cp5_nonexistent_test_sheet'}}});
 console.log('Test fixture backup saved; reversible Google 404 fault enabled');
}else if(mode==='checkpoint'){
 const b=JSON.parse(await readFile(backup,'utf8'));b.ledgerHash=digest((await api.get(session)).body);await writeFile(backup,JSON.stringify(b,null,2));console.log('Canonical ledger baseline recorded before explicit Google error request');
}else if(mode==='restore'){
 const b=JSON.parse(await readFile(backup,'utf8'));
 await api.patch(exp+'?updateMask.fieldPaths=spreadsheetId',{fields:{spreadsheetId:{stringValue:b.spreadsheetId}}});console.log('Original test spreadsheet reference restored');
}else if(mode==='check'){
 const b=JSON.parse(await readFile(backup,'utf8')),e=(await api.get(exp+'?mask.fieldPaths=status&mask.fieldPaths=errorCode')).body;
 assert.equal(digest((await api.get(session)).body),b.ledgerHash);
 console.log(JSON.stringify({priorLedgerUnchanged:true,exportStatus:e.fields.status?.stringValue,errorCode:e.fields.errorCode?.stringValue}));
}else if(mode==='reauth'||mode==='restore-connection'){
 // Change only the status of our fixture; keep its encrypted credential intact.
 if(mode==='reauth'){const before=(await api.get(conn+'?mask.fieldPaths=status')).body;assert.equal(before.fields.status.stringValue,'connected');await writeFile('.cp5-test-artifacts/connection-status-backup.json',JSON.stringify(before));}
 await api.patch(conn+'?updateMask.fieldPaths=status',{fields:{status:{stringValue:mode==='reauth'?'reauth':'connected'}}});console.log('Test connection status: '+(mode==='reauth'?'reauth':'connected'));
}else throw Error('Unsupported test mode');
