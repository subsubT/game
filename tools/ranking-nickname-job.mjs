// Temporary scheduled maintenance, never exposed as a public API.
import {createHmac} from 'node:crypto';
export async function migrateRankingNicknames(db,secret){
  const marker=db.doc('maintenance/rankingNickname20261021');
  if((await marker.get()).data()?.status==='complete')return;
  const classes=await db.collection('classes').limit(200).get();
  if(classes.size===200)throw Error('Maintenance class bound reached');
  const matched=[];
  for(const cls of classes.docs){
    const students=await db.collection(`classes/${cls.id}/students`).where('status','==','active').limit(200).get();
    if(students.size===200)throw Error('Maintenance student bound reached');
    for(const row of students.docs){
      const studentRef=db.doc(`classes/${cls.id}/students/${row.id}`);
      const entries=await db.runTransaction(async tx=>{
        const student=await tx.get(studentRef),s=student.data();
        if(s?.status!=='active')return [];
        const nickname=s.privateName||s.classAlias;
        if(!nickname)throw Error('Missing nickname');
        const keys=Object.keys(s.bestScores||{});
        if(keys.length>100)throw Error('Maintenance season bound reached');
        const refs=keys.flatMap(key=>{
          const opaque=createHmac('sha256',secret).update(`${cls.id}:${row.id}:${key}`).digest('hex').slice(0,32);
          return [db.doc(`classBoards/${cls.id}:${key}/entries/${row.id}`),db.doc(`globalBoards/${key}/entries/${opaque}`)];
        });
        const snapshots=await Promise.all(refs.map(ref=>tx.get(ref))),matched=[];
        for(let i=0;i<refs.length;i++)if(snapshots[i].exists){
          if(snapshots[i].data().displayAlias!==nickname)tx.update(refs[i],{displayAlias:nickname});
          matched.push({path:refs[i].path,studentPath:studentRef.path});
        }
        return matched;
      });
      matched.push(...entries);
    }
  }
  await db.runTransaction(async tx=>{await tx.get(marker);tx.set(marker,{status:'complete',matched,completedAt:new Date().toISOString()});});
}
