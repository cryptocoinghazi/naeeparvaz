import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";

const publicPages = ["", "about/", "vision-mission/", "contact/", "videos/", "news/", "disclaimer/"];
const canonicalPages = ["en", "hi"].flatMap((locale) =>
  publicPages.map((page) => `https://naeeparvaz.com/${locale}/${page}`),
);

export default defineConfig({
  site: "https://naeeparvaz.com",
  output: "server",
  adapter: node({ mode: "standalone" }),
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "hi"],
    routing: "manual",
  },
  security: {
    checkOrigin: true,
    allowedDomains: [
      { hostname: "naeeparvaz.com", protocol: "https" },
      { hostname: "www.naeeparvaz.com", protocol: "https" },
      { hostname: "*.ondigitalocean.app", protocol: "https" },
    ],
  },
  integrations: [
    sitemap({
      customPages: canonicalPages,
      filter: (page) => canonicalPages.includes(page),
    }),
  ],
});
