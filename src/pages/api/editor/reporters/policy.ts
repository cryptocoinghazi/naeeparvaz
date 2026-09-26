import type { APIRoute } from 'astro';
import { requireSameOrigin } from '../../../../lib/editor-api';
import { readLimited } from '../../../../lib/reporter-storage';
import { savePolicyDraft, publishPolicy, PolicyEditorError } from '../../../../lib/reporter-policy';
export const POST:APIRoute=async({request,locals,redirect})=>{
  if(!locals.adminEmail)return new Response('Unauthorized',{status:401});
  try {
    requireSameOrigin(request);
    const bytes=await readLimited(request,512000);
    const form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
    if(form.get('action')==='save')await savePolicyDraft(form);
    else if(form.get('action')==='publish')await publishPolicy(form,locals.adminEmail);
    else throw new PolicyEditorError('Invalid policy action.');
    return redirect('/editor/reporters/settings/?policySaved=1#reporter-policy-settings',303);
  }catch(error){
    const message=error instanceof PolicyEditorError?error.message:'Unable to update the reporter policy. Reload and try again.';
    return redirect(`/editor/reporters/settings/?policyError=${encodeURIComponent(message)}#reporter-policy-settings`,303);
  }
};
