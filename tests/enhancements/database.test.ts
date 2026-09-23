import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { S3Client } from '@aws-sdk/client-s3';
import { getDatabase } from '../../src/lib/database';
import { database, reporterDefaults, startApplication, uploadApplicationFile, submitApplication, application, hashToken } from '../../src/lib/reporters';
import { defaultCardLayout } from '../../src/lib/reporter-card';
import { createCardPreview, approveApplication, reviewApplication } from '../../src/lib/reporter-review';
import { deliverApplicationEmails, deliverReporterEmail } from '../../src/lib/reporter-email';
import { reporterMaintenance, maintenanceState } from '../../src/lib/reporter-maintenance';
import { saveAdvertisement, getActiveAdvertisements, deleteAdvertisement } from '../../src/lib/ad-repository';
import { syncTv, tvQueue } from '../../src/lib/tv';
import { POST as submitRoute } from '../../src/pages/api/reporters/submit';

test('isolated local schema: migrations, ads, YouTube synchronization, reporter lifecycle and retention', {skip:process.env.ENHANCEMENT_DB_TEST!=='1',timeout:180000},async() => {
  const url=new URL(process.env.DATABASE_URL || '');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.username==='naee' && url.password==='local-development-only' && url.pathname==='/naee_parvaz','Refusing anything except the repository local development database');
  const schema=`np_enhancement_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:url.toString(),max:1});
  const originalFetch=globalThis.fetch,originalSend=S3Client.prototype.send;
  const memory=new Map<string,Buffer>(); let deliveryMode='ok'; let sent=0; let youtubeFail=false; let deleteFails=false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
    process.env.REPORTER_R2_BUCKET='test-private';process.env.R2_BUCKET='test-social';process.env.R2_ACCOUNT_ID='test';process.env.REPORTER_R2_ACCESS_KEY_ID='test';process.env.REPORTER_R2_SECRET_ACCESS_KEY='test';process.env.RESEND_API_KEY='test';process.env.YOUTUBE_API_KEY='test';
    S3Client.prototype.send=(async function(command:{input:{Key:string;Body?:Uint8Array};constructor:{name:string}}) {
      const key=command.input.Key;
      if(command.constructor.name==='PutObjectCommand') {memory.set(key,Buffer.from(command.input.Body!));return {};}
      if(command.constructor.name==='GetObjectCommand') {const bytes=memory.get(key);if(!bytes)throw new Error('Missing test object');return {ContentLength:bytes.length,Body:{transformToByteArray:async()=>bytes}};}
      if(command.constructor.name==='DeleteObjectCommand') {if(deleteFails)throw new Error('Test storage failure');memory.delete(key);return {};}
      throw new Error('Unexpected storage operation');
    }) as typeof S3Client.prototype.send;
    globalThis.fetch=(async(input:URL|string|Request) => {
      const u=new URL(input instanceof Request?input.url:String(input));
      if(u.hostname==='api.resend.com') {sent++;if(deliveryMode==='timeout')throw new Error('timeout');return new Response('{}',{status:deliveryMode==='fail'?400:200});}
      assert.equal(u.hostname,'www.googleapis.com','No unmocked external requests permitted');
      if(youtubeFail) return new Response('{}',{status:503});
      if(u.pathname.endsWith('/channels')) return Response.json({items:[{id:'UC1234567890123456789012',contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]});
      if(u.pathname.endsWith('/playlistItems')) return Response.json({items:[{contentDetails:{videoId:u.searchParams.has('pageToken')?'bbbbbbbbbbb':'aaaaaaaaaaa'}}],...(u.searchParams.has('pageToken')?{}:{nextPageToken:'second'})});
      return Response.json({items:[{id:u.searchParams.get('id'),snippet:{title:'Test video',publishedAt:u.searchParams.get('id')==='aaaaaaaaaaa'?'2026-09-23T00:00:00Z':'2026-09-22T00:00:00Z',liveBroadcastContent:'none'},status:{privacyStatus:'public',embeddable:true}}]});
    }) as typeof fetch;
    const db=database();
    const migrations=(await readdir('db/migrations')).filter((n)=>n.endsWith('.sql')).sort();
    for(const file of migrations.filter((n)=>n<'005')) await db.query(await readFile(`db/migrations/${file}`,'utf8'));
    const before=(await db.query('SELECT * FROM videos ORDER BY id')).rows;
    await db.query(await readFile('db/migrations/005_ads_tv_reporters.sql','utf8'));
    assert.deepEqual((await db.query('SELECT * FROM videos ORDER BY id')).rows,before,'Migration preserves existing video records');
    for(const file of migrations.filter((n)=>n>'005_ads_tv_reporters.sql')) await db.query(await readFile(`db/migrations/${file}`,'utf8'));
    assert.equal(await reporterMaintenance({source:'automatic'}),'unconfigured','No cleanup before editor accepts retention');
    const first=await saveAdvertisement({}, {clientName:'Client A',placement:'home',priority:10,startsAt:'2026-01-01',status:'published',headlineEn:'A'});
    await saveAdvertisement({}, {clientName:'Client B',placement:'article-end',priority:1,startsAt:'2026-01-01',status:'published',headlineEn:'B'});
    assert.equal((await getActiveAdvertisements({},'en')).length,2,'Lower priorities and other placements are included');
    await deleteAdvertisement({},first,false);assert.equal((await getActiveAdvertisements({},'en')).length,1);
    await deleteAdvertisement({},first,true);assert.equal((await getActiveAdvertisements({},'en')).length,1,'Restore is draft');
    await db.query("UPDATE tv_settings SET enabled=true,channel_input='@NaeeParvazNews'");
    assert.equal((await syncTv(1)).complete,false);assert.equal((await tvQueue()).length,0);
    assert.equal((await syncTv(1)).complete,true);assert.deepEqual((await tvQueue()).map(v=>v.video_id),['aaaaaaaaaaa','bbbbbbbbbbb']);
    youtubeFail=true;await assert.rejects(syncTv());assert.equal((await tvQueue()).length,2);youtubeFail=false;
    const templateId=randomUUID();
    await db.query('INSERT INTO reporter_templates(id,layout,approved) VALUES($1,$2,true)',[templateId,defaultCardLayout]);
    const settings={...reporterDefaults,enabled:true,fee:100,instructionsEn:'Pay test',instructionsHi:'भुगतान',refundEn:'Test policy',refundHi:'नीति',retentionConfirmed:true,templateId};
    await db.query('UPDATE reporter_settings SET settings=$1,next_number=99',[settings]);
    const png=await sharp({create:{width:400,height:500,channels:3,background:'#eeeeee'}}).png().toBuffer();
    const profile=new FormData();
    Object.entries({name:'Test Reporter',phone:'9999999999',address:'Test address Yavatmal',area:'Yavatmal',languages:'Hindi',education:'Graduate',experience:'None',identityType:'voter-id',transaction:'TEST-123',paymentDate:'2026-01-01',consent:'yes',paymentConsent:'yes',locale:'en'}).forEach(([k,v])=>profile.set(k,v));
    const session=await startApplication('applicant@example.invalid');
    await assert.rejects(submitApplication(session.token,profile),/Missing/);
    const apiSubmit=(data:unknown,token=session.token) => submitRoute({request:new Request('https://test.invalid/api/reporters/submit/',{method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json','X-Application-Token':token},body:JSON.stringify(data)})} as Parameters<typeof submitRoute>[0]);
    const originalError=console.error,safeLogs:string[]=[];
    try {
      console.error=(message:unknown)=>safeLogs.push(String(message));
      const invalid=await apiSubmit({...Object.fromEntries(profile),experience:'0'});
      assert.equal(invalid.status,422);assert.equal((await invalid.json()).field,'experience');
      const missing=await apiSubmit(Object.fromEntries(profile));assert.equal((await missing.json()).code,'MISSING_UPLOAD');
      const unknownSession=await apiSubmit(Object.fromEntries(profile),'invalid-token');assert.equal((await unknownSession.json()).code,'SESSION_INVALID');
      await db.query("UPDATE reporter_upload_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[hashToken(session.token)]);
      const expired=await apiSubmit(Object.fromEntries(profile));assert.equal((await expired.json()).code,'SESSION_EXPIRED');
      await db.query("UPDATE reporter_upload_sessions SET expires_at=now()+interval '30 minutes' WHERE token_hash=$1",[hashToken(session.token)]);
      const malformed=await apiSubmit(null);assert.equal(malformed.status,400);
      assert.ok(safeLogs.every(line=>!line.includes(session.token) && !line.includes('Test Reporter') && !line.includes('TEST-123') && !line.includes('applicant@')),'Diagnostics never include applicant values or bearer tokens');
      assert.ok(safeLogs.every(line=>JSON.parse(line).reference),'Diagnostics have a support reference');
    } finally {console.error=originalError;}
    await assert.rejects(uploadApplicationFile('forged','photo',png));
    for(const kind of ['photo','identity','payment']) await uploadApplicationFile(session.token,kind,png);
    const created=await apiSubmit(Object.fromEntries(profile));assert.equal(created.status,200);const {id}=await created.json();assert.equal(await submitApplication(session.token,profile),id,'Duplicate submission returns original ID');
    await deliverApplicationEmails(id);assert.equal(sent,1);
    const duplicate=await apiSubmit(Object.fromEntries(profile));assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).id,id);assert.equal(sent,1,'HTTP retry neither duplicates the application nor sends another acknowledgement');
    const previewForm=new FormData();Object.entries({designation:'REPORTER',joined:new Date().toISOString().slice(0,10),cropX:'50',cropY:'50',zoom:'1'}).forEach(([k,v])=>previewForm.set(k,v));
    let preview=await createCardPreview(id,previewForm);await assert.rejects(approveApplication(id,preview,'editor'),/verify payment/);
    await reviewApplication(id,'verify-payment','','editor');await assert.rejects(approveApplication(id,preview,'editor'),/fresh preview/);
    preview=await createCardPreview(id,previewForm);
    await Promise.all([approveApplication(id,preview,'editor'),approveApplication(id,preview,'editor')]);
    assert.equal((await db.query('SELECT * FROM reporter_cards')).rows.length,1);assert.equal(Number((await db.query('SELECT next_number FROM reporter_settings')).rows[0].next_number),100);
    assert.equal((await application(id))?.status,'approved');
    deliveryMode='fail';await deliverApplicationEmails(id);
    const failed=(await db.query("SELECT id FROM reporter_emails WHERE kind='approval'")).rows[0].id;
    assert.equal((await db.query('SELECT status FROM reporter_emails WHERE id=$1',[failed])).rows[0].status,'failed');
    deliveryMode='ok';await deliverReporterEmail(failed);assert.equal((await db.query('SELECT status FROM reporter_emails WHERE id=$1',[failed])).rows[0].status,'sent');
    await reviewApplication(id,'revoke','Test revocation','editor');deliveryMode='timeout';await deliverApplicationEmails(id);
    const unknown=(await db.query("SELECT id FROM reporter_emails WHERE status='unknown'")).rows[0].id;const sendsBefore=sent;await deliverReporterEmail(unknown);assert.equal(sent,sendsBefore,'Unknown email is not retried');
    const second=await startApplication('second@example.invalid');for(const kind of ['photo','identity','payment'])await uploadApplicationFile(second.token,kind,png);const secondId=await submitApplication(second.token,profile);
    await reviewApplication(secondId,'changes-requested','Correct address','editor');
    const correctionEmail=(await db.query("SELECT body FROM reporter_emails WHERE application_id=$1 AND kind='correction'",[secondId])).rows[0].body;
    const token=correctionEmail.match(/correction=([a-f0-9]{64})/)[1];
    await assert.rejects(startApplication('wrong@example.invalid',token));
    const correction=await startApplication('second@example.invalid',token);assert.ok(correction.files?.includes('photo'));profile.set('address','Corrected test address');assert.equal(await submitApplication(correction.token,profile),secondId);
    await assert.rejects(startApplication('second@example.invalid',token));
    await db.query("UPDATE reporter_upload_sessions SET expires_at=now()-interval '1 hour' WHERE token_hash=$1",[hashToken(correction.token)]);
    await assert.rejects(uploadApplicationFile(correction.token,'photo',png));
    await reviewApplication(secondId,'reject','Test rejection','editor');
    await db.query("UPDATE reporter_applications SET finalized_at=now()-interval '200 days'");await db.query("UPDATE reporter_cards SET revoked_at=now()-interval '200 days'");
    assert.equal(await reporterMaintenance(),'succeeded');assert.ok((await application(id))?.purged_at);assert.ok((await application(secondId))?.purged_at);
    assert.equal((await db.query('SELECT * FROM reporter_files WHERE application_id IS NOT NULL AND deleted_at IS NULL')).rows.length,0);
    assert.equal((await maintenanceState()).status,'succeeded');
    assert.ok((await maintenanceState()).last_success_at);
    assert.equal(await reporterMaintenance({source:'automatic'}),'not-due');
    assert.equal(await reporterMaintenance({source:'manual',actor:'editor'}),'recent','Double click is throttled');
    const lockClient=await db.connect();
    try {
      await lockClient.query("SELECT pg_advisory_lock(hashtext('np-reporter-maintenance'))");
      assert.equal(await reporterMaintenance(),'busy','Scheduled/manual/CLI runs cannot overlap');
    } finally {await lockClient.query("SELECT pg_advisory_unlock(hashtext('np-reporter-maintenance'))");lockClient.release();}
    const orphanId=randomUUID(),orphanKey=`test/orphan/${orphanId}`;
    memory.set(orphanKey,png);
    await db.query("INSERT INTO reporter_files(id,kind,object_key,mime,byte_size,validated,created_at) VALUES($1,'identity',$2,'image/png',$3,true,now()-interval '2 days')",[orphanId,orphanKey,png.length]);
    await db.query("UPDATE reporter_maintenance_state SET started_at=now()-interval '2 minutes',next_run_at=now()-interval '1 day'");
    deleteFails=true;
    assert.equal(await reporterMaintenance({source:'manual',actor:'editor'}),'failed');
    assert.ok(memory.has(orphanKey));assert.equal((await maintenanceState()).status,'failed');
    assert.ok(new Date((await maintenanceState()).next_run_at).getTime()>Date.now()+14*60000,'Failed run backs off');
    deleteFails=false;
    await db.query("UPDATE reporter_maintenance_state SET status='running',started_at=now()-interval '1 hour',next_run_at=now()-interval '1 hour'");
    await db.query("UPDATE reporter_settings SET settings=jsonb_set(settings,'{enabled}','false')");
    assert.equal(await reporterMaintenance({source:'automatic'}),'succeeded','Catch up after interruption even when registration is closed');
    assert.ok(!memory.has(orphanKey));assert.ok((await maintenanceState()).scheduler_seen_at);
    assert.equal(Number((await db.query('SELECT next_number FROM reporter_settings')).rows[0].next_number),100,'Cleanup never reuses reporter IDs');
    for(let i=0;i<26;i++) {
      const fileId=randomUUID(),key=`test/backlog/${fileId}`;memory.set(key,png);
      await db.query("INSERT INTO reporter_files(id,kind,object_key,mime,byte_size,validated,created_at) VALUES($1,'identity',$2,'image/png',$3,true,now()-interval '2 days')",[fileId,key,png.length]);
    }
    assert.equal(await reporterMaintenance(),'partial','A backlog is processed in bounded batches');
    assert.equal((await db.query("SELECT count(*) FROM reporter_files WHERE object_key LIKE 'test/backlog/%' AND deleted_at IS NULL")).rows[0].count,'1');
    await db.query("UPDATE reporter_maintenance_state SET next_run_at=now()-interval '1 minute'");
    assert.equal(await reporterMaintenance({source:'automatic'}),'succeeded','The next scheduled batch completes the remaining work');
  } finally {
    globalThis.fetch=originalFetch;S3Client.prototype.send=originalSend;
    await getDatabase()?.end();
    // Only this test's randomly named schema is removed; application/public schemas are never touched.
    if(/^np_enhancement_test_[a-f0-9]{32}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
