import { opaque } from '../worker/src/google-crypto.js';
import { GOOGLE_SCOPES } from '../worker/src/google-api.js';
import { ApiError } from '../worker/src/error.js';
export class MemoryDb {
  constructor() { this.rows=new Map(); this.queue=Promise.resolve(); }
  doc(path) { const db=this; return {path,id:path.split('/').at(-1),get:async()=>db.snap(path),collection:name=>db.collection(`${path}/${name}`)}; }
  snap(path) { const value=structuredClone(this.rows.get(path));return {ref:this.doc(path),id:path.split('/').at(-1),exists:value!==undefined,data:()=>value}; }
  async getAll(...refs) {return refs.map(ref=>this.snap(ref.path));}
  collection(path) {
    const db=this;
    function query(filters=[],maximum=200,ordering=null){return {
      doc:id=>db.doc(`${path}/${id}`),where:(k,op,v)=>query([...filters,[k,v]],maximum,ordering),limit:n=>query(filters,n,ordering),orderBy:k=>query(filters,maximum,k),
      get:async()=>{let rows=[...db.rows].filter(([p])=>p.startsWith(`${path}/`)&&p.split('/').length===path.split('/').length+1).filter(([,v])=>filters.every(([k,x])=>v[k]===x));if(ordering)rows.sort((a,b)=>a[1][ordering]-b[1][ordering]);const docs=rows.slice(0,maximum).map(([p])=>db.snap(p));return {docs,size:docs.length,empty:!docs.length};}
    };}
    return query();
  }
  runTransaction(fn) {
    const action=this.queue.then(async()=>{
      const writes=[];
      const result=await fn({get:r=>r.get(),create:(r,v)=>{if(this.rows.has(r.path))throw Error('exists');writes.push([r.path,v]);},set:(r,v)=>writes.push([r.path,v]),update:(r,v)=>{const previous=writes.findLast(x=>x[0]===r.path)?.[1]||this.rows.get(r.path);if(!previous)throw Error('missing');writes.push([r.path,{...previous,...v}]);},delete:r=>writes.push([r.path,undefined])});
      for(const [p,v] of writes){if(v===undefined)this.rows.delete(p);else this.rows.set(p,structuredClone(v));}
      return result;
    });this.queue=action.catch(()=>{});return action;
  }
}
export const fixtureEnv = () => ({ FIREBASE_PROJECT_ID:'math3-dev',FIREBASE_SERVICE_ACCOUNT_JSON:'fake-private-server-value',MATH3_SERVER_SECRET:opaque(),ALLOWED_ORIGINS:'https://subsubt.github.io',GOOGLE_REDIRECT_URI:'https://math3-cp3-dev.subsubt-math3-dev.workers.dev/oauth/google/callback',GOOGLE_DASHBOARD_URL:'https://subsubt.github.io/game/teacher/index.html',GOOGLE_CLIENT_ID:'mock.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:opaque(),GOOGLE_TOKEN_ENCRYPTION_KEY:opaque() });
export class FakeGoogle {
  constructor(){this.creates=0;this.writes=0;this.files=new Map();this.subject='google-subject-a';this.refreshValue=opaque();this.accessValue=opaque();this.revoked=[];}
  async exchange(code,verifier){this.exchanged={code,verifier};if(this.exchangeFailure)throw new ApiError(this.exchangeFailure);return {access_token:this.accessValue,refresh_token:this.refreshValue,id_token:'mock-verified-token',scope:GOOGLE_SCOPES.join(' '),expires_in:3600};}
  async refresh(token){this.refreshed=token;if(this.refreshFailure)throw new ApiError(this.refreshFailure);return {access_token:this.accessValue,expires_in:3600};}
  async revoke(token){this.revoked.push(token);return !this.revokeFailure;}
  async find(exportId){if(this.duplicates)throw new ApiError('SHEET_DUPLICATES');return this.files.get(exportId)||null;}
  async create(exportId){if(this.createFailure)throw new ApiError(this.createFailure);this.creates++;const id=`fake_sheet_${this.creates}`;this.files.set(exportId,id);if(this.lostCreateResponse)throw new ApiError('GOOGLE_UNAVAILABLE');return id;}
  async write(id,tables){this.writes++;if(this.writeFailure)throw new ApiError(this.writeFailure);if(this.beforeWrite)await this.beforeWrite();this.last={id,tables:structuredClone(tables)};}
}
