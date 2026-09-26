export const policyLabels = {
  titleEn:'Reporter Conduct & ID-Card Use Policy',
  titleHi:'रिपोर्टर आचरण एवं पहचान-पत्र उपयोग नीति',
  attestationEn:'I have read and understood the Reporter Conduct & ID-Card Use Policy, confirm that my application details are truthful, and agree to follow this policy if approved.',
  attestationHi:'मैंने रिपोर्टर आचरण एवं पहचान-पत्र उपयोग नीति पढ़ और समझ ली है। मैं पुष्टि करता/करती हूँ कि मेरे आवेदन की जानकारी सत्य है और स्वीकृति मिलने पर इस नीति का पालन करने के लिए सहमत हूँ।',
};
export interface PolicyDocument {titleEn:string;titleHi:string;attestationEn:string;attestationHi:string;bodyEn:string;bodyHi:string}
export interface PublicReporterPolicy {id:number;document:PolicyDocument}
