import { createHandlers } from './generated-handlers.js';
export async function finalizeOfflineStages(db,secret,clock=Date.now) {
  const timers=await db.collection('activeFinalStages').orderBy('deadlineAt').limit(20).get();
  const handlers=createHandlers(db,secret);
  for(const timer of timers.docs)if(timer.data().deadlineAt<=clock())await handlers.finalizeOfflineStage(timer.data().classId,timer.data().sessionId);
}
