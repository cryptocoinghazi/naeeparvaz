import type { APIRoute } from "astro";
import { defaultSocialLinks } from "../../../data/site";
import { updateSiteSettings, updateSocialLinks, validateSocialUrl } from "../../../lib/site-repository";
import { optionalText, phoneHref, requiredText, validEmail } from "../../../lib/validation";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.adminEmail) return new Response("Unauthorized", { status: 401 });
  try {
    const form = await request.formData();
    const section = form.get("section");
    if (section === "contact") {
      const phoneDisplay = requiredText(form.get("phoneDisplay"), "Phone", 8, 30);
      await updateSiteSettings(locals, {
        editorName: requiredText(form.get("editorName"), "Editor name", 2, 100),
        editorTitleEn: requiredText(form.get("editorTitleEn"), "English title", 3, 160),
        editorTitleHi: requiredText(form.get("editorTitleHi"), "Hindi title", 3, 160),
        email: validEmail(form.get("email")),
        phoneDisplay,
        phoneHref: phoneHref(phoneDisplay),
      });
    } else if (section === "social") {
      const socials = defaultSocialLinks.map((defaultSocial) => {
        const prefix = defaultSocial.platform;
        const identity = requiredText(form.get(`${prefix}Identity`), `${prefix} identity`, 1, 100);
        const rawUrl = optionalText(form.get(`${prefix}Url`), `${prefix} URL`, 500);
        return {
          ...defaultSocial,
          identity,
          url: validateSocialUrl(defaultSocial.platform, rawUrl),
          enabled: form.get(`${prefix}Enabled`) === "on",
        };
      });
      await updateSocialLinks(locals, socials);
    } else {
      throw new Error("Unknown settings section.");
    }
    return redirect(`/editor/?saved=${section}`, 303);
  } catch (error) {
    console.error("Admin settings update failed", error);
    return redirect(`/editor/?error=settings`, 303);
  }
};
