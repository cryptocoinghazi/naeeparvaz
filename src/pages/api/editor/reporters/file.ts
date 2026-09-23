import type { APIRoute } from 'astro';
import { database } from '../../../../lib/reporters';
import { getPrivate } from '../../../../lib/reporter-storage';
export const GET: APIRoute = async ({locals,url}) => {
  if(!locals.adminEmail) return new Response('Unauthorized',{status:401});
  const id=url.searchParams.get('id'),kind=url.searchParams.get('kind');
  if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found',{status:404});
  try {
    let key:string|undefined,mime='image/png';
    if(kind==='preview') key=(await database().query('SELECT image_key FROM reporter_previews WHERE id=$1 AND expires_at>now()',[id])).rows[0]?.image_key;
    else if(kind==='card-image' || kind==='card-pdf') { const card=(await database().query('SELECT * FROM reporter_cards WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0]; key=kind==='card-pdf'?card?.pdf_key:card?.image_key; mime=kind==='card-pdf'?'application/pdf':'image/png'; }
    else {const file=(await database().query('SELECT * FROM reporter_files WHERE id=$1 AND application_id IS NOT NULL AND validated=true AND deleted_at IS NULL',[id])).rows[0]; key=file?.object_key; mime=file?.mime;}
    if(!key) return new Response('Not found',{status:404});
    const bytes=await getPrivate(key);
    const download=mime==='application/pdf' || url.searchParams.get('download')==='1';
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':mime,'Cache-Control':'no-store','Content-Disposition':`${download?'attachment':'inline'}; filename="reporter-${kind==='card-pdf'?'card':'file'}.${mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'}"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch {return new Response('File unavailable',{status:404});}
};
