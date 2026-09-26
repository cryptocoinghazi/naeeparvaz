import type { Profile, ReporterSettings } from '../lib/reporters';
import { ReporterInputError, reporterText, reporterTextRules } from '../lib/reporter-input';
import type { PublicReporterPolicy } from '../lib/reporter-policy-text';
const begin=document.querySelector<HTMLFormElement>('[data-reporter-begin]');
const form=document.querySelector<HTMLFormElement>('[data-reporter-form]');
if(begin && form) {
  let token=''; const hi=form.dataset.locale==='hi';
  const status=document.querySelector<HTMLElement>('[data-reporter-status]')!;
  const uploaded=new Map<string,File>();
  let invalidField:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|undefined;
  const fieldError=document.createElement('small');fieldError.id='reporter-field-error';fieldError.setAttribute('role','alert');
  const clearFieldError=() => {invalidField?.removeAttribute('aria-invalid');invalidField?.removeAttribute('aria-describedby');fieldError.remove();invalidField=undefined;};
  const showFieldError=(field:string,message:string) => {
    clearFieldError();
    const candidate=(field.startsWith('file:')?null:form.elements.namedItem(field)) || Array.from(form.querySelectorAll<HTMLInputElement>('[data-file-kind]')).find(input=>input.dataset.fileKind===field.replace(/^file:/,''));
    if(candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement || candidate instanceof HTMLSelectElement) {
      if(candidate.closest('[hidden]'))return;
      invalidField=candidate;candidate.setAttribute('aria-invalid','true');candidate.setAttribute('aria-describedby',fieldError.id);
      fieldError.textContent=message;candidate.after(fieldError);candidate.focus();candidate.scrollIntoView({block:'center'});
    }
  };
  form.addEventListener('input',event=>{if(event.target===invalidField)clearFieldError();});
  const correction=new URL(location.href).searchParams.get('correction') || undefined;
  // Remove the bearer link from history/address bar after capturing it.
  if(correction) history.replaceState(null,'',location.pathname);
  begin.addEventListener('submit',async(event) => {
    event.preventDefault(); const button=begin.querySelector<HTMLButtonElement>('button')!; button.disabled=true;
    try {
      const data=new FormData(begin);
      const response=await fetch('/api/reporters/session/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),turnstile:data.get('cf-turnstile-response'),correction})});
      const result=await response.json() as {token:string;error?:string;profile?:Profile;files?:string[];terms:ReporterSettings;policy?:PublicReporterPolicy|null};
      if(!response.ok) throw new Error(result.error);
      token=result.token; const s=result.terms;
      const policy=result.policy;
      form.querySelector<HTMLElement>('[data-reporter-policy]')!.hidden=!policy;
      form.querySelector<HTMLElement>('[data-policy-link]')!.hidden=!policy;
      const policyConsent=form.querySelector<HTMLInputElement>('[name="policyConsent"]')!;
      policyConsent.checked=false;policyConsent.required=!!policy;policyConsent.disabled=!policy;
      form.querySelector<HTMLInputElement>('[name="policyVersionId"]')!.value=policy?String(policy.id):'';
      form.querySelector('[data-policy-title]')!.textContent=policy?(hi?policy.document.titleHi:policy.document.titleEn):'';
      form.querySelector('[data-policy-version]')!.textContent=policy?String(policy.id):'';
      form.querySelector('[data-policy-body]')!.textContent=policy?(hi?policy.document.bodyHi:policy.document.bodyEn):'';
      form.querySelector('[data-policy-attestation]')!.textContent=policy?(hi?policy.document.attestationHi:policy.document.attestationEn):'';
      if(result.profile) for(const [key,value] of Object.entries(result.profile)) {const field=form.elements.namedItem(key); if(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value=value;}
      for(const kind of result.files || []) {const field=form.querySelector<HTMLInputElement>(`[data-file-kind="${kind}"]`); if(field) field.required=false; const note=form.querySelector(`[data-existing-kind="${kind}"]`); if(note) note.textContent=hi?'पहले अपलोड की गई फ़ाइल मौजूद है; बदलना वैकल्पिक है।':'Existing file retained; replacement optional.';}
      document.querySelector('[data-payment-summary]')!.textContent=`₹${s.fee.toFixed(2)} — ${s.payee}`;
      document.querySelector<HTMLImageElement>('[data-payment-qr]')!.src=`/api/reporters/qr/?version=${encodeURIComponent(s.qrKey || 'original')}`;
      document.querySelector('[data-payment-instructions]')!.textContent=hi?s.instructionsHi:s.instructionsEn;
      document.querySelector('[data-payment-refund]')!.textContent=hi?s.refundHi:s.refundEn;
      document.querySelector('[data-retention]')!.textContent=hi?`अंतिम समीक्षा के ${s.evidenceDays} दिन बाद प्रमाण हटाए जाएँगे। फोटो, प्रोफ़ाइल और कार्ड वैधता समाप्ति या निरस्तीकरण के ${s.profileDays} दिन बाद हटेंगे।`:`Evidence is removed ${s.evidenceDays} days after final review. Your profile, photo and card are retained until ${s.profileDays} days after expiry or revocation.`;
      begin.hidden=true; form.hidden=false; status.textContent=hi?'30 मिनट के भीतर आवेदन पूरा करें।':'Complete your application within 30 minutes.';
      form.querySelector<HTMLInputElement>('input')?.focus();
    } catch(error) {status.textContent=error instanceof Error?error.message:'Unable to start.';}
    finally {button.disabled=false;}
  });
  form.addEventListener('submit',async(event) => {
    event.preventDefault(); const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!; button.disabled=true;
    try {
      clearFieldError();
      const values=new FormData(form);
      // Validate trimmed values before uploading anything, including when HTML validation is bypassed.
      for(const key of Object.keys(reporterTextRules) as (keyof typeof reporterTextRules)[]) reporterText(values,key);
      if(form.querySelector<HTMLInputElement>('[name="policyConsent"]')?.required && values.get('policyConsent')!=='yes')throw new ReporterInputError('POLICY_CONSENT_REQUIRED','policyConsent',hi?'आवेदन जमा करने से पहले रिपोर्टर नीति पढ़ें और स्वीकार करें।':'Read and accept the reporter policy before submitting.');
      for(const field of form.querySelectorAll<HTMLInputElement>('[data-file-kind]')) {
        const file=field.files?.[0],kind=field.dataset.fileKind!;
        if(!file || uploaded.get(kind)===file) continue;
        if(file.size>5*1024*1024) throw new ReporterInputError('FILE_TOO_LARGE',`file:${kind}`,hi?'फ़ाइल 5 MB से बड़ी है।':'This file must be 5 MB or smaller.');
        status.textContent=hi?'फ़ाइल अपलोड हो रही है…':`Uploading ${kind}…`;
        const response=await fetch('/api/reporters/upload/',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Application-Token':token,'X-File-Kind':kind},body:file});
        if(!response.ok) throw new ReporterInputError('UPLOAD_REJECTED',`file:${kind}`,(await response.json()).error); uploaded.set(kind,file);
      }
      const data=Object.fromEntries(new FormData(form)); data.locale=hi?'hi':'en';
      const response=await fetch('/api/reporters/submit/',{method:'POST',headers:{'Content-Type':'application/json','X-Application-Token':token},body:JSON.stringify(data)});
      const result=await response.json();
      if(!response.ok) {
        if(result.code==='MISSING_UPLOAD' && typeof result.field==='string') uploaded.delete(result.field);
        if(typeof result.field==='string') showFieldError(result.field,result.error);
        throw new Error(`${result.error}${result.reference?` (${hi?'संदर्भ':'Reference'}: ${result.reference})`:''}`);
      }
      form.hidden=true; status.textContent=hi?`आवेदन प्राप्त हुआ। संदर्भ: ${result.id}`:`Application received. Reference: ${result.id}. Email delivery is tracked by the editor.`; status.scrollIntoView({block:'center'});
    } catch(error) {status.textContent=error instanceof Error?error.message:'Submission failed.';if(error instanceof ReporterInputError)showFieldError(error.field,error.message);if(!invalidField)status.scrollIntoView({block:'center'});}
    finally {button.disabled=false;}
  });
}
