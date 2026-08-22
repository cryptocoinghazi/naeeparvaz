import type { APIRoute } from "astro";
import { isLocale, localePath } from "../../data/i18n";
import { getRuntimeEnv } from "../../lib/runtime";
import { getSiteSettings } from "../../lib/site-repository";
import { verifyTurnstile } from "../../lib/turnstile";
import { escapeHtml, optionalText, requiredText, validEmail } from "../../lib/validation";

const categories = new Set(["editorial", "correction", "news-tip", "partnership", "general"]);

function destination(request: Request, locale: "en" | "hi", status: "sent" | "error") {
  return new URL(`${localePath(locale, "contact")}?status=${status}`, request.url);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  let locale: "en" | "hi" = "en";
  try {
    const form = await request.formData();
    const localeValue = form.get("locale");
    locale = typeof localeValue === "string" && isLocale(localeValue) ? localeValue : "en";
    if (typeof form.get("website") === "string" && String(form.get("website")).trim()) {
      return redirect(destination(request, locale, "sent").toString(), 303);
    }

    const name = requiredText(form.get("name"), "Name", 2, 100);
    const email = validEmail(form.get("email"));
    const phone = optionalText(form.get("phone"), "Phone", 30);
    const category = requiredText(form.get("category"), "Category", 3, 30);
    if (!categories.has(category)) throw new Error("Choose a valid enquiry category.");
    const subject = optionalText(form.get("subject"), "Subject", 160).replace(/[\r\n]+/g, " ");
    const message = requiredText(form.get("message"), "Message", 20, 5000);
    const env = getRuntimeEnv(locals);

    const token = typeof form.get("cf-turnstile-response") === "string" ? String(form.get("cf-turnstile-response")) : "";
    await verifyTurnstile(request, token, "contact");

    if (!env.RESEND_API_KEY) throw new Error("Email delivery is not configured.");
    const settings = await getSiteSettings(locals);
    const categoryLabel = category.replaceAll("-", " ");
    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Naee Parvaz Website <${env.CONTACT_FROM_EMAIL ?? "website@send.naeeparvaz.com"}>`,
        to: [settings.email],
        reply_to: email,
        subject: `[Website] [${categoryLabel}] ${subject || "New enquiry"}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nCategory: ${categoryLabel}\nSubject: ${subject || "Not provided"}\n\n${message}`,
        html: `<h1>New website enquiry</h1><dl><dt>Name</dt><dd>${escapeHtml(name)}</dd><dt>Email</dt><dd>${escapeHtml(email)}</dd><dt>Phone</dt><dd>${escapeHtml(phone || "Not provided")}</dd><dt>Category</dt><dd>${escapeHtml(categoryLabel)}</dd><dt>Subject</dt><dd>${escapeHtml(subject || "Not provided")}</dd></dl><h2>Message</h2><p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
      }),
    });
    if (!delivery.ok) {
      console.error("Resend delivery failed", delivery.status, await delivery.text());
      throw new Error("Email delivery failed.");
    }
    return redirect(destination(request, locale, "sent").toString(), 303);
  } catch (error) {
    console.error("Contact form submission failed", error instanceof Error ? error.message : error);
    return redirect(destination(request, locale, "error").toString(), 303);
  }
};
