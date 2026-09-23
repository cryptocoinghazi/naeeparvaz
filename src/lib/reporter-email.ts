import { database } from './reporters';
import { getPrivate } from './reporter-storage';

export async function deliverReporterEmail(id:string):Promise<void> {
  const db=database();
  const claim=(await db.query("UPDATE reporter_emails SET status='sending',attempts=attempts+1,last_attempt_at=now() WHERE id=$1 AND status IN ('pending','failed') RETURNING *",[id])).rows[0];
  if(!claim) return;
  let attempted=false;
  try {
    const app=(await db.query('SELECT * FROM reporter_applications WHERE id=$1',[claim.application_id])).rows[0];
    if(!app || app.purged_at || !process.env.RESEND_API_KEY) throw new Error('Delivery unavailable');
    const attachments=[];
    if(claim.kind==='approval') {
      const card=(await db.query("SELECT * FROM reporter_cards WHERE application_id=$1 AND revoked_at IS NULL AND deleted_at IS NULL AND expires_on>=(now() AT TIME ZONE 'Asia/Kolkata')::date",[app.id])).rows[0];
      if(!card) throw new Error('Card unavailable');
      attachments.push({filename:'Naee-Parvaz-Reporter-ID.pdf',content:(await getPrivate(card.pdf_key)).toString('base64')});
    }
    attempted=true;
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`reporter-${id}`},body:JSON.stringify({from:`Naee Parvaz <${process.env.CONTACT_FROM_EMAIL || 'website@send.naeeparvaz.com'}>`,to:[app.profile.email],subject:claim.subject,text:claim.body,attachments})});
    await db.query('UPDATE reporter_emails SET status=$2,sent_at=CASE WHEN $2=\'sent\' THEN now() ELSE NULL END WHERE id=$1',[id,response.ok ? 'sent' : response.status>=500 ? 'unknown' : 'failed']);
  } catch {
    // Ambiguous network outcomes are never automatically resent.
    await db.query('UPDATE reporter_emails SET status=$2 WHERE id=$1',[id,attempted?'unknown':'failed']);
  }
}
export async function deliverApplicationEmails(applicationId:string) {
  const ids=(await database().query("SELECT id FROM reporter_emails WHERE application_id=$1 AND status='pending' ORDER BY created_at LIMIT 5",[applicationId])).rows;
  for(const {id} of ids) await deliverReporterEmail(id);
}
