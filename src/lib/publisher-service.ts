import { BufferError, createBufferVideoPost, deleteBufferPost, getBufferPost, type BufferPost } from "./buffer-client";
import {
  getPublishBatch,
  markPublisherAssetDiscarded,
  markPublisherAssetRetained,
  recomputePublishBatch,
  resetPublishTargetForRetry,
  setPublishTarget,
} from "./publisher-repository";
import { discardPublisherObject, movePublisherObjectToRetention, publisherMediaUrl } from "./publisher-r2";
import type { PublishBatch, PublishTargetStatus, SocialPlatform } from "../types/publisher";

function targetStatus(post: BufferPost): PublishTargetStatus {
  const status = post.status.toLowerCase();
  if (["sent", "published", "complete", "completed"].includes(status)) return "published";
  if (["error", "failed", "failure"].includes(status)) return "failed";
  if (["cancelled", "canceled", "deleted"].includes(status)) return "cancelled";
  return "scheduled";
}

function targetText(batch: PublishBatch, platform: SocialPlatform): string {
  if (platform === "instagram") return batch.instagramCaption || batch.sharedText;
  if (platform === "facebook") return batch.facebookCaption || batch.sharedText;
  return batch.youtubeDescription || batch.sharedText;
}

async function submitTarget(locals: App.Locals, batch: PublishBatch, platform: SocialPlatform): Promise<void> {
  const target = batch.targets.find((candidate) => candidate.platform === platform);
  if (!target) throw new Error("Publishing target was not found.");
  await setPublishTarget(locals, batch.id, platform, { status: "submitting" });
  try {
    const post = await createBufferVideoPost(locals, {
      platform,
      channelId: target.channelId,
      text: targetText(batch, platform),
      mediaUrl: publisherMediaUrl(locals, batch.asset.objectKey),
      mode: batch.publishMode,
      scheduledFor: batch.scheduledFor,
      youtubeTitle: batch.youtubeTitle,
    });
    await setPublishTarget(locals, batch.id, platform, {
      status: targetStatus(post),
      bufferPostId: post.id,
      publishedUrl: post.externalLink,
      providerDueAt: post.dueAt,
      providerSentAt: post.sentAt,
    });
  } catch (error) {
    const bufferError = error instanceof BufferError ? error : new BufferError("BUFFER_REQUEST_FAILED", "Buffer rejected the post.");
    await setPublishTarget(locals, batch.id, platform, {
      status: bufferError.ambiguous ? "ambiguous" : "failed",
      errorCode: bufferError.code,
      errorMessage: bufferError.message,
    });
  }
}

async function retainIfFullyPublished(locals: App.Locals, batchId: string): Promise<void> {
  const batch = await getPublishBatch(locals, batchId);
  if (!batch || batch.state !== "published" || batch.asset.status !== "validated") return;
  try {
    const retainedKey = await movePublisherObjectToRetention(locals, batch.asset.objectKey, batch.asset.id);
    await markPublisherAssetRetained(locals, batch.asset.id, retainedKey);
  } catch (error) {
    console.error("Unable to move a published social asset into retention", error);
  }
}

export async function submitPublishBatch(locals: App.Locals, batchId: string): Promise<void> {
  let batch = await getPublishBatch(locals, batchId);
  if (!batch) throw new Error("Publishing batch was not found.");
  for (const target of batch.targets) {
    if (target.status === "submitting" && !target.bufferPostId) {
      await setPublishTarget(locals, batch.id, target.platform, {
        status: "ambiguous",
        errorCode: "BUFFER_SUBMISSION_INTERRUPTED",
        errorMessage: "The earlier Buffer submission outcome is unknown. Review Buffer before taking any manual action.",
      });
    }
  }
  batch = await getPublishBatch(locals, batchId);
  if (!batch) throw new Error("Publishing batch was not found.");
  const pendingTargets = batch.targets.filter((target) => target.status === "pending");
  await Promise.all(pendingTargets.map((target) => submitTarget(locals, batch, target.platform)));
  await recomputePublishBatch(locals, batchId);
  await retainIfFullyPublished(locals, batchId);
}

