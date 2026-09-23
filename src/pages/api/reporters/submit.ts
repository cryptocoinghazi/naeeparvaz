import type { APIRoute } from 'astro';
import { submitApplication } from '../../../lib/reporters';
import { deliverApplicationEmails } from '../../../lib/reporter-email';
import { readLimited } from '../../../lib/reporter-storage';
import { json, requireSameOrigin } from '../../../lib/editor-api';
export const POST: APIRoute = async ({request}) => {
  try {
    requireSameOrigin(request);
    const data=JSON.parse((await readLimited(request,24000)).toString());
    const form=new FormData(); for(const [key,value] of Object.entries(data)) if(typeof value==='string') form.set(key,value);
    const id=await submitApplication(request.headers.get('x-application-token') || '',form);
    await deliverApplicationEmails(id);
    return json({id});
  } catch {return json({error:'Unable to submit. Check required fields, consent and uploads; restart if the session expired. / आवेदन जमा नहीं हुआ।'},400);}
};
