// Read-only operational backup. No database documents or credentials in output.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
async function main(){
  const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth.js'),opts={project:'math3-dev',nonInteractive:true};
  auth.setActiveAccount(opts,auth.selectAccount(undefined,process.cwd()));await require('firebase-tools/lib/requireAuth.js').requireAuth(opts);
  const api=new(require('firebase-tools/lib/apiv2.js').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
  const base='/v1/projects/math3-dev/databases/(default)/documents';
  async function rows(collection){let pageToken,documents=[];do{const qs=new URLSearchParams({pageSize:'200',...(pageToken?{pageToken}:{})});const r=await api.get(`${base}/${collection}?${qs}`);documents.push(...(r.body.documents||[]));pageToken=r.body.nextPageToken;}while(pageToken);return documents;}
  const [classes,joinCodes]=await Promise.all([rows('classes'),rows('joinCodes')]);
  const dir='.cp5-test-artifacts/join-code-20261013';await mkdir(dir,{recursive:true});
  await writeFile(dir+'/before.json',JSON.stringify({projectId:'math3-dev',createdAt:new Date().toISOString(),classes,joinCodes},null,2),{flag:'wx'});
  console.log(JSON.stringify({backupSaved:true,projectId:'math3-dev',classes:classes.length,joinCodes:joinCodes.length}));
}
main().catch(()=>{console.error('Join-code backup failed; database data not printed');process.exitCode=1;});
