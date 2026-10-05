// Development-only evidence, containing identifiers/counts but never credentials.
import { getApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const key='math3-cp5-preview-baseline';
const badge=document.createElement('p');badge.id='cp5-check';badge.setAttribute('role','status');badge.style.cssText='padding:12px;text-align:center';document.body.append(badge);
async function call(name,data={}){
  const user=getAuth(getApp('math3-teacher')).currentUser;
  const token=await user.getIdToken();
  const response=await fetch(globalThis.MATH3_FIREBASE_CONFIG.workerApiOrigin+'/api/'+name,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({data})});
  const json=await response.json();if(!response.ok)throw Error(json.error?.code||'REQUEST_FAILED');return json.result;
}
let busy=false,done=false;
setInterval(async()=>{
  if(busy||done)return;busy=true;
  try{
    const user=getAuth(getApp('math3-teacher')).currentUser;if(!user)return;
    let before=JSON.parse(sessionStorage.getItem(key)||'null');
    if(before&&user.isAnonymous){badge.textContent='개발 검증: Google 연결 전 익명 교사·학급 기준 기록 완료';return;}
    const classes=(await call('listClasses')).classes;
    if(!classes.length)return;
    const space=await call('createTeacherSpace',{requestId:crypto.randomUUID()});
    if(!before&&user.isAnonymous){before={uid:user.uid,teacherId:space.teacherId,classIds:classes.map(c=>c.classId)};sessionStorage.setItem(key,JSON.stringify(before));}
    if(before&&!user.isAnonymous){
      const preserved=before.uid===user.uid&&before.teacherId===space.teacherId&&before.classIds.every(id=>classes.some(c=>c.classId===id));
      badge.textContent=preserved?'개발 검증: Google 로그인 후 uid·교사·학급 유지 PASS':'개발 검증: 식별자 유지 확인 실패';
      badge.dataset.identity=preserved?'pass':'fail';
      done=true;
    }else badge.textContent='개발 검증: Google 연결 전 익명 교사·학급 기준 기록 완료';
  }catch{}finally{busy=false;}
},10000);
