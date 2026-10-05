// Read-only development evidence. Never fetch or print plaintext Google credentials.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const auth=require('firebase-tools/lib/auth.js');
const options={project:'math3-dev',nonInteractive:true};
auth.setActiveAccount(options,auth.selectAccount(undefined,process.cwd()));
await require('firebase-tools/lib/requireAuth.js').requireAuth(options);
const client=new (require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
const base='/v1/projects/math3-dev/databases/(default)/documents';
if(process.argv[2]==='states'){
 const result=await client.post(base+':runQuery',{structuredQuery:{from:[{collectionId:'googleOAuthStates'}],where:{fieldFilter:{field:{fieldPath:'teacherId'},op:'EQUAL',value:{stringValue:'08e9014175c48979decec823f71a70f3'}}},select:{fields:['expiresAt','used','started'].map(fieldPath=>({fieldPath}))}}});
 const states=(result.body||[]).filter(r=>r.document).map(({document:d})=>({expiresAt:new Date(Number(d.fields.expiresAt.integerValue)).toISOString(),expired:Number(d.fields.expiresAt.integerValue)<=Date.now(),used:d.fields.used?.booleanValue,started:d.fields.started?.booleanValue})).sort((a,b)=>b.expiresAt.localeCompare(a.expiresAt));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),states:states.slice(0,3)}));process.exit(0);
}
const fields=['status','connectedAt','epoch','scopes','refreshCipher'];
const result=await client.post(base+':runQuery',{structuredQuery:{from:[{collectionId:'sheetConnections'}],select:{fields:fields.map(fieldPath=>({fieldPath}))}}});
const rows=(result.body||[]).filter(r=>r.document).map(({document:d})=>{
 const f=d.fields||{},cipher=f.refreshCipher?.stringValue;
 return {teacherId:d.name.split('/').at(-1),status:f.status?.stringValue,connectedAt:f.connectedAt?.stringValue,encryptedCredentialPresent:typeof cipher==='string'&&/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(cipher),scopes:(f.scopes?.arrayValue?.values||[]).map(v=>v.stringValue)};
});
const evidence={checkedAt:new Date().toISOString(),project:'math3-dev',connections:rows};
await mkdir('.cp5-test-artifacts',{recursive:true});
await writeFile('.cp5-test-artifacts/server-connection-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
