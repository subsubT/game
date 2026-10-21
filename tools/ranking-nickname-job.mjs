// Temporary scheduled maintenance, never exposed as a public API.
import {createHmac} from 'node:crypto';
export async function migrateRankingNicknames(db,secret){
  const marker=db.doc('maintenance/rankingNickname20261021');
  const queued=await marker.get();
  if(queued.data()?.status!=='pending')return;
  await db.runTransaction(async tx=>{
    const job=await tx.get(marker);
    if(job.data()?.status!=='pending')return;
    const paths=job.data().studentPaths;
    if(!Array.isArray(paths)||paths.length>200)throw Error('Maintenance student bound reached');
    const students=await Promise.all(paths.map(path=>tx.get(db.doc(path))));
    const refs=[];
    for(let i=0;i<students.length;i++){
      const s=students[i].data(),p=paths[i].split('/');
      if(p.length!==4||p[0]!=='classes'||p[2]!=='students')throw Error('Invalid maintenance path');
      if(s?.status!=='active')continue;
      const nickname=s.privateName||s.classAlias;
      if(!nickname)throw Error('Missing nickname');
      for(const key of Object.keys(s.bestScores||{})){
        const opaque=createHmac('sha256',secret).update(p[1]+':'+p[3]+':'+key).digest('hex').slice(0,32);
        for(const path of ['classBoards/'+p[1]+':'+key+'/entries/'+p[3],'globalBoards/'+key+'/entries/'+opaque])refs.push({ref:db.doc(path),nickname,studentPath:paths[i]});
      }
    }
    if(refs.length>400)throw Error('Maintenance rank bound reached');
    const snapshots=await Promise.all(refs.map(r=>tx.get(r.ref))),matched=[];
    for(let i=0;i<refs.length;i++)if(snapshots[i].exists){
      const r=refs[i];matched.push({path:r.ref.path,studentPath:r.studentPath});
    }
    if(matched.length!==job.data().expectedEntries)throw Error('Maintenance entry coverage mismatch');
    for(let i=0;i<refs.length;i++)if(snapshots[i].exists&&snapshots[i].data().displayAlias!==refs[i].nickname)tx.update(refs[i].ref,{displayAlias:refs[i].nickname});
    tx.update(marker,{status:'complete',matched,completedAt:new Date().toISOString()});
  });
}
