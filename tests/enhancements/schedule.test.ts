import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { nextMaintenanceRun, startMaintenanceTimer } from '../../src/lib/reporter-schedule';

test('daily maintenance targets 3 AM IST across midnight, month and year boundaries',() => {
  assert.equal(nextMaintenanceRun(new Date('2026-09-23T20:00:00Z')).toISOString(),'2026-09-23T21:30:00.000Z');
  assert.equal(nextMaintenanceRun(new Date('2026-09-23T21:30:00Z')).toISOString(),'2026-09-24T21:30:00.000Z');
  assert.equal(nextMaintenanceRun(new Date('2026-12-31T23:59:00Z')).toISOString(),'2027-01-01T21:30:00.000Z');
  assert.equal(nextMaintenanceRun(new Date('2024-02-28T23:59:00Z')).toISOString(),'2024-02-29T21:30:00.000Z');
});
test('timer does not overlap jobs and stopping during a run prevents rescheduling',async() => {
  let calls=0,release!:()=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>started=resolve);
  const pending=new Promise<void>(resolve=>release=resolve);
  const stop=startMaintenanceTimer(async()=>{calls++;started();await pending;},5,5);
  try {
    await Promise.race([ready,delay(1000).then(()=>{throw new Error('Timer never started');})]);
    await delay(30);assert.equal(calls,1);
    stop();release();await delay(30);assert.equal(calls,1);
  } finally {stop();release();}
});
