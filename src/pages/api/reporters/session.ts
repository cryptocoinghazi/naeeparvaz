import type { APIRoute } from 'astro';
import { startApplication, enforceLimit, requestLimitKey } from '../../../lib/reporters';
import { verifyTurnstile } from '../../../lib/turnstile';
import { json, requireSameOrigin } from '../../../lib/editor-api';
import { readLimited } from '../../../lib/reporter-storage';
export const POST: APIRoute = async ({request}) => {
  try {
    requireSameOrigin(request);
    await enforceLimit(requestLimitKey(request),10,3600);
    const body=JSON.parse((await readLimited(request,16000)).toString());
    await verifyTurnstile(request,String(body.turnstile || ''),'reporter');
    return json(await startApplication(body.email,body.correction));
  } catch {return json({error:'Unable to begin. Check your email, verification and correction link, or try again later. / आवेदन शुरू नहीं हुआ। जानकारी जाँचें।'},400);}
};
