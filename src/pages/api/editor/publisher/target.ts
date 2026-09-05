import type { APIRoute } from "astro";
import { requireSameOrigin } from "../../../../lib/editor-api";
import { cancelPublishTarget, discardPublishBatchAsset, refreshPublishBatch, retryPublishTarget } from "../../../../lib/publisher-service";
import { requiredText } from "../../../../lib/validation";
import { socialPlatforms, type SocialPlatform } from "../../../../types/publisher";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  let batchId = "";
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    batchId = requiredText(form.get("batchId"), "Batch", 36, 36);
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw new Error("Invalid publishing batch.");
    const action = requiredText(form.get("action"), "Action", 3, 12);
    if (action === "refresh") {
      await refreshPublishBatch(locals, batchId);
    } else if (action === "discard") {
      await discardPublishBatchAsset(locals, batchId);
    } else {
      const value = requiredText(form.get("platform"), "Platform", 3, 20);
      if (!socialPlatforms.includes(value as SocialPlatform)) throw new Error("Invalid platform.");
      if (action === "retry") await retryPublishTarget(locals, batchId, value as SocialPlatform);
      else if (action === "cancel") await cancelPublishTarget(locals, batchId, value as SocialPlatform);
      else throw new Error("Unsupported target action.");
    }
    return redirect(`/editor/publisher/?saved=${action}#batch-${batchId}`, 303);
  } catch (error) {
    console.error("Publisher target action failed", error);
    return redirect(`/editor/publisher/?error=target${batchId ? `#batch-${batchId}` : ""}`, 303);
  }
};
