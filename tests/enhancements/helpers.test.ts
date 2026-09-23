import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { advertisementState } from '../../src/lib/ad-repository';
import { anniversary, indiaToday, defaultCardLayout, loadOriginalTemplate, renderCard, reporterNumber, validateCardLayout } from '../../src/lib/reporter-card';
import { validateReporterFile, readLimited, reporterStorageReady } from '../../src/lib/reporter-storage';
import { channelIdentifier } from '../../src/lib/tv';
import { validateProfile } from '../../src/lib/reporters';
import type { Advertisement } from '../../src/types/content';

test('ad effective statuses include schedule, expiry and recoverable deletion',() => {
  const ad={status:'published',startsAt:'2026-01-01T00:00:00Z',endsAt:'2026-02-01T00:00:00Z'} as Advertisement;
  assert.equal(advertisementState(ad,Date.parse('2025-12-01')),'scheduled');
  assert.equal(advertisementState(ad,Date.parse('2026-01-01')),'active');
  assert.equal(advertisementState(ad,Date.parse('2026-02-01')),'expired');
  assert.equal(advertisementState({...ad,status:'draft'}),'draft');
  assert.equal(advertisementState({...ad,deletedAt:'2026-01-02'}),'deleted');
});
test('card numbering and anniversaries handle leap days without rollover',() => {
  assert.equal(reporterNumber(1),'NPN-0001'); assert.equal(reporterNumber(10001),'NPN-10001');
  assert.equal(anniversary('2024-02-29'),'2025-02-28'); assert.equal(anniversary('2026-09-23'),'2027-09-23');
  assert.equal(indiaToday(new Date('2026-09-23T20:00:00Z')),'2026-09-24');
  assert.throws(() => anniversary('2026-02-30')); assert.throws(() => anniversary('not a date'));
  assert.throws(() => validateCardLayout({...defaultCardLayout,name:{...defaultCardLayout.name,x:900}}));
});
test('channel configuration rejects arbitrary hosts and resolves supported identifiers',() => {
  assert.deepEqual(channelIdentifier('https://www.youtube.com/@NaeeParvazNews'),{forHandle:'@NaeeParvazNews'});
  assert.deepEqual(channelIdentifier('UC1234567890123456789012'),{id:'UC1234567890123456789012'});
  assert.throws(() => channelIdentifier('https://evil.example/@NaeeParvazNews'));
});
test('file validation decodes bytes, rejects malformed/oversized/active files and leaves QR unchanged',async() => {
  const png=await sharp({create:{width:30,height:30,channels:3,background:'red'}}).png().toBuffer();
  assert.equal((await validateReporterFile(png,'photo')).mime,'image/jpeg');
  assert.deepEqual((await validateReporterFile(png,'qr')).bytes,png);
  await assert.rejects(validateReporterFile(Buffer.from('<script>alert(1)</script>'),'identity'));
  await assert.rejects(validateReporterFile(Buffer.alloc(5*1024*1024+1),'photo'));
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
  assert.equal((await validateReporterFile(bytes,'identity')).mime,'application/pdf');
  await assert.rejects(validateReporterFile(bytes,'photo'));
  await assert.rejects(validateReporterFile(Buffer.from('%PDF-broken'),'identity'));
  await assert.rejects(readLimited(new Request('http://localhost',{method:'POST',body:'too big'}),3));
});
test('reporter storage cannot use the public social bucket',() => {
  const previous={...process.env};
  try {process.env.REPORTER_R2_BUCKET='same';process.env.R2_BUCKET='same';process.env.REPORTER_R2_ACCESS_KEY_ID='test';process.env.REPORTER_R2_SECRET_ACCESS_KEY='test';process.env.R2_ACCOUNT_ID='test';assert.equal(reporterStorageReady(),false);}
  finally {process.env=previous;}
});
test('profile requires consent and accepts only the chosen identity proof options',() => {
  const form=new FormData();
  const values={name:'Example Reporter',phone:'9999999999',address:'Example address, district',area:'Yavatmal',languages:'Hindi',education:'Graduate',experience:'None',identityType:'masked-aadhaar',transaction:'TEST-123',paymentDate:'2026-01-01',consent:'yes',paymentConsent:'yes'};
  Object.entries(values).forEach(([key,value]) => form.set(key,value));
  assert.equal(validateProfile(form,'test@example.com').name,'Example Reporter');
  form.set('identityType','pan');assert.throws(() => validateProfile(form,'test@example.com'));
  form.set('identityType','voter-id');form.delete('consent');assert.throws(() => validateProfile(form,'test@example.com'));
});
test('ID renderer preserves artwork pixels outside personalized fields and generates a PDF',async() => {
  const template=await loadOriginalTemplate();
  const photo=await sharp({create:{width:400,height:500,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
  const result=await renderCard(template,photo,defaultCardLayout,{name:'Test Reporter',designation:'REPORTER',number:'NPN-0123',joined:'2024-02-29',cropX:50,cropY:50,zoom:1});
  const pdf=await PDFDocument.load(result.pdf);assert.equal(pdf.getPageCount(),1);
  const original=await sharp(template).resize(908,1280).removeAlpha().raw().toBuffer();
  const generated=await sharp(result.image).removeAlpha().raw().toBuffer();
  for(let y=0;y<1280;y++) for(let x=0;x<908;x++) {
    if(Object.values(defaultCardLayout).some((f) => typeof f==='object' && x>=f.x && x<f.x+f.width && y>=f.y && y<f.y+f.height)) continue;
    const offset=(y*908+x)*3;
    if(!original.subarray(offset,offset+3).equals(generated.subarray(offset,offset+3))) assert.fail(`Artwork changed at ${x},${y}`);
  }
  await assert.rejects(renderCard(template,photo,defaultCardLayout,{name:'A'.repeat(100),designation:'REPORTER',number:'NPN-0123',joined:'2026-09-23',cropX:50,cropY:50,zoom:1}),/does not fit/);
});
