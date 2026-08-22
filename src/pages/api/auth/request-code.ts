import type { APIRoute } from "astro";
import { createAdminChallenge, LoginRateLimitError, safeEditorNext, setChallengeCookie } from "../../../lib/auth";
import { verifyTurnstile } from "../../../lib/turnstile";
import { validEmail } from "../../../lib/validation";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  let nextPath = "/editor/";
  try {
    const form = await request.formData();
    nextPath = safeEditorNext(form.get("next"));
    const token = typeof form.get("cf-turnstile-response") === "string"
      ? String(form.get("cf-turnstile-response"))
      : "";
    await verifyTurnstile(request, token, "admin-login");
    const challenge = await createAdminChallenge(request, locals, validEmail(form.get("email")));
    setChallengeCookie(cookies, challenge);
    return redirect(`/editor/login/?step=verify&sent=1&next=${encodeURIComponent(nextPath)}`, 303);
  } catch (error) {
    const reason = error instanceof LoginRateLimitError ? "rate" : "request";
    console.error("Admin code request failed", error instanceof Error ? error.message : error);
    return redirect(`/editor/login/?error=${reason}&next=${encodeURIComponent(nextPath)}`, 303);
  }
};
