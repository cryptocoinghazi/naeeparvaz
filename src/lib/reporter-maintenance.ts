import { database, reporterSettings } from './reporters';
import { deletePrivate, reporterStorageReady } from './reporter-storage';
import { deliverReporterEmail } from './reporter-email';
import { nextMaintenanceRun } from './reporter-schedule';
import type { PoolClient } from 'pg';

export interface MaintenanceState {
  status:'idle'|'running'|'succeeded'|'partial'|'failed';
  source:'automatic'|'manual'|'command'|null;
  actor:string|null;
  started_at:Date|null; finished_at:Date|null; last_success_at:Date|null; scheduler_seen_at:Date|null; next_run_at:Date;
}
export type MaintenanceResult = 'succeeded'|'partial'|'failed'|'busy'|'not-due'|'unconfigured'|'recent';
export async function maintenanceState():Promise<MaintenanceState> {
  return (await database().query('SELECT * FROM reporter_maintenance_state WHERE id=1')).rows[0];
}
class ContinueLater extends Error {}

export async function reporterMaintenance(options:{source?:'automatic'|'manual'|'command';actor?:string}={}):Promise<MaintenanceResult> {
  const source=options.source || 'command';
  const db=database();
  if(source==='automatic') await db.query('UPDATE reporter_maintenance_state SET scheduler_seen_at=now() WHERE id=1');
  // Retention still runs when applications are closed; closed registration is not a cleanup opt-out.
  if(!reporterStorageReady() || !(await reporterSettings()).retentionConfirmed) return 'unconfigured';
  if(source==='automatic') {
    const due=await db.query('SELECT id FROM reporter_maintenance_state WHERE id=1 AND next_run_at<=now()');
    if(!due.rowCount) return 'not-due';
  }
  const client=await db.connect();
  let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('np-reporter-maintenance')) AS locked")).rows[0].locked;
    if(!locked) return 'busy';
    const state=(await client.query('SELECT *,next_run_at<=now() AS due,started_at>now()-interval \'1 minute\' AS recent FROM reporter_maintenance_state WHERE id=1')).rows[0];
    if(source==='automatic' && !state.due) return 'not-due';
    if(source==='manual' && state.recent) return 'recent';
    // If the process stops during a run, the DB lock is released and another process can catch up.
    await client.query("UPDATE reporter_maintenance_state SET status='running',source=$1,actor=$2,started_at=now(),finished_at=NULL,next_run_at=now()+interval '1 minute' WHERE id=1",[source,options.actor || null]);
    let result:'succeeded'|'partial'|'failed'='succeeded';
    try {if(await performMaintenance(client)) result='partial';}
    catch(error) {result=error instanceof ContinueLater?'partial':'failed';}
    const next=result==='succeeded'?nextMaintenanceRun():new Date(Date.now()+(result==='partial'?60000:15*60000));
    await client.query("UPDATE reporter_maintenance_state SET status=$1,finished_at=now(),last_success_at=CASE WHEN $1='succeeded' THEN now() ELSE last_success_at END,next_run_at=$2 WHERE id=1",[result,next]);
    return result;
  } finally {
    try {if(locked) await client.query("SELECT pg_advisory_unlock(hashtext('np-reporter-maintenance'))");}
    finally {client.release();}
  }
}

