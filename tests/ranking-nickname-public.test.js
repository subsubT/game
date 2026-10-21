// Actual published files and API; practice does not write production scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const dir='.cp5-test-artifacts/ranking-nickname-20261021',site='https://subsubt.github.io/game/';
test('published tablet card confirmation and actual global/class nicknames',{skip:process.env.MATH3_PAGES_TEST!=='1',timeout:180000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const ctx=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,isMobile:true});
  const p=await ctx.newPage(),errors=[],serverErrors=[],checks=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  p.on('response',r=>{if(r.status()>=500)serverErrors.push(r.status());});
  try{
    const global=p.waitForResponse(r=>r.url().endsWith('/api/getLeaderboard')&&r.request().postDataJSON()?.data.scope==='global');
    await p.goto(site+'1math3.html');assert.equal((await p.request.get(site+'1math3.html')).status(),200);
    const body=await (await global).json();assert.ok(body.result.entries.length>0);
    const before=JSON.parse(await readFile(dir+'/before.json','utf8'));
    const nicknames=new Set(before.students.map(s=>s.fields.privateName?.stringValue||s.fields.classAlias?.stringValue));
    for(const entry of body.result.entries){assert.ok(nicknames.has(entry.displayAlias));assert.deepEqual(Object.keys(entry).sort(),['displayAlias','isMe','rank','score']);}
    await p.locator('.rank-row').first().waitFor();checks.push('published global board uses registered nicknames and minimal response fields');
    await p.getByRole('button',{name:'혼자 연습 시작하기',exact:true}).tap();await p.getByRole('button',{name:'시작하기',exact:true}).tap();
    for(let i=1;i<5;i++){
      await p.getByRole('button',{name:'문제 건너뛰기',exact:true}).tap();await p.getByRole('button',{name:'건너뛰기 확정',exact:true}).tap();await p.getByRole('button',{name:'다음 문제',exact:true}).tap();
    }
    for(const viewport of [{width:768,height:1024},{width:1024,height:768},{width:800,height:1280},{width:1280,height:800},{width:390,height:844}]){
      await p.setViewportSize(viewport);const button=p.getByRole('button',{name:'고른 카드 확인',exact:true});await button.scrollIntoViewIfNeeded();
      const b=await button.boundingBox(),c=await p.locator('.card-row').boundingBox();
      assert.ok(Math.abs(b.x+b.width/2-(c.x+c.width/2))<=1);assert.ok(b.height>=48);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(viewport.width===768||viewport.width===1024)await p.screenshot({path:resolve(dir,`public-card-${viewport.width}.png`),fullPage:true});
    }
    const cards=p.locator('.card-choice'),nums=(await cards.allTextContents()).map(s=>Number(s.replace('번','')));
    const pair=[[0,1],[0,2],[1,2]].find(([a,b])=>nums[a]+nums[b]===10);
    for(const i of pair)await cards.nth(i).tap();await p.getByRole('button',{name:'고른 카드 확인',exact:true}).tap();await p.getByRole('heading',{name:'좋은 짝을 골랐어요!',exact:true}).waitFor();
    checks.push('tablet portrait/landscape and phone centered within 1px; touch selection and scoring work');
    const fixture=JSON.parse(await readFile('.cp5-test-artifacts/final-stage/fixture.json','utf8'));
    const student=await browser.newContext({storageState:'.cp5-test-artifacts/final-stage/student-storage.json',viewport:{width:800,height:1280},hasTouch:true,isMobile:true});
    const s=await student.newPage();s.on('pageerror',e=>errors.push(e.message));
    await s.goto(site+'1math3.html');
    await s.getByRole('heading',{name:'어떤 게임을 할까요?',exact:true}).waitFor();
    await s.getByRole('button',{name:'친구들 순위',exact:true}).tap();await s.getByRole('tab',{name:'우리 반 순위',exact:true}).tap();
    await s.locator('.rank-row.me').getByText(fixture.privateName+' (나)',{exact:true}).waitFor();
    checks.push('actual authenticated class board displays existing synthetic student nickname');
    assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[]);
    await student.close();await writeFile(dir+'/public-verification.json',JSON.stringify({result:'PASS',checkedAt:new Date().toISOString(),checks,browserErrors:errors.length,serverErrors:serverErrors.length},null,2));
  }finally{await ctx.close();await browser.close();}
});
