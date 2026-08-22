import { defineMiddleware } from "astro:middleware";
import { isLocale } from "./data/i18n";
import { getAdminSessionEmail, sessionCookieName } from "./lib/auth";

const protectedPrefixes = ["/editor", "/api/editor"];
const publicEditorPaths = new Set(["/editor/login", "/editor/login/"]);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function unauthorized(message: string): Response {
  return new Response(message, {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, hostname, protocol } = context.url;
  if (!import.meta.env.DEV && hostname === "www.naeeparvaz.com") {
    const canonical = new URL(context.url);
    canonical.hostname = "naeeparvaz.com";
    return context.redirect(canonical.toString(), 308);
  }

  const editorPath = protectedPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
  const publicEditorPath = publicEditorPaths.has(pathname);
  const protectedRoute = editorPath && !publicEditorPath;

  if (protectedRoute) {
    const token = context.cookies.get(sessionCookieName())?.value;
    const email = await getAdminSessionEmail(context.locals, token);
    if (!email) {
      if (matchesPrefix(pathname, "/api/editor")) return unauthorized("Admin authentication is required.");
      const nextPath = `${pathname}${context.url.search}`;
      const redirect = context.redirect(`/editor/login/?next=${encodeURIComponent(nextPath)}`, 302);
      redirect.headers.set("Cache-Control", "no-store");
      redirect.headers.set("X-Robots-Tag", "noindex, nofollow");
      return redirect;
    }
    context.locals.adminEmail = email;
  }

  const response = await next();
  const locale = pathname.split("/").filter(Boolean)[0];
  if (isLocale(locale)) {
    context.cookies.set("np_locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: protocol === "https:",
    });
  }

  const sensitiveRoute = editorPath || matchesPrefix(pathname, "/api/auth");
  if (sensitiveRoute) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("X-Frame-Options", "DENY");
  }
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (!import.meta.env.DEV) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
});
