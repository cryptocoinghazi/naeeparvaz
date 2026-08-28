import type { APIRoute } from "astro";
import { validateDriveImageUrl } from "../../../lib/drive-image";
import { validateLabelIds } from "../../../lib/label-repository";
import { optionalText, requiredText } from "../../../lib/validation";
import { parseVideoUrl } from "../../../lib/video";
import { saveVideo } from "../../../lib/video-repository";
import type { VideoStatus } from "../../../types/content";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const parsed = parseVideoUrl(requiredText(form.get("sourceUrl"), "Video URL", 12, 1000));
    const titleEn = optionalText(form.get("titleEn"), "English title", 240);
    const titleHi = optionalText(form.get("titleHi"), "Hindi title", 240);
    if (!titleEn && !titleHi) throw new Error("At least one language title is required.");
    const labelIds = validateLabelIds(form.getAll("labels"));
    const thumbnailUrl = optionalText(form.get("thumbnailUrl"), "Google Drive thumbnail", 1000);
    const thumbnail = thumbnailUrl ? await validateDriveImageUrl(thumbnailUrl) : undefined;
    const publishedDate = requiredText(form.get("publishedAt"), "Published date", 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedDate) || Number.isNaN(Date.parse(publishedDate))) throw new Error("Enter a valid published date.");
    const statusValue = form.get("status");
    const status: VideoStatus = statusValue === "published" ? "published" : "draft";
    const idValue = form.get("id");
    const id = typeof idValue === "string" && /^[0-9a-f-]{36}$/i.test(idValue) ? idValue : undefined;
    await saveVideo(locals, {
      id,
      ...parsed,
      publishedAt: `${publishedDate}T00:00:00+05:30`,
      labelIds,
      thumbnailDriveId: thumbnail?.fileId,
      thumbnailSourceUrl: thumbnail?.sourceUrl,
      featured: form.get("featured") === "on",
      status,
      translations: {
        en: titleEn ? { title: titleEn, description: optionalText(form.get("descriptionEn"), "English description", 1200) } : undefined,
        hi: titleHi ? { title: titleHi, description: optionalText(form.get("descriptionHi"), "Hindi description", 1200) } : undefined,
      },
    });
    return redirect(`/editor/?saved=video`, 303);
  } catch (error) {
    console.error("Admin video save failed", error);
    return redirect(`/editor/?error=video`, 303);
  }
};
