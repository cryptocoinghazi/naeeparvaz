import type { APIRoute } from "astro";
import { requireSameOrigin } from "../../../../lib/editor-api";
import { createPublishBatch, getPublisherChannels } from "../../../../lib/publisher-repository";
import { submitPublishBatch } from "../../../../lib/publisher-service";
import { optionalText, requiredText } from "../../../../lib/validation";
import { socialPlatforms, type PublishMode, type SocialPlatform } from "../../../../types/publisher";

function istDateTime(value: FormDataEntryValue | null): string {
  const input = requiredText(value, "Scheduled time", 16, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error("Choose a valid scheduled time.");
  const resolved = new Date(`${input}:00+05:30`);
  if (Number.isNaN(resolved.getTime()) || resolved.getTime() < Date.now() + 5 * 60_000) {
    throw new Error("Scheduled posts must be at least five minutes in the future.");
  }
  return resolved.toISOString();
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    const assetId = requiredText(form.get("assetId"), "Validated video", 36, 36);
    const requestId = requiredText(form.get("clientRequestId"), "Request identifier", 36, 36);
    if (!/^[0-9a-f-]{36}$/i.test(assetId) || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid publishing request.");
    const mode: PublishMode = form.get("publishMode") === "scheduled" ? "scheduled" : "now";
    const scheduledFor = mode === "scheduled" ? istDateTime(form.get("scheduledFor")) : undefined;
    const requestedPlatforms = socialPlatforms.filter((platform) => form.getAll("platforms").includes(platform));
    if (!requestedPlatforms.length) throw new Error("Select at least one platform.");
    const channels = await getPublisherChannels(locals);
    const targets = requestedPlatforms.map((platform) => {
      const channel = channels.find((candidate) => candidate.platform === platform && candidate.enabled);
      if (!channel || channel.disconnected || channel.locked) throw new Error(`A usable ${platform} channel is not configured.`);
      return { platform, channelId: channel.channelId };
    });
    const sharedText = requiredText(form.get("sharedText"), "Shared post text", 1, 2200);
    const instagramCaption = optionalText(form.get("instagramCaption"), "Instagram caption", 2200);
    const facebookCaption = optionalText(form.get("facebookCaption"), "Facebook caption", 2200);
    const youtubeTitle = optionalText(form.get("youtubeTitle"), "YouTube title", 100);
    const youtubeDescription = optionalText(form.get("youtubeDescription"), "YouTube description", 5000);
    if (requestedPlatforms.includes("youtube") && !youtubeTitle) throw new Error("A YouTube title is required.");
    if (requestedPlatforms.includes("youtube") && !youtubeDescription) throw new Error("A YouTube description is required.");
    const batch = await createPublishBatch(locals, {
      id: crypto.randomUUID(),
      assetId,
      mode,
      scheduledFor,
      sharedText,
      instagramCaption,
      facebookCaption,
      youtubeTitle,
      youtubeDescription,
      clientRequestId: requestId,
      createdBy: locals.adminEmail,
      targets: targets as Array<{ platform: SocialPlatform; channelId: string }>,
    });
    await submitPublishBatch(locals, batch.id);
    return redirect(`/editor/publisher/?saved=publish#batch-${batch.id}`, 303);
  } catch (error) {
    console.error("Social publishing failed", error);
    return redirect(`/editor/publisher/?error=publish`, 303);
  }
};
