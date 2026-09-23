import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getDatabase, withTransaction } from './database';
import { anniversary, indiaToday, defaultCardLayout, validateCardLayout, type CardLayout } from './reporter-card';
import { reporterStorageReady, putPrivate, validateReporterFile } from './reporter-storage';
import { requiredText, optionalText, validEmail } from './validation';

export interface ReporterSettings {
  enabled:boolean; fee:number; payee:string; instructionsEn:string; instructionsHi:string;
  refundEn:string; refundHi:string; qrKey?:string; qrMime?:string;
  evidenceDays:number; profileDays:number; retentionConfirmed:boolean; templateId?:string;
}
export const reporterDefaults:ReporterSettings={enabled:false,fee:0,payee:'MAHAMMAD AASIM AASIF ALI',instructionsEn:'',instructionsHi:'',refundEn:'',refundHi:'',evidenceDays:90,profileDays:90,retentionConfirmed:false};
function paymentSnapshot(s:ReporterSettings):ReporterSettings {
  return {enabled:s.enabled,fee:s.fee,payee:s.payee,instructionsEn:s.instructionsEn,instructionsHi:s.instructionsHi,refundEn:s.refundEn,refundHi:s.refundHi,qrKey:s.qrKey,qrMime:s.qrMime,evidenceDays:s.evidenceDays,profileDays:s.profileDays,retentionConfirmed:s.retentionConfirmed};
}
export interface Profile { name:string; email:string; phone:string; address:string; area:string; languages:string; education:string; experience:string; identityType:string; transaction:string; paymentDate:string; workSamples:string }
export interface Application { id:string; locale:'en'|'hi'; status:string; profile:Profile; payment_terms:ReporterSettings; payment_verified:boolean; created_at:string; updated_at:string; finalized_at?:string; purged_at?:string }
export interface ReporterFile {id:string;kind:string;object_key:string;mime:string;byte_size:number;validated:boolean;deleted_at?:string}
export interface Card {id:string;number:number;designation:string;joined_on:Date|string;expires_on:Date|string;image_key:string;pdf_key:string;revoked_at?:string;deleted_at?:string}
export const hashToken=(value:string) => createHash('sha256').update(value).digest('hex');
export function database() { const db=getDatabase(); if(!db) throw new Error('Database unavailable.'); return db; }
export async function reporterSettings():Promise<ReporterSettings & {nextNumber:number|null}> {
  try { const row=(await database().query('SELECT * FROM reporter_settings WHERE id=1')).rows[0]; return {...reporterDefaults,...row.settings,nextNumber:row.next_number ? Number(row.next_number) : null}; }
  catch {return {...reporterDefaults,nextNumber:null};}
}
export function applicationsConfigured(s:ReporterSettings):boolean {
  return reporterStorageReady() && !!process.env.RESEND_API_KEY && s.fee>0 && !!(s.payee && s.instructionsEn && s.instructionsHi && s.refundEn && s.refundHi && s.retentionConfirmed);
}
export async function listApplications(page=1):Promise<Application[]> {
  const safePage=Number.isSafeInteger(page) && page>0 && page<=100000 ? page : 1;
  return (await database().query('SELECT * FROM reporter_applications ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $1',[(safePage-1)*50])).rows;
}
export async function application(id:string):Promise<Application|undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await database().query('SELECT * FROM reporter_applications WHERE id=$1',[id])).rows[0];
}
export async function applicationFiles(id:string):Promise<ReporterFile[]> {
  return (await database().query("SELECT * FROM reporter_files WHERE application_id=$1 AND deleted_at IS NULL AND validated=true AND kind NOT IN ('card-image','card-pdf')",[id])).rows;
}
export async function event(client:PoolClient,id:string,actor:string,action:string,note='') {
  await client.query('INSERT INTO reporter_events(application_id,actor,action,note) VALUES($1,$2,$3,$4)',[id,actor,action,note]);
}
export async function enqueueEmail(client:PoolClient,id:string,kind:string,subject:string,body:string) {
  await client.query('INSERT INTO reporter_emails(id,application_id,kind,subject,body) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,kind,subject,body]);
}
export async function enforceLimit(key:string,max:number,seconds:number) {
  const result=await database().query(`INSERT INTO reporter_rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reporter_rate_limits.expires_at<now() THEN 1 ELSE reporter_rate_limits.count+1 END,
    expires_at=CASE WHEN reporter_rate_limits.expires_at<now() THEN excluded.expires_at ELSE reporter_rate_limits.expires_at END RETURNING count`,[key,seconds]);
  if (result.rows[0].count>max) throw new Error('Too many attempts. Please try again later.');
}
export function requestLimitKey(request:Request):string {
  if (!process.env.SESSION_SECRET) throw new Error('Application security not configured.');
  return createHmac('sha256',process.env.SESSION_SECRET).update(`reporter:${request.headers.get('do-connecting-ip') || 'unknown'}`).digest('hex');
}
export async function startApplication(emailValue:unknown, correctionToken?:string):Promise<{token:string;profile?:Profile;files?:string[];terms:ReporterSettings}> {
  const email=validEmail(String(emailValue || ''));
  const settings=await reporterSettings();
  if (!settings.enabled || !applicationsConfigured(settings)) throw new Error('Applications are currently closed.');
  await enforceLimit(`email:${hashToken(email)}`,5,3600);
  let existing:Application|undefined;
  if (correctionToken) {
    existing=(await database().query(`SELECT a.* FROM reporter_corrections c JOIN reporter_applications a ON a.id=c.application_id WHERE c.token_hash=$1 AND c.used_at IS NULL AND c.expires_at>now() AND a.status='changes-requested' AND a.purged_at IS NULL`,[hashToken(correctionToken)])).rows[0];
    if(!existing || existing.profile.email.toLowerCase()!==email.toLowerCase()) throw new Error('Invalid correction link or email.');
  }
  const token=randomBytes(32).toString('hex');
  const terms=paymentSnapshot(existing?.payment_terms || settings);
  await database().query(`INSERT INTO reporter_upload_sessions(id,token_hash,email,application_id,expires_at,terms) VALUES($1,$2,$3,$4,now()+interval '30 minutes',$5)`,[randomUUID(),hashToken(token),email,existing?.id || null,terms]);
  return {token,terms,profile:existing?.profile,files:existing ? (await applicationFiles(existing.id)).map((f) => f.kind) : undefined};
}
export async function uploadApplicationFile(token:string,kind:string,bytes:Buffer) {
  if(!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid session.');
  if(!['photo','identity','payment','qualification','experience'].includes(kind)) throw new Error('Invalid file category.');
  const session=(await database().query('SELECT * FROM reporter_upload_sessions WHERE token_hash=$1 AND expires_at>now() AND submitted_id IS NULL',[hashToken(token)])).rows[0];
  if(!session) throw new Error('Upload session expired.');
  await enforceLimit(`upload:${hashToken(token)}`,12,1800);
  const validated=await validateReporterFile(bytes,kind);
  const id=randomUUID(),key=`applications/${session.id}/${id}`;
  await database().query('INSERT INTO reporter_files(id,session_id,kind,object_key,mime,byte_size) VALUES($1,$2,$3,$4,$5,$6)',[id,session.id,kind,key,validated.mime,validated.bytes.length]);
  await putPrivate(key,validated.bytes,validated.mime);
  await database().query('UPDATE reporter_files SET validated=true WHERE id=$1',[id]);
  return id;
}
export function validateProfile(form:FormData,email:string):Profile {
  const p:Profile={name:requiredText(form.get('name'),'Name',2,100),email,phone:requiredText(form.get('phone'),'Phone',7,30),address:requiredText(form.get('address'),'Address',10,600),area:requiredText(form.get('area'),'Reporting area',2,200),languages:requiredText(form.get('languages'),'Languages',2,200),education:requiredText(form.get('education'),'Education',2,300),experience:requiredText(form.get('experience'),'Experience (or none)',2,2000),identityType:String(form.get('identityType') || ''),transaction:requiredText(form.get('transaction'),'Transaction reference',4,100),paymentDate:requiredText(form.get('paymentDate'),'Payment date',10,10),workSamples:optionalText(form.get('workSamples'),'Work samples',2000)};
  if(!['masked-aadhaar','voter-id','driving-licence'].includes(p.identityType)) throw new Error('Choose an identity proof.');
  anniversary(p.paymentDate); // Strict calendar validation (rejects dates such as February 30).
  if(p.paymentDate>indiaToday()) throw new Error('Invalid payment date.');
  if(form.get('consent')!=='yes' || form.get('paymentConsent')!=='yes') throw new Error('Consent is required.');
  return p;
}
export async function submitApplication(token:string,form:FormData):Promise<string> {
  return withTransaction({},async (client) => {
    const session=(await client.query('SELECT * FROM reporter_upload_sessions WHERE token_hash=$1 FOR UPDATE',[hashToken(token)])).rows[0];
    if(!session) throw new Error('Invalid session.');
    if(session.submitted_id) return session.submitted_id;
    if(new Date(session.expires_at).getTime()<Date.now()) throw new Error('Session expired.');
    const profile=validateProfile(form,session.email);
    const existing=session.application_id ? (await client.query('SELECT * FROM reporter_applications WHERE id=$1 FOR UPDATE',[session.application_id])).rows[0] : undefined;
    if(existing && (existing.status!=='changes-requested' || existing.purged_at)) throw new Error('Correction is no longer available.');
    const files=(await client.query('SELECT * FROM reporter_files WHERE session_id=$1 AND validated=true AND deleted_at IS NULL ORDER BY created_at DESC',[session.id])).rows;
    const previous=existing ? (await client.query('SELECT * FROM reporter_files WHERE application_id=$1 AND deleted_at IS NULL AND validated=true',[existing.id])).rows : [];
    for(const kind of ['photo','identity','payment']) if(!files.some((f) => f.kind===kind) && !previous.some((f) => f.kind===kind)) throw new Error(`Missing ${kind} upload.`);
    const id=existing?.id || randomUUID();
    if(existing) await client.query("UPDATE reporter_applications SET profile=$2,status='submitted',payment_verified=false,updated_at=now() WHERE id=$1",[id,profile]);
    else await client.query('INSERT INTO reporter_applications(id,locale,profile,payment_terms) VALUES($1,$2,$3,$4)',[id,form.get('locale')==='hi'?'hi':'en',profile,session.terms]);
    for(const kind of ['photo','identity','payment','qualification','experience']) {
      const file=files.find((f) => f.kind===kind);
      if(file) {
        // Old evidence becomes unassociated and is removed by maintenance, not exposed to future review.
        await client.query('UPDATE reporter_files SET application_id=NULL WHERE application_id=$1 AND kind=$2',[id,kind]);
        await client.query('UPDATE reporter_files SET application_id=$1 WHERE id=$2',[id,file.id]);
      }
    }
    await client.query('UPDATE reporter_upload_sessions SET submitted_id=$1 WHERE id=$2',[id,session.id]);
    await client.query('UPDATE reporter_corrections SET used_at=now() WHERE application_id=$1 AND used_at IS NULL',[id]);
    await event(client,id,'applicant',existing?'resubmitted':'submitted');
    await enqueueEmail(client,id,'acknowledgement','Naee Parvaz — Application received / आवेदन प्राप्त',`Your reporter application has been received. Reference: ${id}. Payment does not guarantee approval.\nआपका आवेदन प्राप्त हुआ है। भुगतान से स्वीकृति की गारंटी नहीं है।`);
    return id;
  });
}
export async function saveReporterSettings(form:FormData) {
  const current=await reporterSettings();
  const next:ReporterSettings={...current,enabled:form.get('enabled')==='on',fee:Number(form.get('fee')),payee:requiredText(form.get('payee'),'Payee',2,200),instructionsEn:optionalText(form.get('instructionsEn'),'Instructions',3000),instructionsHi:optionalText(form.get('instructionsHi'),'Instructions',3000),refundEn:optionalText(form.get('refundEn'),'Refund policy',3000),refundHi:optionalText(form.get('refundHi'),'Refund policy',3000),evidenceDays:Number(form.get('evidenceDays')),profileDays:Number(form.get('profileDays')),retentionConfirmed:form.get('retentionConfirmed')==='on'};
  if(!Number.isFinite(next.fee) || next.fee<0 || next.fee>100000 || ![next.evidenceDays,next.profileDays].every((d) => Number.isInteger(d)&&d>=1&&d<=3650)) throw new Error('Invalid fee or retention period.');
  const qr=form.get('qr');
  if(qr instanceof File && qr.size) { const valid=await validateReporterFile(Buffer.from(await qr.arrayBuffer()),'qr'); const key=`configuration/qr/${randomUUID()}`; await putPrivate(key,valid.bytes,valid.mime); next.qrKey=key; next.qrMime=valid.mime; }
  if(next.enabled && (!applicationsConfigured(next) || !(await currentTemplate())?.approved)) throw new Error('Configure storage, email, fee, bilingual instructions/refunds, retention and an approved ID template before opening.');
  const number=Number(form.get('nextNumber'));
  await withTransaction({},async(client) => {
    const row=(await client.query('SELECT next_number FROM reporter_settings WHERE id=1 FOR UPDATE')).rows[0];
    if(!Number.isSafeInteger(number) || number<1 || number>999999999 || (row.next_number && number<Number(row.next_number))) throw new Error('Next number cannot go backwards.');
    if(form.get('numberConfirmed')!=='on') throw new Error('Confirm existing physical card numbers.');
    await client.query('UPDATE reporter_settings SET settings=$1,next_number=$2,updated_at=now() WHERE id=1',[next,number]);
  });
}
export async function currentTemplate():Promise<{id:string;object_key:string|null;layout:CardLayout;approved:boolean}|undefined> {
  const s=await reporterSettings();
  return s.templateId ? (await database().query('SELECT * FROM reporter_templates WHERE id=$1',[s.templateId])).rows[0] : undefined;
}
export async function saveTemplate(form:FormData) {
  const layout=validateCardLayout(JSON.parse(String(form.get('layout') || JSON.stringify(defaultCardLayout))));
  const previous=await currentTemplate(); let key=previous?.object_key || null;
  const upload=form.get('template');
  if(upload instanceof File && upload.size) {const valid=await validateReporterFile(Buffer.from(await upload.arrayBuffer()),'template'); key=`configuration/templates/${randomUUID()}`; await putPrivate(key,valid.bytes,valid.mime);}
  const id=randomUUID();
  await withTransaction({},async(client) => {
    await client.query('INSERT INTO reporter_templates(id,object_key,layout,approved) VALUES($1,$2,$3,$4)',[id,key,layout,form.get('reviewed')==='on']);
    await client.query("UPDATE reporter_settings SET settings=jsonb_set(settings,'{templateId}',to_jsonb($1::text)),updated_at=now() WHERE id=1",[id]);
  });
}
