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
const repeat=document.createElement('button');repeat.textContent='개발 검증: 관리표 생성 반복';document.body.append(repeat);
const repeatStatus=document.createElement('p');repeatStatus.id='cp5-repeat-status';repeatStatus.setAttribute('role','status');document.body.append(repeatStatus);
repeat.addEventListener('click',async()=>{
 repeat.disabled=true;
 try{
  const classes=(await call('listClasses')).classes;
  const cls=classes.find(c=>c.classId==='96f09e79e62f14d98c7836f5530f91d0');if(!cls)throw Error('TEST_CLASS_NOT_FOUND');
  const before=await call('getGoogleConnectionStatus',{classId:cls.classId});
  await call('createOrSelectSheet',{classId:cls.classId});
  await call('createOrSelectSheet',{classId:cls.classId});
  const after=await call('getGoogleConnectionStatus',{classId:cls.classId});
  repeatStatus.textContent=before.sheet?.url===after.sheet?.url&&after.sheet?.status==='synced'?'개발 검증: 반복 생성 동일 파일 PASS':'개발 검증: '+JSON.stringify({sameFile:before.sheet?.url===after.sheet?.url,status:after.sheet?.status});
 }catch(error){repeatStatus.textContent='개발 검증: '+error.message;}finally{repeat.disabled=false;}
});
const disconnect=document.createElement('button');disconnect.textContent='개발 검증: 연결 해제 실행';document.body.append(disconnect);
disconnect.addEventListener('click',async()=>{
 disconnect.disabled=true;
 try{
  const classes=(await call('listClasses')).classes;
  if(!classes.some(c=>c.classId==='96f09e79e62f14d98c7836f5530f91d0'))throw Error('TEST_CLASS_NOT_FOUND');
  const result=await call('disconnectSheets');
  const after=await call('getGoogleConnectionStatus',{classId:'96f09e79e62f14d98c7836f5530f91d0'});
  repeatStatus.textContent=JSON.stringify({disconnected:!after.connected,oldUrlHidden:after.sheet===null,revocationPending:result.revocationPending});
 }catch(error){repeatStatus.textContent='개발 검증: '+error.message;}finally{disconnect.disabled=false;}
});
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
