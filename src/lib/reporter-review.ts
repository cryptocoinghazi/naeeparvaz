import { randomBytes, randomUUID } from 'node:crypto';
import { withTransaction } from './database';
import { application, applicationFiles, currentTemplate, database, enqueueEmail, event, hashToken, reporterSettings } from './reporters';
import { anniversary, loadOriginalTemplate, renderCard, reporterNumber, type CardInput } from './reporter-card';
import { getPrivate, putPrivate } from './reporter-storage';
import { requiredText } from './validation';

export async function createCardPreview(id:string, form:FormData):Promise<string> {
  const app=await application(id), settings=await reporterSettings(), template=await currentTemplate();
  if(!app || app.purged_at || app.status==='approved' || app.status==='rejected') throw new Error('Application cannot be previewed.');
  if(!template || !settings.nextNumber) throw new Error('Configure the template and next reporter number first.');
  const photo=(await applicationFiles(id)).find((f) => f.kind==='photo'); if(!photo) throw new Error('Photo unavailable.');
  const input:CardInput={name:app.profile.name,designation:requiredText(form.get('designation'),'Designation',2,60),number:reporterNumber(settings.nextNumber),joined:requiredText(form.get('joined'),'Joining date',10,10),cropX:Number(form.get('cropX')),cropY:Number(form.get('cropY')),zoom:Number(form.get('zoom'))};
  anniversary(input.joined);
  const rendered=await renderCard(template.object_key ? await getPrivate(template.object_key) : await loadOriginalTemplate(),await getPrivate(photo.object_key),template.layout,input);
  const previewId=randomUUID(),key=`previews/${previewId}.png`;
  await database().query("INSERT INTO reporter_previews(id,application_id,input,application_version,template_id,image_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes')",[previewId,id,input,app.updated_at,template.id,key]);
  await putPrivate(key,rendered.image,'image/png');
  return previewId;
}
export async function approveApplication(id:string,previewId:string,actor:string):Promise<void> {
  await withTransaction({},async(client) => {
    const app=(await client.query('SELECT * FROM reporter_applications WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!app || app.purged_at) throw new Error('Application unavailable.');
    if(app.status==='approved') return;
    if(app.status!=='under-review' || !app.payment_verified) throw new Error('Review and verify payment first.');
    const settings=(await client.query('SELECT * FROM reporter_settings WHERE id=1 FOR UPDATE')).rows[0];
    const preview=(await client.query('SELECT * FROM reporter_previews WHERE id=$1 AND application_id=$2 AND expires_at>now()',[previewId,id])).rows[0];
    if(!preview || new Date(preview.application_version).getTime()!==new Date(app.updated_at).getTime()) throw new Error('Generate a fresh preview after completing the review.');
    const template=(await client.query('SELECT * FROM reporter_templates WHERE id=$1',[preview.template_id])).rows[0];
    if(!template?.approved || settings.settings.templateId!==template.id) throw new Error('Approve the current template before issuing cards.');
    const number=Number(settings.next_number);
    if(preview.input.number!==reporterNumber(number)) throw new Error('Another card was issued. Generate a fresh preview for the next number.');
    const photo=(await client.query("SELECT * FROM reporter_files WHERE application_id=$1 AND kind='photo' AND deleted_at IS NULL AND validated=true",[id])).rows[0];
    if(!photo) throw new Error('Photo unavailable.');
    const rendered=await renderCard(template.object_key ? await getPrivate(template.object_key) : await loadOriginalTemplate(),await getPrivate(photo.object_key),template.layout,preview.input);
    const cardId=randomUUID(),imageKey=`cards/${cardId}.png`,pdfKey=`cards/${cardId}.pdf`;
    // Record generated objects outside the approval transaction so rollback cannot orphan stored files.
    const imageFile=randomUUID(),pdfFile=randomUUID();
    await database().query("INSERT INTO reporter_files(id,kind,object_key,mime,byte_size,validated) VALUES($1,'card-image',$2,'image/png',$3,true),($4,'card-pdf',$5,'application/pdf',$6,true)",[imageFile,imageKey,rendered.image.length,pdfFile,pdfKey,rendered.pdf.length]);
    await putPrivate(imageKey,rendered.image,'image/png'); await putPrivate(pdfKey,rendered.pdf,'application/pdf');
    await client.query('UPDATE reporter_files SET application_id=$1 WHERE id IN ($2,$3)',[id,imageFile,pdfFile]);
    await client.query('INSERT INTO reporter_cards(id,application_id,number,designation,joined_on,expires_on,template_id,layout,image_key,pdf_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[cardId,id,number,preview.input.designation,preview.input.joined,anniversary(preview.input.joined),template.id,template.layout,imageKey,pdfKey]);
    await client.query('UPDATE reporter_settings SET next_number=next_number+1 WHERE id=1');
    await client.query("UPDATE reporter_applications SET status='approved',finalized_at=now(),updated_at=now() WHERE id=$1",[id]);
    await event(client,id,actor,'approved');
    await enqueueEmail(client,id,'approval','Naee Parvaz — Reporter application approved / आवेदन स्वीकृत',`Your application is approved. Reporter ID: ${reporterNumber(number)}. Designation: ${preview.input.designation}. Valid until ${anniversary(preview.input.joined)}. Your digital card is attached. This is an organizational ID, not government accreditation.\nआपका आवेदन स्वीकृत है। आपका संगठन पहचान पत्र संलग्न है।`);
  });
}
export async function reviewApplication(id:string,action:string,note:string,actor:string) {
  await withTransaction({},async(client) => {
    const app=(await client.query('SELECT * FROM reporter_applications WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!app || app.purged_at) throw new Error('Application unavailable.');
    if(action==='revoke') {
      if(app.status!=='approved' || !note.trim()) throw new Error('Reason required.');
      const changed=await client.query('UPDATE reporter_cards SET revoked_at=now() WHERE application_id=$1 AND revoked_at IS NULL RETURNING id',[id]);
      if(changed.rowCount) {await event(client,id,actor,'revoked',note); await enqueueEmail(client,id,'revocation','Naee Parvaz — ID revoked / पहचान पत्र निरस्त',`Your reporter ID has been revoked. Please stop using the card.\nReason / कारण: ${note}`);}
      return;
    }
    if(['approved','rejected'].includes(app.status)) throw new Error('Review is already finalized.');
    if(action==='verify-payment') {
      if(!['submitted','under-review'].includes(app.status)) throw new Error('Wait for resubmission.');
      await client.query("UPDATE reporter_applications SET payment_verified=true,status='under-review',updated_at=now() WHERE id=$1",[id]);
    } else if(action==='under-review') {
      if(app.status==='changes-requested') throw new Error('Wait for resubmission.');
      await client.query("UPDATE reporter_applications SET status='under-review',updated_at=now() WHERE id=$1",[id]);
    } else if(action==='changes-requested') {
      if(!note.trim()) throw new Error('Explain the changes required.');
      const token=randomBytes(32).toString('hex');
      await client.query('UPDATE reporter_corrections SET used_at=now() WHERE application_id=$1 AND used_at IS NULL',[id]);
      await client.query("INSERT INTO reporter_corrections(token_hash,application_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),id]);
      await client.query("UPDATE reporter_applications SET status='changes-requested',payment_verified=false,updated_at=now() WHERE id=$1",[id]);
      const origin=process.env.REPORTER_SITE_ORIGIN || 'https://naeeparvaz.com';
      await enqueueEmail(client,id,'correction','Naee Parvaz — Application changes required / सुधार आवश्यक',`Please update your application within seven days.\n${note}\n${origin}/${app.locale}/join/?correction=${token}\nOpen this private link and enter the same application email. Do not share the link.`);
    } else if(action==='reject') {
      if(!note.trim()) throw new Error('Reason required.');
      await client.query("UPDATE reporter_applications SET status='rejected',finalized_at=now(),updated_at=now() WHERE id=$1",[id]);
      await client.query('UPDATE reporter_corrections SET used_at=now() WHERE application_id=$1 AND used_at IS NULL',[id]);
      await enqueueEmail(client,id,'rejection','Naee Parvaz — Application decision / आवेदन निर्णय',`Your application was not approved.\nReason / कारण: ${note}\nRefund policy / वापसी नीति:\n${app.payment_terms.refundEn}\n${app.payment_terms.refundHi}`);
    } else throw new Error('Invalid review action.');
    await event(client,id,actor,action,note);
  });
}
