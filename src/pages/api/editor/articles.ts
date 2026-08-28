import type { APIRoute } from "astro";
import { validateDriveImageUrl, validateExternalDestination } from "../../../lib/drive-image";
import { validateLabelIds } from "../../../lib/label-repository";
import { saveArticle } from "../../../lib/article-repository";
import { optionalText, requiredText } from "../../../lib/validation";
import type { ArticleTranslation, PublishingStatus } from "../../../types/content";

function translation(form: FormData, locale: "En" | "Hi"): ArticleTranslation | undefined {
  const title = optionalText(form.get(`title${locale}`), `${locale} title`, 240);
  const summary = optionalText(form.get(`summary${locale}`), `${locale} summary`, 600);
  const bodyMarkdown = optionalText(form.get(`body${locale}`), `${locale} body`, 50_000);
  const coverAlt = optionalText(form.get(`coverAlt${locale}`), `${locale} cover alternative text`, 240);
  if (!title && !summary && !bodyMarkdown && !coverAlt) return undefined;
  if (!title || !summary || !bodyMarkdown) throw new Error(`Complete the ${locale === "En" ? "English" : "Hindi"} headline, summary and body.`);
  return { title, summary, bodyMarkdown, coverAlt: coverAlt || undefined };
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  let returnPath = "/editor/articles/new/";
  try {
    const form = await request.formData();
    const rawId = String(form.get("id") ?? "");
    const id = /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : undefined;
    if (rawId && !id) throw new Error("Invalid article identifier.");
    if (id) returnPath = `/editor/articles/${id}/`;
    const slug = requiredText(form.get("slug"), "Slug", 3, 120).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Use lowercase words and hyphens in the slug.");
    const publishedDate = requiredText(form.get("publishedAt"), "Publication date", 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedDate) || Number.isNaN(Date.parse(publishedDate))) throw new Error("Enter a valid publication date.");
    const sourceType = form.get("sourceType") === "external" ? "external" : "original";
    const sourceName = optionalText(form.get("sourceName"), "Source name", 160);
    const sourceUrlInput = optionalText(form.get("sourceUrl"), "Source URL", 1000);
    const sourceUrl = sourceUrlInput ? validateExternalDestination(sourceUrlInput) : undefined;
    if (sourceType === "external" && (!sourceName || !sourceUrl)) throw new Error("External articles require the publisher name and exact HTTPS source URL.");
    const translations = { en: translation(form, "En"), hi: translation(form, "Hi") };
    if (!translations.en && !translations.hi) throw new Error("Complete at least one article language.");
    const labelIds = validateLabelIds(form.getAll("labels"));
    const videoIds = form.getAll("videoIds").filter((value): value is string => typeof value === "string");
    if (videoIds.length > 3 || videoIds.some((value) => !/^[0-9a-f-]{36}$/i.test(value))) throw new Error("Choose up to three valid related videos.");
    const coverUrl = optionalText(form.get("coverUrl"), "Google Drive cover", 1000);
    const cover = coverUrl ? await validateDriveImageUrl(coverUrl) : undefined;
    const status: PublishingStatus = form.get("status") === "published" ? "published" : "draft";
    const savedId = await saveArticle(locals, {
      id,
      slug,
      byline: requiredText(form.get("byline"), "Byline", 2, 120),
      publishedAt: `${publishedDate}T00:00:00+05:30`,
      featured: form.get("featured") === "on",
      status,
      sourceType,
      sourceName: sourceName || undefined,
      sourceUrl,
      coverDriveId: cover?.fileId,
      coverSourceUrl: cover?.sourceUrl,
      labelIds,
      videoIds,
      translations,
    });
    return redirect(`/editor/articles/${savedId}/?saved=article`, 303);
  } catch (error) {
    console.error("Admin article save failed", error);
    return redirect(`${returnPath}?error=article`, 303);
  }
};
