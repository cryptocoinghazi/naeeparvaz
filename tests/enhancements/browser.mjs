import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const url=new URL(process.env.DATABASE_URL || '');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.username==='naee' && url.password==='local-development-only' && url.pathname==='/naee_parvaz','Local compose database required');
const schema=`np_browser_test_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Pool({connectionString:url.toString(),max:1});
let scoped,browser,server;
const base='http://127.0.0.1:4338';
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options',`-c search_path=${schema}`);
  scoped=new pg.Pool({connectionString:url.toString(),max:2});
  for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort()) await scoped.query(await readFile(`db/migrations/${file}`,'utf8'));
  for(const [i,placement] of ['home','article-end'].entries()) await scoped.query("INSERT INTO advertisements(id,client_name,headline_en,headline_hi,body_en,placement,priority,starts_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,now()-interval '1 day','published')",[randomUUID(),`Test client ${i+1}`,`Test advertisement ${i+1}`,`परीक्षण विज्ञापन ${i+1}`,'A locally seeded test advertisement',placement,i]);
  const generation=randomUUID();
  await scoped.query("UPDATE tv_settings SET enabled=true,channel_input='@NaeeParvazNews',channel_id='UCtest'");
  for(const [i,id] of ['aaaaaaaaaaa','bbbbbbbbbbb'].entries()) await scoped.query('INSERT INTO tv_videos VALUES($1,$2,now()-$3*interval \'1 day\',$4,$5)',[id,`Local video ${i+1}`,i,generation,'UCtest']);
  const settings={enabled:true,fee:100,payee:'Test recipient',instructionsEn:'Test instructions',instructionsHi:'परीक्षण निर्देश',refundEn:'Test refund policy',refundHi:'परीक्षण वापसी नीति',evidenceDays:90,profileDays:90,retentionConfirmed:true};
  await scoped.query('UPDATE reporter_settings SET settings=$1,next_number=100',[settings]);
  const appId=randomUUID();
  await scoped.query("INSERT INTO reporter_applications(id,locale,profile,payment_terms) VALUES($1,'en',$2,$3)",[appId,{name:'Test Applicant',email:'test@example.invalid',phone:'9999999999',address:'Test address',area:'Yavatmal',languages:'Hindi',education:'Graduate',experience:'None',identityType:'voter-id',transaction:'TEST-123',paymentDate:'2026-01-01',workSamples:''},settings]);
  const session=randomBytes(32).toString('base64url');
  await scoped.query("INSERT INTO admin_sessions(token_hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(session).digest('hex'),process.env.ADMIN_EMAIL]);
  server=spawn(process.execPath,['dist/server/entry.mjs'],{env:{...process.env,DATABASE_URL:url.toString(),HOST:'127.0.0.1',PORT:'4338',REPORTER_R2_BUCKET:'browser-private',R2_BUCKET:'browser-social',R2_ACCOUNT_ID:'test',REPORTER_R2_ACCESS_KEY_ID:'test',REPORTER_R2_SECRET_ACCESS_KEY:'test',RESEND_API_KEY:'test',YOUTUBE_API_KEY:'',TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:''},stdio:'pipe'});
  let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  let ready=false;
  for(let i=0;i<50;i++) {try {const r=await fetch(base+'/en/');if(r.ok){ready=true;break;}}catch {}await delay(200);}
  assert.ok(ready,`Test server did not start: ${logs.slice(-2000)}`);
  for(const path of ['/api/editor/reporters/file/?id='+appId,'/api/editor/reporters/action/','/api/editor/reporters/maintenance/','/api/editor/tv/']) {
    const response=await fetch(base+path,{method:path.includes('file')?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json'},redirect:'manual'});assert.ok([401,403].includes(response.status),`${path} is protected`);
  }
  browser=await chromium.launch({headless:true});
  await mkdir('test-results/enhancements',{recursive:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});
    await context.addCookies([{name:'__Host-naee_admin',value:session,url:'https://127.0.0.1/',secure:true,httpOnly:true,sameSite:'Lax'}]);
    await context.route('**/*',async route=>{
      const requestUrl=new URL(route.request().url());
      if(requestUrl.origin!==base) return route.abort();
      if(requestUrl.pathname==='/api/reporters/session/') return route.fulfill({json:{token:'a'.repeat(64),terms:settings}});
      // Chromium ignores Cookie overrides in route.continue; use the API fetch transport for this test-only session.
      const response=await route.fetch({headers:{...route.request().headers(),cookie:`__Host-naee_admin=${session}`},maxRedirects:0});
      return route.fulfill({response});
    });
    await context.addInitScript(()=>{
      window.__tvLoads=[];
      window.YT={Player:class {
        constructor(element,options){this.options=options;this.state=1;this.muted=true;window.__tvPlayer=this;window.__tvLoads.push(options.videoId);element.textContent='Mock YouTube player';queueMicrotask(()=>options.events.onReady());}
        loadVideoById(id){window.__tvLoads.push(id);this.state=1;this.options.events.onStateChange({data:1});}
        playVideo(){this.state=1;this.options.events.onStateChange({data:1});}
        pauseVideo(){this.state=2;this.options.events.onStateChange({data:2});}
        mute(){this.muted=true;} unMute(){this.muted=false;} isMuted(){return this.muted;} getPlayerState(){return this.state;}
      }};
    });
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const path of ['/en/videos/','/hi/videos/','/en/join/','/hi/join/','/editor/ads/','/editor/tv/','/editor/reporters/','/editor/reporters/settings/',`/editor/reporters/${appId}/`]) {
      console.log(`Checking ${viewport.width}px ${path}`);
      const response=await page.goto(base+path);assert.ok(response?.ok(),path);
      assert.equal(new URL(page.url()).pathname,path,`${path}: must not redirect to login`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path}: no horizontal overflow at ${viewport.width}`);
      const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${path}: accessibility`);
      if(path==='/editor/reporters/' && viewport.width===1440) {
        const missingConfirm=await fetch(base+'/api/editor/reporters/maintenance/',{method:'POST',headers:{Origin:base,Cookie:`__Host-naee_admin=${session}`,'Content-Type':'application/x-www-form-urlencoded'},body:'',redirect:'manual'});
        assert.ok(missingConfirm.headers.get('location')?.includes('maintenance=confirm'));
        const crossOrigin=await fetch(base+'/api/editor/reporters/maintenance/',{method:'POST',headers:{Origin:'https://untrusted.invalid',Cookie:`__Host-naee_admin=${session}`,'Content-Type':'application/x-www-form-urlencoded'},body:'confirm=yes',redirect:'manual'});
        assert.ok(crossOrigin.status===403 || crossOrigin.headers.get('location')?.includes('maintenance=failed'));
        assert.equal((await scoped.query('SELECT status FROM reporter_maintenance_state')).rows[0].status,'idle');
        await page.locator('form[action="/api/editor/reporters/maintenance/"] input[name="confirm"]').check();
        await page.getByRole('button',{name:'Run maintenance now'}).click();
        await page.waitForURL(url=>url.searchParams.get('maintenance')==='succeeded',{waitUntil:'domcontentloaded'});
        assert.equal((await scoped.query('SELECT status FROM reporter_maintenance_state')).rows[0].status,'succeeded');
      }
      if(path===`/editor/reporters/${appId}/` && viewport.width===1440) {
        await page.locator('select[name="action"]').selectOption('under-review');
        const savedResponse=page.waitForResponse(response=>response.url().includes('/api/editor/reporters/action/'));
        await page.getByRole('button',{name:'Save review decision'}).click();
        const saved=await savedResponse;
        assert.match(saved.headers().location || '',/\?saved=1$/,`Review response: ${saved.status()} ${saved.headers().location || await saved.text()}`);
        await page.waitForURL(url=>url.searchParams.get('saved')==='1',{waitUntil:'domcontentloaded'}).catch(error=>{throw new Error(`Editor save navigation ended at ${page.url()}: ${error.message}`);});
        assert.equal((await scoped.query('SELECT status FROM reporter_applications WHERE id=$1',[appId])).rows[0].status,'under-review','Authenticated editor form saves through the real protected API');
      }
    }
    await page.clock.install();
    await page.goto(base+'/en/');
    const carousel=page.locator('[data-ad-carousel]').first();
    assert.equal(await carousel.locator('[data-ad-slides] > div').count(),2);
    const initial=await carousel.locator('[data-ad-slides] > div:visible').innerText();
    await page.clock.runFor(8500);
    assert.notEqual(await carousel.locator('[data-ad-slides] > div:visible').innerText(),initial,'Slides advance automatically');
    await page.clock.runFor(8500);
    assert.equal(await carousel.locator('[data-ad-slides] > div:visible').innerText(),initial,'Slides loop');
    await carousel.locator('[data-ad-next]').click();assert.notEqual(await carousel.locator('[data-ad-slides] > div:visible').innerText(),initial);
    await carousel.locator('[data-ad-pause]').click();assert.equal(await carousel.locator('[data-ad-pause]').innerText(),'Resume');
    const pausedText=await carousel.locator('[data-ad-slides] > div:visible').innerText();await page.clock.runFor(9000);assert.equal(await carousel.locator('[data-ad-slides] > div:visible').innerText(),pausedText);
    await page.goto(base+'/en/videos/');
    assert.equal(await page.locator('[data-tv] h2').evaluate(node=>getComputedStyle(node).color),'rgb(255, 255, 255)','TV heading is readable on the dark background');
    await page.locator('[data-tv-next]').click();assert.deepEqual(await page.evaluate(()=>window.__tvLoads),['aaaaaaaaaaa','bbbbbbbbbbb']);
    await page.evaluate(()=>window.__tvPlayer.options.events.onStateChange({data:0}));assert.deepEqual(await page.evaluate(()=>window.__tvLoads),['aaaaaaaaaaa','bbbbbbbbbbb','aaaaaaaaaaa']);
    await page.locator('[data-tv-play]').click();
    await page.evaluate(()=>window.__tvPlayer.options.events.onStateChange({data:0}));assert.equal((await page.evaluate(()=>window.__tvLoads)).length,3,'Deliberate pause stops the queue');
    await page.screenshot({path:`test-results/enhancements/videos-${viewport.width}.png`,fullPage:true});
    await page.goto(base+'/en/join/');await page.locator('[data-reporter-begin] input[name="email"]').fill('test@example.invalid');await page.locator('[data-reporter-begin] button').click();await page.locator('[data-reporter-form]').waitFor({state:'visible'});
    assert.match(await page.locator('[data-payment-summary]').innerText(),/100/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Expanded form fits');
    const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],'Expanded form accessibility');
    await page.screenshot({path:`test-results/enhancements/application-${viewport.width}.png`,fullPage:true});
    assert.deepEqual(errors,[],'No browser script exceptions');
    await context.close();
  }
  console.log('Focused desktop/mobile checks passed: changed routes, authorization, slides, playback queue, application form, overflow and accessibility.');
} finally {
  await browser?.close();
  if(server) {server.kill('SIGTERM');await delay(300);}
  await scoped?.end();
  if(/^np_browser_test_[a-f0-9]{32}$/.test(schema))await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
