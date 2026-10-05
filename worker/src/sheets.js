import { ApiError } from './error.js';
import { opaque, sha256, seal, unseal, pkceChallenge, verifyGoogleIdToken, validEncryptionKey } from './google-crypto.js';
import { GoogleApi, GOOGLE_SCOPES, START_PATH, CALLBACK_PATH } from './google-api.js';
import { buildTables } from './sheet-data.js';

export const sheetHandlerNames = Object.freeze(['beginGoogleConnection','getGoogleConnectionStatus','disconnectSheets','createOrSelectSheet','syncSheet']);
const fail = code => { throw new ApiError(code); };
const id = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : fail('INVALID_REQUEST');
const fields = (data, names) => { if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k=>!names.includes(k))) fail('INVALID_REQUEST'); };
const cookie = (value, age = 600) => `__Host-math3-oauth=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const safeHeaders = { 'cache-control':'no-store', 'referrer-policy':'no-referrer', 'content-security-policy':"default-src 'none'; frame-ancestors 'none'", 'x-content-type-options':'nosniff' };
const redirect = (location, cookies) => new Response(null, { status:303, headers:{ ...safeHeaders, location, ...(cookies ? { 'set-cookie':cookies } : {}) } });

export function createSheetService(db, env, deps = {}) {
  const clock = deps.clock || Date.now, api = deps.googleApi || new GoogleApi(env, deps.fetcher), verifyIdentity = deps.verifyGoogleIdentity || verifyGoogleIdToken;
  const now = () => new Date(clock()).toISOString();
  const stateRef = value => db.doc(`googleOAuthStates/${sha256(value)}`);
  const connectionRef = teacherId => db.doc(`sheetConnections/${teacherId}`);
  const context = (who, purpose = 'refresh') => `math3:google:v1:${purpose}:${who.teacherId}:${who.epoch}`;
  function configured() {
    try {
      const callback = new URL(env.GOOGLE_REDIRECT_URI), dashboard = new URL(env.GOOGLE_DASHBOARD_URL);
      const origins = (env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim());
      return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && validEncryptionKey(env.GOOGLE_TOKEN_ENCRYPTION_KEY) &&
        callback.protocol === 'https:' && callback.pathname === CALLBACK_PATH && !callback.search && !callback.hash && !callback.username && !callback.password &&
        dashboard.protocol === 'https:' && dashboard.pathname === '/game/teacher/index.html' && !dashboard.search && !dashboard.hash && !dashboard.username && !dashboard.password && origins.includes(dashboard.origin));
    } catch { return false; }
  }
  function configurationError() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) return 'GOOGLE_SECRET_MISSING';
    if (!validEncryptionKey(env.GOOGLE_TOKEN_ENCRYPTION_KEY)) return 'GOOGLE_ENCRYPTION_KEY_FORMAT';
    return configured() ? null : 'GOOGLE_URL_CONFIGURATION';
  }
  const needConfig = () => { if (!configured()) throw new ApiError('GOOGLE_NOT_CONFIGURED', undefined, 503); };
  async function teacher(uid, tx) {
    const read = ref => tx ? tx.get(ref) : ref.get();
    const binding = await read(db.doc(`teacherBindings/${uid}`));
    if (!binding.exists || !binding.data().active) fail('FORBIDDEN');
    const { teacherId, epoch } = binding.data(), space = await read(db.doc(`teachers/${teacherId}`));
    if (!space.exists || space.data().status !== 'active' || space.data().authEpoch !== epoch) fail('FORBIDDEN');
    return { teacherId, epoch, uid, space: space.data() };
  }
  async function owned(who, classId, tx) {
    const ref = db.doc(`classes/${id(classId)}`), snap = await (tx ? tx.get(ref) : ref.get());
    if (!snap.exists || snap.data().ownerTeacherId !== who.teacherId) fail('FORBIDDEN');
    return snap.data();
  }
  const validConnection = (c, who) => c?.epoch === who.epoch && c?.status === 'connected' && c?.refreshCipher;
  async function connection(who) {
    const ref = connectionRef(who.teacherId), snap = await ref.get(), c = snap.data();
    if (c && c.epoch !== who.epoch) {
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.exists && current.data().epoch !== who.epoch) tx.delete(ref);
      });
      fail('REAUTH_REQUIRED');
    }
    if (!validConnection(c, who)) fail(c?.status === 'reauth' ? 'REAUTH_REQUIRED' : 'GOOGLE_NOT_CONNECTED');
    return c;
  }
  async function checkConnection(who, version, lease) {
    // Batch the fence checks to keep Google creation + export within the Free
    // Worker subrequest budget. Each external side effect rechecks this fence.
    const refs = [db.doc(`teacherBindings/${who.uid}`),db.doc(`teachers/${who.teacherId}`),connectionRef(who.teacherId)];
    if(lease)refs.push(db.doc(`sheetExports/${lease.classId}`));
    const [binding,space,conn,exp] = await db.getAll(...refs), b=binding.data(), s=space.data(), c=conn.data();
    if(!b?.active||b.teacherId!==who.teacherId||b.epoch!==who.epoch||s?.status!=='active'||s.authEpoch!==who.epoch)fail('FORBIDDEN');
    if(!validConnection(c,who)||c.version!==version)fail('REAUTH_REQUIRED');
    if(lease&&(exp.data()?.lease!==lease.value||exp.data()?.leaseUntil<=clock()))fail('SYNC_BUSY');
    return c;
  }
  async function markReauth(who, c) {
    await db.runTransaction(async tx => {
      const ref = connectionRef(who.teacherId), snap = await tx.get(ref);
      if (snap.data()?.version === c.version) tx.set(ref, { epoch:who.epoch, version:c.version, subject:c.subject, status:'reauth', connectedAt:c.connectedAt });
    });
  }
  async function access(who, c) {
    try {
      const token = await api.refresh(unseal(c.refreshCipher, env.GOOGLE_TOKEN_ENCRYPTION_KEY, context(who)));
      if (token.scope && !GOOGLE_SCOPES.every(s=>token.scope.split(' ').includes(s))) fail('REAUTH_REQUIRED');
      if (token.refresh_token) {
        const cipher = seal(token.refresh_token,env.GOOGLE_TOKEN_ENCRYPTION_KEY,context(who));
        await db.runTransaction(async tx=>{ const ref=connectionRef(who.teacherId), snap=await tx.get(ref); if(snap.data()?.version===c.version)tx.update(ref,{refreshCipher:cipher}); else fail('REAUTH_REQUIRED'); });
      }
      await checkConnection(who,c.version);
      return token.access_token;
    } catch(error) { if(error.code==='REAUTH_REQUIRED')await markReauth(who,c); throw error; }
  }
  async function beginGoogleConnection(data, uid, claims = {}) {
    fields(data,['returnUrl']); needConfig(); const who = await teacher(uid);
    if (data.returnUrl !== undefined && data.returnUrl !== env.GOOGLE_DASHBOARD_URL) fail('INVALID_RETURN_URL');
    const state = opaque(), launch = opaque(), verifier = opaque(), nonce = opaque(), attempt = opaque();
    const expectedSubject = claims.firebase?.identities?.['google.com']?.[0] || null;
    await db.runTransaction(async tx=>{
      const current=await teacher(uid,tx);
      if(current.space.googleOAuthAfter>clock())fail('RATE_LIMITED');
      tx.update(db.doc(`teachers/${who.teacherId}`),{googleOAuthAttempt:attempt,googleOAuthAfter:clock()+10000});
      tx.create(stateRef(state),{teacherId:who.teacherId,uid,epoch:who.epoch,attempt,expectedSubject,expiresAt:clock()+600000,returnUrl:env.GOOGLE_DASHBOARD_URL,used:false,started:false,payloadCipher:seal(JSON.stringify({state,verifier,nonce}),env.GOOGLE_TOKEN_ENCRYPTION_KEY,context(who,'state'))});
      tx.create(db.doc(`googleOAuthLaunches/${sha256(launch)}`),{stateHash:sha256(state),expiresAt:clock()+600000,used:false});
    });
    return { authorizationUrl:`${new URL(env.GOOGLE_REDIRECT_URI).origin}${START_PATH}?ticket=${launch}` };
  }
  async function start(request) {
    needConfig(); const ticket=new URL(request.url).searchParams.get('ticket');
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket||''))fail('OAUTH_STATE_INVALID');
    const browserKey=opaque();
    const state=await db.runTransaction(async tx=>{
      const launchRef=db.doc(`googleOAuthLaunches/${sha256(ticket)}`), launch=await tx.get(launchRef);
      if(!launch.exists||launch.data().used||launch.data().expiresAt<=clock())fail('OAUTH_STATE_INVALID');
      const ref=db.doc(`googleOAuthStates/${launch.data().stateHash}`), snap=await tx.get(ref), s=snap.data();
      if(!s||s.used||s.started||s.expiresAt<=clock())fail('OAUTH_STATE_INVALID');
      const who=await teacher(s.uid,tx); if(who.epoch!==s.epoch||who.space.googleOAuthAttempt!==s.attempt)fail('OAUTH_STATE_INVALID');
      tx.update(launchRef,{used:true}); tx.update(ref,{started:true,browserHash:sha256(browserKey)}); return s;
    });
    const payload=JSON.parse(unseal(state.payloadCipher,env.GOOGLE_TOKEN_ENCRYPTION_KEY,context(state,'state')));
    const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'false',state:payload.state,nonce:payload.nonce,code_challenge:pkceChallenge(payload.verifier),code_challenge_method:'S256'});
    return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`,cookie(browserKey));
  }
  async function callback(request) {
    needConfig(); const url=new URL(request.url), raw=url.searchParams.get('state');
    if(url.searchParams.getAll('state').length!==1||!/^[-\w]{43}$/.test(raw||''))fail('OAUTH_STATE_INVALID');
    const browser=/\b__Host-math3-oauth=([-\w]{43})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
    const s=await db.runTransaction(async tx=>{
      const ref=stateRef(raw), snap=await tx.get(ref), state=snap.data();
      if(!state||state.used||!state.started||state.expiresAt<=clock()||!browser||state.browserHash!==sha256(browser)||state.returnUrl!==env.GOOGLE_DASHBOARD_URL)fail('OAUTH_STATE_INVALID');
      const who=await teacher(state.uid,tx); if(who.epoch!==state.epoch||who.space.googleOAuthAttempt!==state.attempt)fail('OAUTH_STATE_INVALID');
      const code=url.searchParams.get('code');
      if(!url.searchParams.has('error')) {
        if(url.searchParams.getAll('code').length!==1||typeof code!=='string'||!code||code.length>4096)fail('OAUTH_CODE_INVALID');
        const codeRef=db.doc(`googleOAuthCodes/${sha256(code)}`); if((await tx.get(codeRef)).exists)fail('OAUTH_CODE_REPLAY');
        tx.create(codeRef,{expiresAt:clock()+86400000});
      }
      // Consume before exchanging. Network failure requires a fresh authorization.
      tx.set(ref,{teacherId:state.teacherId,uid:state.uid,epoch:state.epoch,used:true,expiresAt:state.expiresAt}); return state;
    });
    let tokens;
    try {
      if(url.searchParams.has('error'))fail('GOOGLE_CONSENT_DENIED');
      const payload=JSON.parse(unseal(s.payloadCipher,env.GOOGLE_TOKEN_ENCRYPTION_KEY,context(s,'state')));
      tokens=await api.exchange(url.searchParams.get('code'),payload.verifier);
      const subject=await verifyIdentity(tokens.id_token,env.GOOGLE_CLIENT_ID,payload.nonce,deps.fetcher,clock);
      if(s.expectedSubject&&subject!==s.expectedSubject)fail('GOOGLE_ACCOUNT_MISMATCH');
      if(!tokens.refresh_token||!GOOGLE_SCOPES.every(scope=>(tokens.scope||'').split(' ').includes(scope)))fail('REAUTH_REQUIRED');
      const version=opaque(), ref=connectionRef(s.teacherId), subjectRef=db.doc(`googleSubjects/${sha256(subject)}`);
      const cipher=seal(tokens.refresh_token,env.GOOGLE_TOKEN_ENCRYPTION_KEY,context(s));
      await db.runTransaction(async tx=>{
        const who=await teacher(s.uid,tx), owner=await tx.get(subjectRef), previous=await tx.get(ref);
        if(who.epoch!==s.epoch||who.space.googleOAuthAttempt!==s.attempt)fail('OAUTH_STATE_INVALID');
        if(owner.exists&&owner.data().teacherId!==s.teacherId)fail('GOOGLE_ACCOUNT_CONFLICT');
        if(previous.data()?.subject&&previous.data().subject!==subject)fail('GOOGLE_ACCOUNT_MISMATCH');
        tx.set(subjectRef,{teacherId:s.teacherId});
        tx.set(ref,{epoch:s.epoch,version,subject,status:'connected',scopes:GOOGLE_SCOPES,refreshCipher:cipher,connectedAt:now()});
      });
      return redirect(`${s.returnUrl}#sheets=connected`,cookie('',0));
    } catch(error) {
      // Do not revoke a just-issued grant on a collision: it could invalidate the
      // existing legitimate teacher's grant too. Discard it from this process.
      const code=['GOOGLE_ACCOUNT_CONFLICT','GOOGLE_ACCOUNT_MISMATCH','REAUTH_REQUIRED','GOOGLE_CONSENT_DENIED'].includes(error.code)?error.code:'GOOGLE_CONNECTION_FAILED';
      return redirect(`${s.returnUrl}#sheets=${code}`,cookie('',0));
    }
  }
  async function getGoogleConnectionStatus(data,uid) {
    fields(data,['classId']); const who=await teacher(uid), c=(await connectionRef(who.teacherId).get()).data();
    const connected=Boolean(validConnection(c,who)), reauth=Boolean(c&&(!connected||c.epoch!==who.epoch));
    let sheet=null;
    if(data.classId!==undefined) {
      await owned(who,data.classId); const exp=(await db.doc(`sheetExports/${data.classId}`).get()).data();
      if(connected&&exp?.ownerTeacherId===who.teacherId&&exp.subject===c.subject){
        const interrupted=exp.status==='syncing'&&exp.leaseUntil<=clock();
        sheet={status:exp.leaseUntil>clock()?'syncing':interrupted?'failed':exp.status,lastSyncedAt:exp.lastSyncedAt||null,errorCode:interrupted?'GOOGLE_UNAVAILABLE':exp.errorCode||null,url:exp.spreadsheetId?`https://docs.google.com/spreadsheets/d/${exp.spreadsheetId}/edit`:null};
      }
    }
    return {configured:configured(),configurationError:configurationError(),connected,reauthRequired:reauth,sheetsAvailable:configured()&&connected,sheet};
  }
  async function disconnectSheets(data,uid) {
    fields(data,[]); const who=await teacher(uid), ref=connectionRef(who.teacherId);
    const c=await db.runTransaction(async tx=>{
      await teacher(uid,tx); const snap=await tx.get(ref);
      let subjectRef, subjectOwner;
      if(snap.data()?.subject){subjectRef=db.doc(`googleSubjects/${sha256(snap.data().subject)}`);subjectOwner=await tx.get(subjectRef);}
      tx.delete(ref);
      if(subjectOwner?.data()?.teacherId===who.teacherId)tx.delete(subjectRef);
      tx.update(db.doc(`teachers/${who.teacherId}`),{googleOAuthAttempt:opaque()});
      return snap.data();
    });
    // Forget locally first. Outstanding jobs must pass connection/epoch checks.
    let revoked=true;
    if(c?.refreshCipher) {
      try { revoked=await api.revoke(unseal(c.refreshCipher,env.GOOGLE_TOKEN_ENCRYPTION_KEY,context({...who,epoch:c.epoch}))); }
      catch { revoked=false; }
    }
    return {connected:false,revocationPending:!revoked};
  }
  async function exportSheet(data,uid,create) {
    fields(data,['classId']); needConfig(); const who=await teacher(uid), cls=await owned(who,data.classId), c=await connection(who);
    const ref=db.doc(`sheetExports/${data.classId}`), jobRef=db.doc(`sheetJobs/${data.classId}`), value=opaque(), lease={classId:data.classId,value};
    const exp=await db.runTransaction(async tx=>{
      await teacher(uid,tx); await owned(who,data.classId,tx);
      const [snap,job,conn]=await Promise.all([tx.get(ref),tx.get(jobRef),tx.get(connectionRef(who.teacherId))]);
      if(!validConnection(conn.data(),who)||conn.data().version!==c.version)fail('REAUTH_REQUIRED');
      const previous=snap.data();
      if(previous?.ownerTeacherId&&previous.ownerTeacherId!==who.teacherId)fail('FORBIDDEN');
      if(previous?.subject&&previous.subject!==c.subject)fail('GOOGLE_ACCOUNT_MISMATCH');
      if(previous?.leaseUntil>clock())fail('SYNC_BUSY');
      if(!create&&!previous?.spreadsheetId)fail('SHEET_NOT_CREATED');
      const record={...previous,ownerTeacherId:who.teacherId,subject:c.subject,exportVersion:1,lease:value,leaseUntil:clock()+600000,status:'syncing',errorCode:null};
      const dirty=job.data()?.dirty||opaque();
      if(!job.exists)tx.set(jobRef,{state:'pending',dirty,nextRunAt:clock()+60000});
      tx.set(ref,record); return {...record,dirty};
    });
    try {
      const token=await access(who,c);
      let spreadsheetId=exp.spreadsheetId;
      if(!spreadsheetId) {
        const exportId=sha256(`${env.FIREBASE_PROJECT_ID}:${data.classId}:1`);
        await checkConnection(who,c.version,lease);
        spreadsheetId=await api.find(exportId,token);
        if(!spreadsheetId) {
          if(exp.createUncertain)fail('SHEET_CREATE_UNCERTAIN');
          await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease!==value)fail('SYNC_BUSY');tx.update(ref,{createUncertain:true});});
          await checkConnection(who,c.version,lease);
          try {spreadsheetId=await api.create(exportId,`학급 관리표 · ${cls.privateLabel}`,token);}
          catch(error) {
            // An explicit authorization rejection did not create a Drive file.
            // Ambiguous network/5xx responses keep the uncertainty fence intact.
            if(['GOOGLE_ACCESS_DENIED','REAUTH_REQUIRED','SHEET_UNAVAILABLE'].includes(error.code))await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease===value)tx.update(ref,{createUncertain:false});});
            throw error;
          }
        }
        if(!/^[A-Za-z0-9_-]{1,200}$/.test(spreadsheetId||''))fail('SHEET_UNAVAILABLE');
        await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease!==value)fail('SYNC_BUSY');tx.update(ref,{spreadsheetId,createUncertain:false});});
      }
      const tables=await buildTables(db,data.classId,cls.privateLabel,env.MATH3_SERVER_SECRET);
      await checkConnection(who,c.version,lease);
      await api.write(spreadsheetId,tables,token);
      await db.runTransaction(async tx=>{
        await teacher(uid,tx);
        const [snap,conn,job]=await Promise.all([tx.get(ref),tx.get(connectionRef(who.teacherId)),tx.get(jobRef)]);
        if(snap.data()?.lease!==value||conn.data()?.version!==c.version)fail('REAUTH_REQUIRED');
        tx.update(ref,{status:'synced',lastSyncedAt:now(),leaseUntil:0,errorCode:null});
        if(job.exists&&job.data().dirty===exp.dirty)tx.delete(jobRef);
      });
      return getGoogleConnectionStatus(data,uid);
    } catch(error) {
      if(error.code==='REAUTH_REQUIRED')await markReauth(who,c);
      const errorCode=['REAUTH_REQUIRED','SHEET_UNAVAILABLE','SHEET_CREATE_UNCERTAIN','SHEET_DUPLICATES','EXPORT_LIMIT','GOOGLE_ACCESS_DENIED'].includes(error.code)?error.code:'GOOGLE_UNAVAILABLE';
      await db.runTransaction(async tx=>{
        const [snap,job]=await Promise.all([tx.get(ref),tx.get(jobRef)]);
        if(snap.data()?.lease===value)tx.update(ref,{status:'failed',errorCode,leaseUntil:0});
        tx.set(jobRef,{state:'pending',dirty:job.data()?.dirty||opaque(),nextRunAt:clock()+300000});
      });
      throw new ApiError(errorCode);
    }
  }
  async function runJobs() {
    if(!configured())return;
    const jobs=await db.collection('sheetJobs').orderBy('nextRunAt').limit(1).get();
    for(const job of jobs.docs) {
      if(job.data().nextRunAt>clock())continue;
      try {
        const exp=(await db.doc(`sheetExports/${job.id}`).get()).data();
        if(exp?.leaseUntil>clock()) {
          await db.runTransaction(async tx=>{const current=await tx.get(job.ref);if(current.data()?.dirty===job.data().dirty)tx.update(job.ref,{nextRunAt:exp.leaseUntil+1000});});
          continue;
        }
        const c=exp?(await connectionRef(exp.ownerTeacherId).get()).data():null;
        if(!exp||(!exp.spreadsheetId&&!exp.createUncertain)||c?.status!=='connected') {
          await db.runTransaction(async tx=>{const current=await tx.get(job.ref);if(current.data()?.dirty===job.data().dirty)tx.delete(job.ref);});
          continue;
        }
        const bindings=await db.collection('teacherBindings').where('teacherId','==',exp.ownerTeacherId).limit(50).get();
        const space=(await db.doc(`teachers/${exp.ownerTeacherId}`).get()).data();
        const binding=bindings.docs.find(d=>d.data().active&&d.data().epoch===space?.authEpoch);
        if(binding)await exportSheet({classId:job.id},binding.id,!exp.spreadsheetId);
        else await db.runTransaction(async tx=>{const current=await tx.get(job.ref);if(current.data()?.dirty===job.data().dirty)tx.delete(job.ref);});
      } catch {
        // Delay even errors occurring before the lease (e.g. changed ownership).
        await db.runTransaction(async tx=>{const current=await tx.get(job.ref);if(current.data()?.dirty===job.data().dirty)tx.update(job.ref,{nextRunAt:clock()+300000});}).catch(()=>{});
      }
    }
  }
  return {configured,start,callback,runJobs,handlers:{beginGoogleConnection,getGoogleConnectionStatus,disconnectSheets,createOrSelectSheet:(d,u)=>exportSheet(d,u,true),syncSheet:(d,u)=>exportSheet(d,u,false)}};
}
