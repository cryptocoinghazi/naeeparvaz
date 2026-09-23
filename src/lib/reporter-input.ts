// Shared browser/server constraints. No applicant values or server dependencies here.
export const reporterTextRules = {
  name: { min:2,max:100,label:'Full name / पूरा नाम' },
  phone: { min:7,max:30,label:'Phone / फोन' },
  address: { min:10,max:600,label:'Full address / पूरा पता' },
  area: { min:2,max:200,label:'Reporting area / रिपोर्टिंग क्षेत्र' },
  languages: { min:2,max:200,label:'Languages / भाषाएँ' },
  education: { min:2,max:300,label:'Education / शिक्षा' },
  experience: { min:2,max:2000,label:'Reporting experience (write None if new) / रिपोर्टिंग अनुभव (नए हैं तो नहीं लिखें)' },
  transaction: { min:4,max:100,label:'Transaction reference / लेनदेन संदर्भ' },
  workSamples: { min:0,max:2000,label:'Work samples / कार्य नमूने' },
} as const;
export class ReporterInputError extends Error {
  constructor(public code:string, public field:string, message:string) { super(message); }
}
export function reporterText(form:FormData,key:keyof typeof reporterTextRules):string {
  const rule=reporterTextRules[key],raw=form.get(key),value=typeof raw==='string'?raw.trim():'';
  if(value.length<rule.min || value.length>rule.max) throw new ReporterInputError('INVALID_FIELD',key,`${rule.label}: enter ${rule.min}–${rule.max} characters / ${rule.min}–${rule.max} अक्षर दर्ज करें।`);
  return value;
}
