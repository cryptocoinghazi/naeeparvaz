import type { APIRoute } from "astro";
import { discoverBufferChannels } from "../../../../lib/buffer-client";
import { errorMessage, json, requireSameOrigin } from "../../../../lib/editor-api";
import { getPublisherChannels, savePublisherChannels } from "../../../../lib/publisher-repository";
import { socialPlatforms, type SocialPlatform } from "../../../../types/publisher";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.adminEmail) return json({ error: "Unauthorized" }, 401);
  try {
    const [channels, selected] = await Promise.all([discoverBufferChannels(locals), getPublisherChannels(locals)]);
    return json({ channels, selected });
  } catch (error) {
    return json({ error: errorMessage(error) }, 502);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminEmail) return json({ error: "Unauthorized" }, 401);
  try {
    requireSameOrigin(request);
    const body = await request.json() as Partial<Record<SocialPlatform, unknown>>;
    const selected = Object.fromEntries(socialPlatforms.map((platform) => [
      platform,
      typeof body[platform] === "string" && body[platform] ? body[platform] : undefined,
    ])) as Record<SocialPlatform, string | undefined>;
    const discovered = await discoverBufferChannels(locals);
    await savePublisherChannels(locals, discovered, selected);
    return json({ ok: true, selected: await getPublisherChannels(locals) });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
};
