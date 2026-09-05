import type { APIRoute } from "astro";
import { requireSameOrigin } from "../../../../lib/editor-api";
import { validateLabelIds } from "../../../../lib/label-repository";
import { getPublishBatch } from "../../../../lib/publisher-repository";
import { optionalText, requiredText } from "../../../../lib/validation";
import { parseVideoUrl } from "../../../../lib/video";
import { saveVideo } from "../../../../lib/video-repository";
import { socialPlatforms, type SocialPlatform } from "../../../../types/publisher";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const batchId = requiredText(form.get("batchId"), "Batch", 36, 36);
    const platformValue = requiredText(form.get("platform"), "Platform", 3, 20);
    if (!socialPlatforms.includes(platformValue as SocialPlatform)) throw new Error("Invalid platform.");
    const batch = await getPublishBatch(locals, batchId);
    const target = batch?.targets.find((candidate) => candidate.platform === platformValue && candidate.status === "published");
    if (!batch || !target?.publishedUrl) throw new Error("The selected target does not have a verified published URL.");
    const parsed = parseVideoUrl(target.publishedUrl);
    const titleEn = optionalText(form.get("titleEn"), "English title", 240);
    const titleHi = optionalText(form.get("titleHi"), "Hindi title", 240);
    if (!titleEn && !titleHi) throw new Error("At least one title is required.");
    const labelIds = validateLabelIds(form.getAll("labels"));
    await saveVideo(locals, {
      ...parsed,
      publishedAt: new Date().toISOString(),
      labelIds,
      featured: false,
      status: "draft",
      translations: {
        en: titleEn ? { title: titleEn, description: optionalText(form.get("descriptionEn"), "English description", 1200) } : undefined,
        hi: titleHi ? { title: titleHi, description: optionalText(form.get("descriptionHi"), "Hindi description", 1200) } : undefined,
      },
    });
    return redirect("/editor/?saved=publisher-import#video-library-heading", 303);
  } catch (error) {
    console.error("Publisher video import failed", error);
    return redirect("/editor/publisher/?error=import", 303);
  }
};
