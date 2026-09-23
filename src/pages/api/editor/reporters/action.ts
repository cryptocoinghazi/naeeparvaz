import type { APIRoute } from 'astro';
import { requireSameOrigin } from '../../../../lib/editor-api';
import { database, saveReporterSettings, saveTemplate } from '../../../../lib/reporters';
import { approveApplication, createCardPreview, reviewApplication } from '../../../../lib/reporter-review';
import { deliverApplicationEmails, deliverReporterEmail } from '../../../../lib/reporter-email';
import { readLimited } from '../../../../lib/reporter-storage';
export const POST: APIRoute = async ({request,locals,redirect}) => {
  if(!locals.adminEmail) return new Response('Unauthorized',{status:401});
  let destination='/editor/reporters/';
  try {
    requireSameOrigin(request);
    const bytes=await readLimited(request,6*1024*1024);
    const form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
    const action=String(form.get('action') || ''),id=String(form.get('id') || '');
    if(id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid application.');
    if(id) destination+=`${id}/`;
    if(action==='settings') {destination='/editor/reporters/settings/';await saveReporterSettings(form);}
    else if(action==='template') {destination='/editor/reporters/settings/';await saveTemplate(form);}
    else if(action==='preview') {const preview=await createCardPreview(id,form);return redirect(`${destination}?preview=${preview}`,303);}
    else if(action==='approve') {
      if(form.get('confirm')!=='yes') throw new Error('Confirm the card preview before approval.');
      await approveApplication(id,String(form.get('preview') || ''),locals.adminEmail);
    } else if(action==='retry-email') {
      const emailId=String(form.get('emailId') || '');
      const email=(await database().query("SELECT id FROM reporter_emails WHERE id=$1 AND application_id=$2 AND status='failed'",[emailId,id])).rows[0];
      if(!email) throw new Error('Only confirmed delivery failures can be retried.');
      await deliverReporterEmail(email.id);
    } else {
      if(['verify-payment','revoke','reject'].includes(action) && form.get('confirm')!=='yes') throw new Error('Explicit confirmation required.');
      const note=String(form.get('note') || '').trim(); if(note.length>2000) throw new Error('Note too long.');
      await reviewApplication(id,action,note,locals.adminEmail);
    }
    if(id) await deliverApplicationEmails(id);
    return redirect(`${destination}?saved=1`,303);
  } catch(error) {
    const message=error instanceof Error && /^(Configure|Confirm|Invalid|Review|Generate|Another card|Approve|Photo|Application|Template|Next number|Only confirmed|Explicit|Reason|Wait|name does|designation does|number does|joined does|expiry does|Fee|Unsupported|Files must|An image)/.test(error.message) ? error.message : 'Unable to complete. Check fields, private storage and email configuration.';
    return redirect(`${destination}?error=${encodeURIComponent(message)}`,303);
  }
};
