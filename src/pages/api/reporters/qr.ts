import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { reporterSettings } from '../../../lib/reporters';
import { getPrivate } from '../../../lib/reporter-storage';
export const GET: APIRoute = async ({url}) => {
  const s=await reporterSettings();
  // Versioned QR references preserve the exact payment terms shown at session creation.
  const requested=url.searchParams.get('version');
  let key=s.qrKey,mime=s.qrMime;
  if(requested==='original') {key=undefined;mime=undefined;}
  else if(requested && requested!==s.qrKey) {
    const {database}=await import('../../../lib/reporters');
    const row=(await database().query("SELECT terms FROM reporter_upload_sessions WHERE terms->>'qrKey'=$1 AND expires_at>now() LIMIT 1",[requested])).rows[0];
    if(!row) return new Response('Not found',{status:404}); key=row.terms.qrKey; mime=row.terms.qrMime;
  }
  const bytes=key ? await getPrivate(key) : await readFile(`${process.cwd()}/assets/reporters/payment-qr.jpeg`);
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':mime || 'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
};
