import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

const publicPages = ["", "about/", "vision-mission/", "contact/", "videos/"];
const canonicalPages = ["en", "hi"].flatMap((locale) =>
  publicPages.map((page) => `https://naeeparvaz.com/${locale}/${page}`),
);

export default defineConfig({
  site: "https://naeeparvaz.com",
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  trailingSlash: "always",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "hi"],
    routing: "manual",
  },
  security: {
    checkOrigin: true,
  },
  integrations: [
    sitemap({
      customPages: canonicalPages,
      filter: (page) => canonicalPages.includes(page),
    }),
  ],
});