async function performMaintenance(client:PoolClient):Promise<boolean> {
    const deadline=Date.now()+15000;
    const checkBudget=() => {if(Date.now()>=deadline) throw new ContinueLater();};
    let more=false;
    const stale=(await client.query("SELECT id,image_key FROM reporter_previews WHERE expires_at<now() ORDER BY expires_at LIMIT 25")).rows;
    more ||= stale.length===25;
    for(const row of stale) {checkBudget();await deletePrivate(row.image_key); await client.query('DELETE FROM reporter_previews WHERE id=$1',[row.id]);}
    const files=(await client.query(`SELECT f.id,f.object_key FROM reporter_files f LEFT JOIN reporter_applications a ON a.id=f.application_id
      WHERE f.deleted_at IS NULL AND (
        (f.application_id IS NULL AND f.created_at<now()-interval '1 day') OR
        (f.kind NOT IN ('photo','card-image','card-pdf') AND a.finalized_at IS NOT NULL AND a.finalized_at + COALESCE((a.payment_terms->>'evidenceDays')::int,90)*interval '1 day'<now()) OR
        (f.kind='photo' AND a.status='rejected' AND a.finalized_at + COALESCE((a.payment_terms->>'profileDays')::int,90)*interval '1 day'<now())
      ) ORDER BY f.created_at,f.id LIMIT 25`)).rows;
    more ||= files.length===25;
    for(const row of files) {checkBudget();await deletePrivate(row.object_key);await client.query('UPDATE reporter_files SET deleted_at=now() WHERE id=$1',[row.id]);}
    const expired=(await client.query(`SELECT a.id FROM reporter_applications a LEFT JOIN reporter_cards c ON c.application_id=a.id WHERE a.purged_at IS NULL AND (
      (a.status='rejected' AND a.finalized_at + GREATEST(COALESCE((a.payment_terms->>'profileDays')::int,90),COALESCE((a.payment_terms->>'evidenceDays')::int,90))*interval '1 day'<now()) OR
      (a.status='approved' AND COALESCE(c.revoked_at,(c.expires_on+1)::timestamp AT TIME ZONE 'Asia/Kolkata') + COALESCE((a.payment_terms->>'profileDays')::int,90)*interval '1 day'<now())
    ) ORDER BY a.created_at,a.id LIMIT 10`)).rows;
    more ||= expired.length===10;
    for(const {id} of expired) {
      checkBudget();
      await client.query('BEGIN');
      try {
        await client.query('SELECT id FROM reporter_applications WHERE id=$1 FOR UPDATE',[id]);
        const remaining=(await client.query('SELECT id,object_key FROM reporter_files WHERE application_id=$1 AND deleted_at IS NULL',[id])).rows;
        for(const row of remaining) {checkBudget();await deletePrivate(row.object_key);await client.query('UPDATE reporter_files SET deleted_at=now() WHERE id=$1',[row.id]);}
        const card=(await client.query('SELECT * FROM reporter_cards WHERE application_id=$1 AND deleted_at IS NULL',[id])).rows[0];
        if(card) {await deletePrivate(card.image_key);await deletePrivate(card.pdf_key);await client.query('UPDATE reporter_cards SET deleted_at=now() WHERE id=$1',[card.id]);}
        await client.query("UPDATE reporter_applications SET profile='{}',purged_at=now() WHERE id=$1",[id]);
        await client.query('DELETE FROM reporter_policy_acceptances WHERE application_id=$1',[id]);
        await client.query("UPDATE reporter_events SET note='' WHERE application_id=$1",[id]);
        await client.query("UPDATE reporter_emails SET body='',subject='',status=CASE WHEN status IN ('pending','sending') THEN 'unknown' ELSE status END WHERE application_id=$1",[id]);
        await client.query('DELETE FROM reporter_corrections WHERE application_id=$1',[id]);
        await client.query('COMMIT');
      } catch(error) {await client.query('ROLLBACK');throw error;}
    }
    // Remove personal email from expired upload sessions after their files are detached.
    await client.query("UPDATE reporter_upload_sessions SET email='' WHERE expires_at<now()-interval '1 day'");
    await client.query('DELETE FROM reporter_rate_limits WHERE expires_at<now()');
    await client.query('DELETE FROM reporter_corrections WHERE expires_at<now() OR used_at IS NOT NULL');
    await client.query("UPDATE reporter_emails SET status='unknown' WHERE status='sending' AND last_attempt_at<now()-interval '10 minutes'");
    const pending=(await client.query("SELECT id FROM reporter_emails WHERE status='pending' ORDER BY created_at LIMIT 5")).rows;
    more ||= pending.length===5;
    for(const {id} of pending) {checkBudget();await deliverReporterEmail(id);}
    return more;
}
