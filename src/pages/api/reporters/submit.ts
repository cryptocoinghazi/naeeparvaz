import type { APIRoute } from 'astro';
import { submitApplication } from '../../../lib/reporters';
import { deliverApplicationEmails } from '../../../lib/reporter-email';
import { readLimited } from '../../../lib/reporter-storage';
import { json, requireSameOrigin } from '../../../lib/editor-api';
import { randomUUID } from 'node:crypto';
import { ReporterInputError } from '../../../lib/reporter-input';
export const POST: APIRoute = async ({request}) => {
  const reference=randomUUID();
  let stage='origin';
  try {
    requireSameOrigin(request);
    stage='request';
    const data=JSON.parse((await readLimited(request,24000)).toString());
    if(!data || typeof data!=='object' || Array.isArray(data)) throw new SyntaxError();
    const form=new FormData(); for(const [key,value] of Object.entries(data)) if(typeof value==='string') form.set(key,value);
    stage='submission';
    const id=await submitApplication(request.headers.get('x-application-token') || '',form);
    // The application is committed already. Email problems must not report it as rejected.
    try {await deliverApplicationEmails(id);}
    catch {console.error(JSON.stringify({event:'reporter-email-dispatch-failed',reference,stage:'acknowledgement'}));}
    return json({id});
  } catch(error) {
    const known=error instanceof ReporterInputError;
    const code=known?error.code:stage==='origin'?'ORIGIN_REJECTED':stage==='request'?'INVALID_REQUEST':'SUBMISSION_FAILED';
    const rawCode=error && typeof error==='object' && 'code' in error?String(error.code):'';
    const databaseCode=['23502','23503','23505','22001','22P02','42P01','42703','08006','ETIMEDOUT','ECONNREFUSED'].includes(rawCode)?rawCode:undefined;
    // Never log request bodies, bearer tokens, file names, profile values or raw exceptions.
    console.error(JSON.stringify({event:'reporter-submit-failed',reference,stage,code,...(known?{field:error.field}:{}),...(databaseCode?{databaseCode}:{})}));
    if(known) return json({error:error.message,code,field:error.field,reference},422);
    return json({error:stage==='submission'?'We could not complete submission. Please try again; if it persists, give the editor this reference. / आवेदन पूरा नहीं हुआ। दोबारा प्रयास करें; समस्या बनी रहे तो संदर्भ संपादक को दें।':'The submission request was invalid. Refresh and start again. / आवेदन अनुरोध अमान्य है। पेज रीफ़्रेश करके दोबारा शुरू करें।',code,reference},stage==='submission'?500:stage==='origin'?403:400);
  }
};
