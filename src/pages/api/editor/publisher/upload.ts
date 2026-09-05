import type { APIRoute } from "astro";
import { errorMessage, json, requireSameOrigin } from "../../../../lib/editor-api";
import {
  createPublisherAsset,
  getPublisherAsset,
  markPublisherAssetDiscarded,
  publisherAssetCanBeDiscarded,
  validatePublisherAssetRecord,
} from "../../../../lib/publisher-repository";
import {
  activeObjectKey,
  createPublisherUploadUrl,
  discardPublisherObject,
  maxPublisherVideoBytes,
  promotePublisherUpload,
  stagingObjectKey,
  validatePublisherUpload,
} from "../../../../lib/publisher-r2";

interface UploadRequest {
  action?: string;
  assetId?: string;
  filename?: string;
  mimeType?: string;
  byteSize?: number;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminEmail) return json({ error: "Unauthorized" }, 401);
  try {
    requireSameOrigin(request);
    const body = await request.json() as UploadRequest;
    if (body.action === "create") {
      const filename = body.filename?.trim();
      const byteSize = Number(body.byteSize);
      if (!filename || filename.length > 255) throw new Error("Choose a valid MP4 filename.");
      if (body.mimeType !== "video/mp4" || !filename.toLowerCase().endsWith(".mp4")) throw new Error("Only an MP4 video is accepted.");
      if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > maxPublisherVideoBytes) throw new Error("The video must be 90 MB or smaller.");
      const assetId = crypto.randomUUID();
      const objectKey = stagingObjectKey(assetId);
      await createPublisherAsset(locals, { id: assetId, objectKey, filename, byteSize });
      const uploadUrl = await createPublisherUploadUrl(locals, objectKey);
      return json({ assetId, uploadUrl, expiresInSeconds: 900 }, 201);
    }
    if (!body.assetId || !/^[0-9a-f-]{36}$/i.test(body.assetId)) throw new Error("A valid upload identifier is required.");
    const asset = await getPublisherAsset(locals, body.assetId);
    if (!asset) throw new Error("The upload record was not found.");
    if (body.action === "complete") {
      if (asset.status !== "staging") throw new Error("This upload has already been finalized.");
      const metadata = await validatePublisherUpload(locals, asset.objectKey);
      if (metadata.byteSize !== asset.byteSize) throw new Error("The uploaded object does not match the declared file size.");
      const activeKey = activeObjectKey(asset.id);
      await promotePublisherUpload(locals, asset.objectKey, activeKey);
      await validatePublisherAssetRecord(locals, asset.id, activeKey, metadata);
      return json({ ok: true, asset: await getPublisherAsset(locals, asset.id) });
    }
    if (body.action === "discard") {
      if (asset.status === "retained") throw new Error("Published recovery assets are managed by the retention policy.");
      if (!(await publisherAssetCanBeDiscarded(locals, asset.id))) throw new Error("A video attached to a publishing batch cannot be discarded.");
      await discardPublisherObject(locals, asset.objectKey);
      await markPublisherAssetDiscarded(locals, asset.id);
      return json({ ok: true });
    }
    throw new Error("Unsupported upload action.");
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
};
