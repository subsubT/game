import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const site='https://subsubt.github.io/game/',files=['index.html','1math1.html','1math2.html','1math3.html','teacher/index.html','teacher/dashboard.js','teacher/dashboard.css','src/student/1math3.bundle.js','src/student/1math3.css','firebase-config.js','1math2-config.json'];
const hash=x=>createHash('sha256').update(x).digest('hex'),checks=[];
async function main(){
 for(const name of files){const r=await fetch(site+name);if(r.status!==200)throw Error('Public asset unavailable');const bytes=Buffer.from(await r.arrayBuffer()),local=await readFile('dist-pages/'+name);
  const legacy=['index.html','1math1.html','1math2.html'].includes(name);
  if(legacy){const before=execFileSync('git',['show','90c944b:'+name]);if(hash(bytes)!==hash(before))throw Error('Legacy published bytes changed');}
  else if(bytes.toString('utf8').replaceAll('\r\n','\n')!==local.toString('utf8').replaceAll('\r\n','\n'))throw Error('Published asset mismatch');
  checks.push({file:name,status:200,localMatches:true,legacyBytesPreserved:legacy});
 }
 for(const name of ['worker/src/final-stage-jobs.js','src/games/1math3/final-stage.js','functions/lib/final-stage.js','docs/FINAL_STAGE_RELEASE.md','tools/final-stage-security.mjs','.cp5-test-artifacts/final-stage/firestore-before.json','.env.local']){const r=await fetch(site+name);await r.arrayBuffer();if(r.status!==404)throw Error('Private path published');}
 await writeFile('.cp5-test-artifacts/final-stage/public-assets.json',JSON.stringify({checks,excludedPaths404:true,checkedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({publicAssets:'PASS',matched:checks.length,oldThreeGamesByteIdentical:true,excludedPaths404:true}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
