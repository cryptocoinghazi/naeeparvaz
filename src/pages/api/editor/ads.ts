import type { APIRoute } from "astro";
import { saveAdvertisement } from "../../../lib/ad-repository";
import { validateDriveImageUrl, validateExternalDestination } from "../../../lib/drive-image";
import { optionalText, requiredText } from "../../../lib/validation";
import type { AdPlacement } from "../../../types/content";

const placements = new Set<AdPlacement>(["home", "news-listing", "video-listing", "article-end"]);

function indiaDateTime(value: FormDataEntryValue | null, label: string, required: boolean): string | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw && !required) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error(`Enter a valid ${label}.`);
  const date = new Date(`${raw}:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${label}.`);
  return date.toISOString();
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const rawId = String(form.get("id") ?? "");
    const id = /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : undefined;
    if (rawId && !id) throw new Error("Invalid advertisement identifier.");
    const placement = String(form.get("placement") ?? "") as AdPlacement;
    if (!placements.has(placement)) throw new Error("Choose a valid advertisement placement.");
    const priority = Number(form.get("priority"));
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) throw new Error("Priority must be between 0 and 1000.");
    const startsAt = indiaDateTime(form.get("startsAt"), "start time", true)!;
    const endsAt = indiaDateTime(form.get("endsAt"), "end time", false);
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("The end time must be after the start time.");
    const headlineEn = optionalText(form.get("headlineEn"), "English headline", 180);
    const headlineHi = optionalText(form.get("headlineHi"), "Hindi headline", 180);
    const bodyEn = optionalText(form.get("bodyEn"), "English advertisement text", 600);
    const bodyHi = optionalText(form.get("bodyHi"), "Hindi advertisement text", 600);
    const creativeUrl = optionalText(form.get("creativeUrl"), "Google Drive creative", 1000);
    if (!headlineEn && !headlineHi && !bodyEn && !bodyHi && !creativeUrl) throw new Error("Provide an image or text creative.");
    const creative = creativeUrl ? await validateDriveImageUrl(creativeUrl) : undefined;
    const creativeAltEn = optionalText(form.get("creativeAltEn"), "English image alternative text", 240);
    const creativeAltHi = optionalText(form.get("creativeAltHi"), "Hindi image alternative text", 240);
    if (creative && !creativeAltEn && !creativeAltHi) throw new Error("A Drive image requires alternative text in at least one language.");
    const destinationInput = optionalText(form.get("destinationUrl"), "Destination URL", 1000);
    await saveAdvertisement(locals, {
      id,
      clientName: requiredText(form.get("clientName"), "Client name", 2, 160),
      headlineEn: headlineEn || undefined,
      headlineHi: headlineHi || undefined,
      bodyEn: bodyEn || undefined,
      bodyHi: bodyHi || undefined,
      creativeDriveId: creative?.fileId,
      creativeSourceUrl: creative?.sourceUrl,
      creativeAltEn: creativeAltEn || undefined,
      creativeAltHi: creativeAltHi || undefined,
      destinationUrl: destinationInput ? validateExternalDestination(destinationInput) : undefined,
      placement,
      priority,
      startsAt,
      endsAt,
      status: form.get("status") === "published" ? "published" : "draft",
    });
    return redirect("/editor/ads/?saved=ad", 303);
  } catch (error) {
    console.error("Admin advertisement save failed", error);
    return redirect("/editor/ads/?error=ad", 303);
  }
};
