import type { APIRoute } from "astro";
import { getPublishedArticleSlugs } from "../lib/article-repository";

const site = "https://naeeparvaz.com";
const fixedPages = ["", "about/", "vision-mission/", "contact/", "videos/", "news/", "disclaimer/"];

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character);
}

export const GET: APIRoute = async ({ locals }) => {
  const articles = await getPublishedArticleSlugs(locals);
  const entries: Array<{ url: string; lastModified?: string }> = [
    ...["en", "hi"].flatMap((locale) => fixedPages.map((page) => ({ url: `${site}/${locale}/${page}` }))),
    ...["en", "hi"].flatMap((locale) => articles.map((article) => ({
      url: `${site}/${locale}/news/${encodeURIComponent(article.slug)}/`,
      lastModified: article.updatedAt,
    }))),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((entry) => `  <url><loc>${escapeXml(entry.url)}</loc>${entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};
