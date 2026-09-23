import type { APIRoute } from 'astro';
import { requireSameOrigin } from '../../../../lib/editor-api';
import { readLimited } from '../../../../lib/reporter-storage';
import { reporterMaintenance } from '../../../../lib/reporter-maintenance';

export const POST:APIRoute=async({request,locals,redirect}) => {
  if(!locals.adminEmail) return new Response('Unauthorized',{status:401});
  try {
    requireSameOrigin(request);
    const body=await readLimited(request,2048);
    const form=new URLSearchParams(body.toString());
    if(form.get('confirm')!=='yes') return redirect('/editor/reporters/?maintenance=confirm',303);
    const result=await reporterMaintenance({source:'manual',actor:locals.adminEmail});
    return redirect(`/editor/reporters/?maintenance=${result}`,303);
  } catch {return redirect('/editor/reporters/?maintenance=failed',303);}
};