export async function refreshPublishBatch(locals: App.Locals, batchId: string): Promise<void> {
  const batch = await getPublishBatch(locals, batchId);
  if (!batch) throw new Error("Publishing batch was not found.");
  for (const target of batch.targets) {
    if (target.status === "submitting" && !target.bufferPostId) {
      await setPublishTarget(locals, batch.id, target.platform, {
        status: "ambiguous",
        errorCode: "BUFFER_SUBMISSION_INTERRUPTED",
        errorMessage: "The Buffer submission outcome is unknown. Review Buffer before taking any manual action.",
      });
      continue;
    }
    if (!target.bufferPostId || ["cancelled", "failed"].includes(target.status)) continue;
    try {
      const post = await getBufferPost(locals, target.bufferPostId);
      await setPublishTarget(locals, batch.id, target.platform, {
        status: targetStatus(post),
        bufferPostId: post.id,
        publishedUrl: post.externalLink,
        providerDueAt: post.dueAt,
        providerSentAt: post.sentAt,
      });
    } catch (error) {
      const bufferError = error instanceof BufferError ? error : new BufferError("BUFFER_REFRESH_FAILED", "Buffer status could not be refreshed.");
      await setPublishTarget(locals, batch.id, target.platform, {
        status: target.status,
        errorCode: bufferError.code,
        errorMessage: bufferError.message,
      });
    }
  }
  await retainIfFullyPublished(locals, batchId);
}

export async function retryPublishTarget(locals: App.Locals, batchId: string, platform: SocialPlatform): Promise<void> {
  const batch = await getPublishBatch(locals, batchId);
  const target = batch?.targets.find((candidate) => candidate.platform === platform);
  if (!batch || !target) throw new Error("Publishing target was not found.");
  if (target.status !== "failed") throw new Error("Only a confirmed failed target can be retried.");
  await resetPublishTargetForRetry(locals, batchId, platform);
  const refreshed = await getPublishBatch(locals, batchId);
  if (!refreshed) throw new Error("Publishing batch was not found.");
  await submitTarget(locals, refreshed, platform);
  await retainIfFullyPublished(locals, batchId);
}

export async function cancelPublishTarget(locals: App.Locals, batchId: string, platform: SocialPlatform): Promise<void> {
  const batch = await getPublishBatch(locals, batchId);
  const target = batch?.targets.find((candidate) => candidate.platform === platform);
  if (!batch || !target?.bufferPostId) throw new Error("A cancellable Buffer post was not found.");
  if (target.status !== "scheduled") throw new Error("Only a scheduled target can be cancelled.");
  try {
    await deleteBufferPost(locals, target.bufferPostId);
    await setPublishTarget(locals, batchId, platform, { status: "cancelled" });
  } catch (error) {
    const bufferError = error instanceof BufferError ? error : new BufferError("BUFFER_CANCEL_FAILED", "Buffer could not cancel this post.");
    await setPublishTarget(locals, batchId, platform, {
      status: bufferError.ambiguous ? "ambiguous" : target.status,
      errorCode: bufferError.code,
      errorMessage: bufferError.message,
    });
  }
}

export async function discardPublishBatchAsset(locals: App.Locals, batchId: string): Promise<void> {
  const batch = await getPublishBatch(locals, batchId);
  if (!batch) throw new Error("Publishing batch was not found.");
  if (!(["failed", "cancelled"] as PublishBatch["state"][]).includes(batch.state)) {
    throw new Error("Only a fully failed or cancelled publishing batch can be discarded.");
  }
  if (batch.asset.status !== "validated") throw new Error("This publishing asset is not available for discard.");
  await discardPublisherObject(locals, batch.asset.objectKey);
  await markPublisherAssetDiscarded(locals, batch.asset.id);
}
