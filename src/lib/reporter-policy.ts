import type { PoolClient } from 'pg';
import { getDatabase, withTransaction } from './database';
import { policyLabels, type PublicReporterPolicy, type PolicyDocument } from './reporter-policy-text';
import { ReporterInputError } from './reporter-input';

function db(){const pool=getDatabase();if(!pool)throw new Error('Database unavailable');return pool;}
export interface PolicySettings {body_en:string;body_hi:string;revision:number;published_revision:number|null;current_version_id:number|null}
export class PolicyEditorError extends Error {}
export async function policySettings():Promise<PolicySettings> {return (await db().query('SELECT * FROM reporter_policy_settings WHERE id=1')).rows[0];}
export async function currentReporterPolicy():Promise<PublicReporterPolicy|null> {
  return (await db().query('SELECT v.id,v.document FROM reporter_policy_settings s JOIN reporter_policy_versions v ON v.id=s.current_version_id WHERE s.id=1')).rows[0] || null;
}
export async function policyHistory():Promise<{id:number;published_at:Date;published_by:string}[]> {
  return (await db().query('SELECT id,published_at,published_by FROM reporter_policy_versions ORDER BY id DESC LIMIT 50')).rows;
}
export async function savePolicyDraft(form:FormData):Promise<void> {
  const bodyEn=String(form.get('bodyEn') || '').trim(),bodyHi=String(form.get('bodyHi') || '').trim(),revision=Number(form.get('revision'));
  if(![bodyEn,bodyHi].every(text=>text.length>=50 && text.length<=20000) || !Number.isSafeInteger(revision))throw new PolicyEditorError('Both policy translations must contain 50–20,000 characters.');
  const result=await db().query('UPDATE reporter_policy_settings SET body_en=$1,body_hi=$2,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$3',[bodyEn,bodyHi,revision]);
  if(!result.rowCount)throw new PolicyEditorError('The draft changed in another tab. Reload and review it before saving.');
}
export async function publishPolicy(form:FormData,actor:string):Promise<number> {
  if(form.get('confirm')!=='yes')throw new PolicyEditorError('Confirm that you reviewed both translations before publishing.');
  return withTransaction({},async client=>{
    const s:PolicySettings=(await client.query('SELECT * FROM reporter_policy_settings WHERE id=1 FOR UPDATE')).rows[0];
    if(Number(form.get('revision'))!==s.revision)throw new PolicyEditorError('The draft changed. Reload and review the saved preview before publishing.');
    if(s.published_revision===s.revision && s.current_version_id)return s.current_version_id;
    const document:PolicyDocument={...policyLabels,bodyEn:s.body_en,bodyHi:s.body_hi};
    const id=(await client.query('INSERT INTO reporter_policy_versions(document,published_by) VALUES($1,$2) RETURNING id',[document,actor])).rows[0].id;
    await client.query('UPDATE reporter_policy_settings SET current_version_id=$1,published_revision=revision WHERE id=1',[id]);
    return id;
  });
}

// Called under the upload-session row lock, in the same transaction as application creation.
export async function checkPolicyAcceptance(client:PoolClient,session:{policy_version_id:number|null},form:FormData):Promise<number|null> {
  const id=session.policy_version_id;
  if(!id) {
    // Lock against first publication so legacy sessions cannot slip through an activation race.
    const current=(await client.query('SELECT current_version_id FROM reporter_policy_settings WHERE id=1 FOR SHARE')).rows[0].current_version_id;
    if(current)throw new ReporterInputError('POLICY_REVIEW_REQUIRED','policyConsent','A reporter policy is now required. Save your entered text, refresh and begin again to read and accept it. / रिपोर्टर नीति स्वीकार करना आवश्यक है। अपना भरा हुआ विवरण सुरक्षित रखें, पेज रीफ़्रेश करें और नीति पढ़कर नया आवेदन शुरू करें।');
    return null;
  }
  if(String(form.get('policyVersionId') || '')!==String(id))throw new ReporterInputError('POLICY_VERSION_MISMATCH','policyConsent','The policy version does not match this application session. Refresh and begin again to review it. / नीति का संस्करण इस आवेदन सत्र से मेल नहीं खाता। पेज रीफ़्रेश करके नीति दोबारा पढ़ें।');
  if(form.get('policyConsent')!=='yes')throw new ReporterInputError('POLICY_CONSENT_REQUIRED','policyConsent','Read and accept the Reporter Conduct & ID-Card Use Policy before submitting. / आवेदन जमा करने से पहले रिपोर्टर आचरण एवं पहचान-पत्र उपयोग नीति पढ़ें और स्वीकार करें।');
  return id;
}
export async function policyAcceptances(applicationId:string):Promise<{id:string;applicant_name:string;locale:'en'|'hi';policy_version_id:number;accepted_at:Date;document:PolicyDocument}[]> {
  return (await db().query('SELECT a.*,v.document FROM reporter_policy_acceptances a JOIN reporter_policy_versions v ON v.id=a.policy_version_id WHERE a.application_id=$1 ORDER BY a.accepted_at,a.id',[applicationId])).rows;
}
