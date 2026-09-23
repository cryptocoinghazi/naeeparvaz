import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { defaultCardLayout, loadOriginalTemplate, renderCard } from '../src/lib/reporter-card';
// Local design review only. This does not create a reporter, issue an ID, or contact a provider.
const photo=await sharp({create:{width:400,height:500,channels:3,background:'#dce3eb'}}).png().toBuffer();
const result=await renderCard(await loadOriginalTemplate(),photo,defaultCardLayout,{name:'Test Reporter',designation:'REPORTER',number:'NPN-0100',joined:'2026-09-23',cropX:50,cropY:50,zoom:1});
await mkdir('test-results/enhancements',{recursive:true});
await writeFile('test-results/enhancements/id-design-sample.png',result.image);
await writeFile('test-results/enhancements/id-design-sample.pdf',result.pdf);
console.log('Local sample generated in test-results/enhancements; no ID issued.');
