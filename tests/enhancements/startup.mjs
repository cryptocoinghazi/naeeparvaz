import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

// Real production entry point and migrations, with an isolated local schema and no storage credentials.
const url=new URL(process.env.DATABASE_URL || '');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.username==='naee' && url.password==='local-development-only' && url.pathname==='/naee_parvaz','Local compose database required');
const schema=`np_startup_test_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Pool({connectionString:url.toString(),max:1});
let scoped,server;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options',`-c search_path=${schema}`);
  scoped=new pg.Pool({connectionString:url.toString(),max:1});
  server=spawn(process.execPath,['scripts/start-production.mjs'],{env:{...process.env,DATABASE_URL:url.toString(),HOST:'127.0.0.1',PORT:'4339',REPORTER_R2_BUCKET:'',REPORTER_R2_ACCESS_KEY_ID:'',REPORTER_R2_SECRET_ACCESS_KEY:'',RESEND_API_KEY:'',YOUTUBE_API_KEY:''},stdio:'pipe'});
  let logs='';server.stdout.on('data',chunk=>logs+=chunk);server.stderr.on('data',chunk=>logs+=chunk);
  let seen=false;
  for(let i=0;i<100;i++) {
    assert.equal(server.exitCode,null,`Production server stopped: ${logs.slice(-2000)}`);
    try {seen=!!(await scoped.query('SELECT scheduler_seen_at FROM reporter_maintenance_state')).rows[0]?.scheduler_seen_at;}catch {}
    if(seen)break;
    await delay(500);
  }
  assert.ok(seen,`Scheduler must tick without visitor traffic: ${logs.slice(-2000)}`);
  assert.equal((await scoped.query('SELECT status FROM reporter_maintenance_state')).rows[0].status,'idle','Unconfigured retention does not delete data');
  assert.ok((await fetch('http://127.0.0.1:4339/en/')).ok,'Website remains available');
  server.kill('SIGTERM');
  for(let i=0;i<20 && server.exitCode===null && server.signalCode===null;i++)await delay(100);
  assert.ok(server.exitCode!==null || server.signalCode!==null,'Scheduler must not prevent normal shutdown');
  console.log('Production startup, migrations, automatic heartbeat, configuration gate and shutdown passed.');
} finally {
  if(server && server.exitCode===null && server.signalCode===null){server.kill('SIGKILL');await new Promise(resolve=>server.once('exit',resolve));}
  await scoped?.end();
  if(/^np_startup_test_[a-f0-9]{32}$/.test(schema))await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
