import { defineMiddleware } from "astro:middleware";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isLocale } from "./data/i18n";
import { getRuntimeEnv } from "./lib/runtime";

const protectedPrefixes = ["/editor", "/api/editor"];
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function unauthorized(message: string, status = 401): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, hostname, protocol } = context.url;
  const protectedRoute = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (protectedRoute) {
    const env = getRuntimeEnv(context.locals);
    const loopback = ["localhost", "127.0.0.1"].includes(hostname);
    const localDevelopment = import.meta.env.DEV && loopback;
    const suppliedLocalToken = context.request.headers.get("X-Naee-Local-Admin");
    const localPreview = loopback
      && Boolean(env.LOCAL_ADMIN_TOKEN)
      && suppliedLocalToken === env.LOCAL_ADMIN_TOKEN;
    if (localDevelopment || localPreview) {
      context.locals.adminEmail = env.ADMIN_EMAIL ?? "editor@naeeparvaz.com";
    } else {
      const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const audience = env.CF_ACCESS_AUD;
      const adminEmail = (env.ADMIN_EMAIL ?? "editor@naeeparvaz.com").toLowerCase();
      if (!teamDomain || !audience) return unauthorized("Admin authentication is not configured.", 503);
      const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
      if (!token) return unauthorized("Cloudflare Access authentication is required.");
      try {
        let keySet = keySets.get(teamDomain);
        if (!keySet) {
          keySet = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
          keySets.set(teamDomain, keySet);
        }
        const { payload } = await jwtVerify(token, keySet, {
          issuer: `https://${teamDomain}`,
          audience,
        });
        const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
        if (email !== adminEmail) return unauthorized("This account is not authorized.", 403);
        context.locals.adminEmail = email;
      } catch (error) {
        console.error("Cloudflare Access validation failed", error);
        return unauthorized("The admin session is invalid or expired.");
      }
    }
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
  if (protectedRoute) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});
