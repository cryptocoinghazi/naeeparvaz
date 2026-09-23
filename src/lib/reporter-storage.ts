import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export const fileLimit = 5 * 1024 * 1024;
export function reporterStorageReady(): boolean {
  return !!(process.env.REPORTER_R2_BUCKET && process.env.REPORTER_R2_ACCESS_KEY_ID && process.env.REPORTER_R2_SECRET_ACCESS_KEY && (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID)) && process.env.REPORTER_R2_BUCKET !== process.env.R2_BUCKET;
}
function config() {
  if (!reporterStorageReady()) throw new Error('Private reporter storage is not configured.');
  return { bucket:process.env.REPORTER_R2_BUCKET!, client:new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.REPORTER_R2_ACCESS_KEY_ID!,secretAccessKey:process.env.REPORTER_R2_SECRET_ACCESS_KEY!}}) };
}
export async function putPrivate(key:string, bytes:Uint8Array, mime:string) {
  const {client,bucket} = config();
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:mime}));
}
export async function getPrivate(key:string): Promise<Buffer> {
  const {client,bucket} = config();
  const object = await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if (!object.Body || (object.ContentLength || 0) > 12 * 1024 * 1024) throw new Error('File unavailable.');
  return Buffer.from(await object.Body.transformToByteArray());
}
export async function deletePrivate(key:string) {
  const {client,bucket} = config(); await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
}
export async function readLimited(request:Request, limit=fileLimit): Promise<Buffer> {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('File too large.');
  const reader=request.body?.getReader(); if (!reader) throw new Error('Empty upload.');
  const chunks:Uint8Array[]=[]; let size=0;
  try { while (true) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>limit) {await reader.cancel(); throw new Error('File too large.');} chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function validateReporterFile(bytes:Buffer, kind:string): Promise<{bytes:Buffer;mime:string}> {
  if (!bytes.length || bytes.length > fileLimit) throw new Error('Files must be 5 MB or smaller.');
  if (bytes.subarray(0,5).toString() === '%PDF-') {
    if (['photo','qr','template'].includes(kind)) throw new Error('An image is required.');
    const pdf = await PDFDocument.load(bytes, {ignoreEncryption:false,throwOnInvalidObject:true});
    if (pdf.isEncrypted || pdf.getPageCount()<1 || pdf.getPageCount()>20) throw new Error('Unsupported PDF.');
    // PDF downloads are attachments only; reject active content rather than rendering it inline.
    if (/\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles|RichMedia)\b/.test(bytes.toString('latin1'))) throw new Error('Active PDF content is not allowed.');
    for (const [,object] of pdf.context.enumerateIndirectObjects()) {
      if (/\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles|RichMedia)\b/.test(object.toString())) throw new Error('Active PDF content is not allowed.');
    }
    return {bytes,mime:'application/pdf'};
  }
  const image=sharp(bytes,{limitInputPixels:20000000,failOn:'warning'});
  const metadata=await image.metadata();
  if (!['jpeg','png','webp'].includes(metadata.format || '') || (metadata.pages || 1)>1) throw new Error('Use JPEG, PNG or WebP.');
  if (kind !== 'photo' && metadata.format==='webp' && !['qr','template'].includes(kind)) throw new Error('Use JPEG or PNG for document images.');
  await image.clone().raw().toBuffer(); // Decode the entire image, not just its header.
  if (kind === 'qr' || kind === 'template') return {bytes,mime:`image/${metadata.format}`};
  const clean=await image.rotate().jpeg({quality:90}).toBuffer();
  if (clean.length>fileLimit) throw new Error('Decoded image too large.');
  return {bytes:clean,mime:'image/jpeg'};
}
