import type { APIRoute } from "astro";
import { clearAuthenticationCookies, destroyAdminSession, sessionCookieName } from "../../../lib/auth";

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  try {
    await destroyAdminSession(locals, cookies.get(sessionCookieName())?.value);
  } catch (error) {
    console.error("Admin logout cleanup failed", error);
  }
  clearAuthenticationCookies(cookies);
  return redirect("/editor/login/?signedOut=1", 303);
};
