// Read-only snapshot before enabling immediate enrollment and student management.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
async function main(){
  const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
  auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
  const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
  const base='/v1/projects/math3-dev/databases/(default)/documents';
  async function rows(path){let pageToken,documents=[];do{const qs=new URLSearchParams({pageSize:'200',...(pageToken?{pageToken}:{})});const r=await api.get(`${base}/${path}?${qs}`);documents.push(...(r.body.documents||[]));pageToken=r.body.nextPageToken;}while(pageToken);return documents;}
  const collections=['classes','studentBindings','joinRequests','boardCounts','sheetJobs'];
  const snapshot=Object.fromEntries(await Promise.all(collections.map(async c=>[c,await rows(c)])));
  snapshot.classStudents=Object.fromEntries(await Promise.all(snapshot.classes.map(async c=>{const id=c.name.split('/').at(-1);return[id,await rows(`classes/${id}/students`)];})));
  const dir='.cp5-test-artifacts/student-admin-20261013';await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/before.json`,JSON.stringify({projectId:'math3-dev',createdAt:new Date().toISOString(),snapshot},null,2),{flag:'wx'});
  console.log(JSON.stringify({backupSaved:true,projectId:'math3-dev',classes:snapshot.classes.length,students:Object.values(snapshot.classStudents).reduce((n,r)=>n+r.length,0)}));
}
main().catch(()=>{console.error('Student administration backup failed; database data not printed');process.exitCode=1;});
