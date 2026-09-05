import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac } from "node:crypto";
import { createFile, type Movie } from "mp4box/simple";
import { getRuntimeEnv } from "./runtime";

export const maxPublisherVideoBytes = 90 * 1024 * 1024;
const rangeChunkBytes = 4 * 1024 * 1024;

interface R2Config {
  bucket: string;
  mediaBaseUrl: string;
  signingSecret: string;
  client: S3Client;
}

export interface ValidatedVideoMetadata {
  byteSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
}

export function validatePublisherMovie(movie: Movie, byteSize: number): ValidatedVideoMetadata {
  if (byteSize < 1 || byteSize > maxPublisherVideoBytes) throw new Error("The video must be 90 MB or smaller.");
  const video = movie.videoTracks[0];
  const audio = movie.audioTracks[0];
  if (!video || !audio || movie.videoTracks.length !== 1 || movie.audioTracks.length !== 1) {
    throw new Error("The MP4 must contain one video track and one audio track.");
  }
  const durationSeconds = movie.duration / movie.timescale;
  const width = Math.round(video.video?.width ?? video.track_width);
  const height = Math.round(video.video?.height ?? video.track_height);
  const videoCodec = video.codec.toLowerCase();
  const audioCodec = audio.codec.toLowerCase();
  if (!videoCodec.startsWith("avc1") && !videoCodec.startsWith("avc3")) throw new Error("The video codec must be H.264.");
  if (!audioCodec.startsWith("mp4a.40")) throw new Error("The audio codec must be AAC.");
  if (durationSeconds < 5 || durationSeconds > 90) throw new Error("The video duration must be between 5 and 90 seconds.");
  if (width > 1080 || height > 1920) throw new Error("The video resolution must not exceed 1080 × 1920.");
  if (Math.abs(width / height - 9 / 16) > 0.015) throw new Error("The video must use a vertical 9:16 aspect ratio.");
  return { byteSize, durationSeconds, width, height, videoCodec, audioCodec };
}

function required(value: string | undefined, name: string): string {
  const resolved = value?.trim();
  if (!resolved) throw new Error(`${name} is not configured.`);
  return resolved;
}

function config(locals?: App.Locals): R2Config {
  const env = getRuntimeEnv(locals);
  const accountId = required(env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  return {
    bucket: required(env.R2_BUCKET, "R2_BUCKET"),
    mediaBaseUrl: required(env.R2_MEDIA_BASE_URL, "R2_MEDIA_BASE_URL").replace(/\/+$/, ""),
    signingSecret: required(env.MEDIA_URL_SIGNING_SECRET, "MEDIA_URL_SIGNING_SECRET"),
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: required(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
        secretAccessKey: required(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
      },
    }),
  };
}

export function publisherStorageConfigured(locals?: App.Locals): boolean {
  try {
    config(locals);
    return true;
  } catch {
    return false;
  }
}

export function stagingObjectKey(assetId: string): string {
  return `staging/${assetId}.mp4`;
}

export function activeObjectKey(assetId: string): string {
  return `active/${assetId}.mp4`;
}

export function retentionObjectKey(assetId: string): string {
  return `retention/${assetId}.mp4`;
}

export async function createPublisherUploadUrl(locals: App.Locals, objectKey: string): Promise<string> {
  const { client, bucket } = config(locals);
  return getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: "video/mp4",
  }), { expiresIn: 15 * 60 });
}

async function readRange(configuration: R2Config, objectKey: string, start: number, end: number): Promise<Uint8Array> {
  const response = await configuration.client.send(new GetObjectCommand({
    Bucket: configuration.bucket,
    Key: objectKey,
    Range: `bytes=${start}-${end}`,
  }));
  if (!response.Body) throw new Error("The uploaded video could not be read.");
  return response.Body.transformToByteArray();
}

async function parseMp4(configuration: R2Config, objectKey: string, byteSize: number): Promise<Movie> {
  return new Promise<Movie>(async (resolve, reject) => {
    const file = createFile(false);
    let settled = false;
    file.onError = (message) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Invalid MP4 metadata: ${message}`));
      }
    };
    file.onReady = (info) => {
      if (!settled) {
        settled = true;
        resolve(info);
      }
    };
    try {
      for (let start = 0; start < byteSize && !settled; start += rangeChunkBytes) {
        const end = Math.min(byteSize - 1, start + rangeChunkBytes - 1);
        const bytes = await readRange(configuration, objectKey, start, end);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer & { fileStart: number };
        buffer.fileStart = start;
        file.appendBuffer(buffer);
      }
      if (!settled) file.flush();
      if (!settled) reject(new Error("The MP4 metadata section could not be read."));
    } catch (error) {
      if (!settled) reject(error);
    }
  });
}

export async function validatePublisherUpload(locals: App.Locals, objectKey: string): Promise<ValidatedVideoMetadata> {
  const configuration = config(locals);
  const head = await configuration.client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: objectKey }));
  const byteSize = head.ContentLength ?? 0;
  const contentType = head.ContentType?.toLowerCase();
  if (contentType !== "video/mp4") throw new Error("Only an MP4 video is accepted.");
  const movie = await parseMp4(configuration, objectKey, byteSize);
  return validatePublisherMovie(movie, byteSize);
}

export async function promotePublisherUpload(locals: App.Locals, stagingKey: string, activeKey: string): Promise<void> {
  const { client, bucket } = config(locals);
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: activeKey,
    CopySource: `${bucket}/${stagingKey}`,
    ContentType: "video/mp4",
    CacheControl: "public, max-age=86400, immutable",
    MetadataDirective: "REPLACE",
  }));
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: stagingKey }));
}

export async function discardPublisherObject(locals: App.Locals, objectKey: string): Promise<void> {
  const { client, bucket } = config(locals);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function movePublisherObjectToRetention(locals: App.Locals, activeKey: string, assetId: string): Promise<string> {
  const { client, bucket } = config(locals);
  const retentionKey = retentionObjectKey(assetId);
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: retentionKey,
    CopySource: `${bucket}/${activeKey}`,
    ContentType: "video/mp4",
    CacheControl: "private, no-store",
    MetadataDirective: "REPLACE",
  }));
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: activeKey }));
  return retentionKey;
}

export function publisherMediaUrl(locals: App.Locals, objectKey: string): string {
  const { mediaBaseUrl, signingSecret } = config(locals);
  const signature = createHmac("sha256", signingSecret).update(objectKey).digest("base64url");
  return `${mediaBaseUrl}/media/${signature}/${objectKey}`;
}
