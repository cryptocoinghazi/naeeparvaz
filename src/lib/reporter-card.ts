import sharp, { type OverlayOptions } from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

export interface CardField { x:number; y:number; width:number; height:number; size:number; color:string; background:string }
export interface CardLayout { width:number; height:number; font:string; photo:CardField; name:CardField; designation:CardField; number:CardField; joined:CardField; expiry:CardField }
export const defaultCardLayout:CardLayout = {
  width:908,height:1280,font:'DejaVu Sans',
  photo:{x:55,y:499,width:325,height:366,size:0,color:'#b40000',background:'#ffffff'},
  name:{x:45,y:890,width:355,height:54,size:39,color:'#b40000',background:'#ffffff'},
  designation:{x:46,y:944,width:354,height:31,size:22,color:'#b40000',background:'#ffffff'},
  number:{x:184,y:990,width:215,height:38,size:23,color:'#aa0000',background:'#ffffff'},
  joined:{x:130,y:1115,width:165,height:30,size:23,color:'#ae2424',background:'#f7f4ed'},
  expiry:{x:336,y:1115,width:150,height:30,size:23,color:'#ae2424',background:'#f7f4ed'},
};
export function anniversary(joined:string):string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joined)) throw new Error('Invalid joining date.');
  const date=new Date(`${joined}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==joined) throw new Error('Invalid joining date.');
  const year=date.getUTCFullYear()+1, month=date.getUTCMonth(), day=date.getUTCDate();
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(day,last))).toISOString().slice(0,10);
}
export function reporterNumber(number:number):string { return `NPN-${String(number).padStart(4,'0')}`; }
export function indiaToday(now=new Date()):string { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function validateCardLayout(value:unknown):CardLayout {
  const l=value as CardLayout;
  if (!l || l.width!==908 || l.height!==1280 || !/^[\w ,'-]{1,80}$/.test(l.font)) throw new Error('Template must use a 908 × 1280 canvas and a valid font family.');
  for (const key of ['photo','name','designation','number','joined','expiry'] as const) {
    const f=l[key];
    if (!f || ![f.x,f.y,f.width,f.height,f.size].every(Number.isInteger) || f.x<0 || f.y<0 || f.width<1 || f.height<1 || f.x+f.width>l.width || f.y+f.height>l.height || f.size<0 || f.size>100 || !/^#[0-9a-f]{6}$/i.test(f.color) || !/^#[0-9a-f]{6}$/i.test(f.background)) throw new Error(`Invalid ${key} field coordinates or colours.`);
  }
  return l;
}
export async function loadOriginalTemplate():Promise<Buffer> { return readFile(`${process.cwd()}/assets/reporters/id-template.jpeg`); }
function escape(value:string) {return value.replace(/[&<>"']/g,(c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));}
export interface CardInput { name:string; designation:string; number:string; joined:string; cropX:number; cropY:number; zoom:number }
export async function renderCard(template:Buffer, photo:Buffer, layout:CardLayout, input:CardInput):Promise<{image:Buffer;pdf:Buffer}> {
  validateCardLayout(layout);
  if (![input.cropX,input.cropY,input.zoom].every(Number.isFinite) || input.cropX<0 || input.cropX>100 || input.cropY<0 || input.cropY>100 || input.zoom<1 || input.zoom>3) throw new Error('Invalid photo crop.');
  const p=layout.photo;
  const normalized=await sharp(photo).rotate().resize({width:Math.round(p.width*input.zoom),height:Math.round(p.height*input.zoom),fit:'cover'}).toBuffer();
  const meta=await sharp(normalized).metadata();
  const cropped=await sharp(normalized).extract({left:Math.round((meta.width!-p.width)*input.cropX/100),top:Math.round((meta.height!-p.height)*input.cropY/100),width:p.width,height:p.height}).toBuffer();
  const date=(value:string) => value.split('-').reverse().join('/');
  const values={name:input.name,designation:input.designation,number:input.number,joined:date(input.joined),expiry:date(anniversary(input.joined))};
  const composites:OverlayOptions[]=[{input:cropped,left:p.x,top:p.y}];
  for (const key of ['name','designation','number','joined','expiry'] as const) {
    const f=layout[key];
    const text=values[key];
    // Pango measures the text in the actual rendering font; reject overflow rather than truncate.
    const measured=await sharp({text:{text:escape(text),font:`${layout.font} Bold ${f.size}`,dpi:72,rgba:true}}).png().toBuffer({resolveWithObject:true});
    if (measured.info.width>f.width-4 || measured.info.height>f.height-2) throw new Error(`${key} does not fit. Adjust font size or field width and preview again.`);
    const background=await sharp({create:{width:f.width,height:f.height,channels:4,background:f.background}}).png().toBuffer();
    composites.push({input:background,left:f.x,top:f.y});
    const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="${escape(layout.font)}" font-weight="bold" font-size="${f.size}" fill="${f.color}">${escape(text)}</text></svg>`);
    composites.push({input:svg,left:f.x,top:f.y});
  }
  const image=await sharp(template).resize(layout.width,layout.height,{fit:'fill'}).composite(composites).png().toBuffer();
  const pdf=await PDFDocument.create(); const embed=await pdf.embedPng(image); const page=pdf.addPage([454,640]); page.drawImage(embed,{x:0,y:0,width:454,height:640});
  return {image,pdf:Buffer.from(await pdf.save())};
}
