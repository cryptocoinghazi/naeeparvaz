import type { APIRoute } from 'astro';
import { uploadApplicationFile, enforceLimit, requestLimitKey } from '../../../lib/reporters';
import { readLimited } from '../../../lib/reporter-storage';
import { json, requireSameOrigin } from '../../../lib/editor-api';
export const POST: APIRoute = async ({request}) => {
  try {
    requireSameOrigin(request);
    await enforceLimit(`files:${requestLimitKey(request)}`,40,3600);
    const id=await uploadApplicationFile(request.headers.get('x-application-token') || '',request.headers.get('x-file-kind') || '',await readLimited(request));
    return json({id});
  } catch {return json({error:'Upload rejected. Use a valid image or non-encrypted PDF up to 5 MB; the session may have expired. / अपलोड असफल।'},400);}
};
