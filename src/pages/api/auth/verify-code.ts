import type { APIRoute } from "astro";
import {
  challengeCookieName,
  clearChallengeCookie,
  safeEditorNext,
  setSessionCookie,
  verifyAdminChallenge,
} from "../../../lib/auth";
import { requiredText } from "../../../lib/validation";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  let nextPath = "/editor/";
  try {
    const form = await request.formData();
    nextPath = safeEditorNext(form.get("next"));
    const code = requiredText(form.get("code"), "Sign-in code", 6, 12);
    const challengeToken = cookies.get(challengeCookieName())?.value ?? "";
    const session = await verifyAdminChallenge(locals, challengeToken, code);
    if (!session) throw new Error("The sign-in code is invalid or expired.");
    clearChallengeCookie(cookies);
    setSessionCookie(cookies, session.sessionToken);
    return redirect(nextPath, 303);
  } catch (error) {
    console.error("Admin code verification failed", error instanceof Error ? error.message : error);
    return redirect(`/editor/login/?step=verify&error=code&next=${encodeURIComponent(nextPath)}`, 303);
  }
};
