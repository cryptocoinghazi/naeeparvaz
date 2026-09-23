import { database } from './reporters';
import { deletePrivate } from './reporter-storage';
import { deliverReporterEmail } from './reporter-email';

export async function reporterMaintenance() {
  const db=database(),client=await db.connect();
  const lock=(await client.query("SELECT pg_try_advisory_lock(hashtext('np-reporter-maintenance')) AS locked")).rows[0].locked;
  if(!lock) {client.release();return;}
  try {
    const stale=(await client.query("SELECT id,image_key FROM reporter_previews WHERE expires_at<now()")).rows;
    for(const row of stale) {await deletePrivate(row.image_key); await client.query('DELETE FROM reporter_previews WHERE id=$1',[row.id]);}
    const files=(await client.query(`SELECT f.id,f.object_key FROM reporter_files f LEFT JOIN reporter_applications a ON a.id=f.application_id
      WHERE f.deleted_at IS NULL AND (
        (f.application_id IS NULL AND f.created_at<now()-interval '1 day') OR
        (f.kind NOT IN ('photo','card-image','card-pdf') AND a.finalized_at IS NOT NULL AND a.finalized_at + COALESCE((a.payment_terms->>'evidenceDays')::int,90)*interval '1 day'<now()) OR
        (f.kind='photo' AND a.status='rejected' AND a.finalized_at + COALESCE((a.payment_terms->>'profileDays')::int,90)*interval '1 day'<now())
      )`)).rows;
    for(const row of files) {await deletePrivate(row.object_key);await client.query('UPDATE reporter_files SET deleted_at=now() WHERE id=$1',[row.id]);}
    const expired=(await client.query(`SELECT a.id FROM reporter_applications a LEFT JOIN reporter_cards c ON c.application_id=a.id WHERE a.purged_at IS NULL AND (
      (a.status='rejected' AND a.finalized_at + GREATEST(COALESCE((a.payment_terms->>'profileDays')::int,90),COALESCE((a.payment_terms->>'evidenceDays')::int,90))*interval '1 day'<now()) OR
      (a.status='approved' AND COALESCE(c.revoked_at,(c.expires_on+1)::timestamp AT TIME ZONE 'Asia/Kolkata') + COALESCE((a.payment_terms->>'profileDays')::int,90)*interval '1 day'<now())
    )`)).rows;
    for(const {id} of expired) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT id FROM reporter_applications WHERE id=$1 FOR UPDATE',[id]);
        const remaining=(await client.query('SELECT id,object_key FROM reporter_files WHERE application_id=$1 AND deleted_at IS NULL',[id])).rows;
        for(const row of remaining) {await deletePrivate(row.object_key);await client.query('UPDATE reporter_files SET deleted_at=now() WHERE id=$1',[row.id]);}
        const card=(await client.query('SELECT * FROM reporter_cards WHERE application_id=$1 AND deleted_at IS NULL',[id])).rows[0];
        if(card) {await deletePrivate(card.image_key);await deletePrivate(card.pdf_key);await client.query('UPDATE reporter_cards SET deleted_at=now() WHERE id=$1',[card.id]);}
        await client.query("UPDATE reporter_applications SET profile='{}',purged_at=now() WHERE id=$1",[id]);
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
    const pending=(await client.query("SELECT id FROM reporter_emails WHERE status='pending' ORDER BY created_at LIMIT 50")).rows;
    for(const {id} of pending) await deliverReporterEmail(id);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('np-reporter-maintenance'))"); client.release();
  }
}
