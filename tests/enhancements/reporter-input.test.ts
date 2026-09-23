import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../../src/lib/reporters';
import { ReporterInputError, reporterTextRules } from '../../src/lib/reporter-input';

const valid={name:'Test Reporter',phone:'9999999999',address:'Example address district',area:'Yavatmal',languages:'Hindi',education:'Graduate',experience:'None',identityType:'voter-id',transaction:'TEST-123',paymentDate:'2026-01-01',consent:'yes',paymentConsent:'yes',workSamples:''};
function form(values=valid) {const f=new FormData();for(const [key,value] of Object.entries(values))f.set(key,value);return f;}
test('each text field reports its name with consistent trimmed length constraints',()=>{
  for(const [key,rule] of Object.entries(reporterTextRules)) {
    const f=form();f.set(key,'x'.repeat(rule.max+1));
    assert.throws(()=>validateProfile(f,'test@example.invalid'),e=>e instanceof ReporterInputError && e.field===key && !e.message.includes('x'.repeat(20)));
    if(rule.min){f.set(key,' '.repeat(rule.min+5));assert.throws(()=>validateProfile(f,'test@example.invalid'),e=>e instanceof ReporterInputError && e.field===key);}
  }
  assert.equal(validateProfile(form(),'test@example.invalid').experience,'None');
});
test('date, identity and consent errors point to the correct field without reflecting values',()=>{
  for(const [field,value] of [['paymentDate','2026-02-30'],['paymentDate','2999-01-01'],['identityType','pan'],['consent',''],['paymentConsent','']]) {
    const f=form();f.set(field,value);assert.throws(()=>validateProfile(f,'test@example.invalid'),e=>e instanceof ReporterInputError && e.field===field);
  }
});
