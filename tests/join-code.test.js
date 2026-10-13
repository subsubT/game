import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,createCipheriv,randomBytes} from 'node:crypto';
import {generateJoinCode} from '../src/server/join-code.js';
import {createHandlers} from '../worker/src/generated-handlers.js';
import {MemoryDb} from './sheets-fakes.js';
const secret='unit-test-join-code-only',id=()=>crypto.randomUUID();
const digest=code=>createHmac('sha256',secret).update(code).digest('hex');
function encrypt(code){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv),body=Buffer.concat([cipher.update(code),cipher.final()]);return[iv,cipher.getAuthTag(),body].map(x=>x.toString('base64url')).join('.');}
async function fixture(){const db=new MemoryDb(),h=createHandlers(db,secret);await h.createTeacherSpace({requestId:id()},'owner');const cls=await h.createClass({privateLabel:'숫자검증반',requestId:id()},'owner');return{db,h,cls};}
test('four-digit generator preserves zeroes and rejects biased random samples',()=>{
  for(const [value,code] of [[0,'0000'],[7,'0007'],[9999,'9999'],[59999,'9999']]) assert.equal(generateJoinCode(()=>{const b=Buffer.alloc(2);b.writeUInt16BE(value);return b;}),code);
  const samples=[65535,60000,7];assert.equal(generateJoinCode(()=>{const b=Buffer.alloc(2);b.writeUInt16BE(samples.shift());return b;}),'0007');assert.equal(samples.length,0);
});
test('numeric codes retry collisions, remain idempotent, normalize input and reject malformed codes',async()=>{
  const {db,h,cls}=await fixture();assert.match(cls.code,/^[0-9]{4}$/);
  let forceCollision=true,collisionChecks=0;const originalSnap=db.snap.bind(db);
  db.snap=path=>{if(forceCollision&&path.startsWith('joinCodes/')){forceCollision=false;collisionChecks++;return{...originalSnap(path),exists:true};}return originalSnap(path);};
  const requestId=id(),args={privateLabel:'중복검증반',requestId};const next=await h.createClass(args,'owner');assert.equal(collisionChecks,1);assert.match(next.code,/^[0-9]{4}$/);assert.deepEqual(await h.createClass(args,'owner'),next);
  db.rows.set(`classes/${cls.classId}`,{...db.rows.get(`classes/${cls.classId}`),codeCipher:encrypt('0007')});
  db.rows.set(`joinCodes/${digest('0007')}`,{classId:cls.classId,codeVersion:1,active:true,expiresAt:new Date(Date.now()+86400000).toISOString()});
  assert.equal((await h.requestJoin({code:' ０００７ ',requestId:id()},'zero-student')).status,'approved');
  for(const code of ['123','12345','AB12',1234])await assert.rejects(h.requestJoin({code,requestId:id()},'invalid-student'));
  assert.equal([...db.rows.keys()].filter(p=>p.startsWith('joinCodeBackups/')).length,0);
});
test('legacy upgrade is owned, atomic and concurrent-idempotent; both codes enroll existing pending students',async()=>{
  const {db,h,cls}=await fixture(),path=`classes/${cls.classId}`,oldCode='ABCD2345';
  const oldClass={...db.rows.get(path),codeCipher:encrypt(oldCode)};db.rows.set(path,oldClass);
  const oldIndex={classId:cls.classId,codeVersion:1,active:true,expiresAt:new Date(Date.now()+86400000).toISOString()};db.rows.set(`joinCodes/${digest(oldCode)}`,oldIndex);
  db.rows.set(`classes/${cls.classId}/students/legacy-pending`,{uid:'pending-student',privateName:'기존이름',classAlias:'초록별-10',status:'pending',checkMark:'11'});
  db.rows.set('joinRequests/pending-student',{classId:cls.classId,studentId:'legacy-pending',codeDigest:digest(oldCode),checkMark:'11'});
  await h.createTeacherSpace({requestId:id()},'outsider');await assert.rejects(h.ensureClassJoinCode({classId:cls.classId},'outsider'),e=>e.code==='FORBIDDEN');
  const results=await Promise.all([h.ensureClassJoinCode({classId:cls.classId},'owner'),h.ensureClassJoinCode({classId:cls.classId},'owner')]);assert.deepEqual(results[0],results[1]);const upgraded=results[0];assert.match(upgraded.code,/^[0-9]{4}$/);
  const {codeCipher:oldCipher,...oldRest}=oldClass,{codeCipher:newCipher,...newRest}=db.rows.get(path);assert.deepEqual(oldRest,newRest);assert.notEqual(newCipher,oldCipher);
  const backups=[...db.rows].filter(([p])=>p.startsWith('joinCodeBackups/'));assert.equal(backups.length,1);assert.equal(backups[0][1].codeCipher,oldCipher);assert.deepEqual(db.rows.get(`joinCodes/${digest(oldCode)}`),oldIndex);
  assert.equal((await h.requestJoin({code:upgraded.code,requestId:id()},'pending-student')).status,'approved');assert.equal(db.rows.get('joinRequests/pending-student').status,'joined');
  assert.equal((await h.requestJoin({code:oldCode,requestId:id()},'legacy-student')).status,'approved');assert.equal((await h.requestJoin({code:upgraded.code,requestId:id()},'numeric-student')).status,'approved');
  assert.deepEqual(await h.ensureClassJoinCode({classId:cls.classId},'owner'),upgraded);
});
