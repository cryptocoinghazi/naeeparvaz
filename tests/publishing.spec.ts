import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createArticleLibraryView } from "../src/lib/article-library";
import { fetchDriveImage, maxDriveImageBytes, parseDriveImageUrl } from "../src/lib/drive-image";
import { renderSafeMarkdown } from "../src/lib/markdown";
import type { ContentLabel, ResolvedArticle } from "../src/types/content";

const labels: ContentLabel[] = [
  { id: "local-area", kind: "coverage", nameEn: "Local Area", nameHi: "स्थानीय क्षेत्र", displayOrder: 1 },
  { id: "podcast", kind: "topic", nameEn: "Podcast", nameHi: "पॉडकास्ट", displayOrder: 22 },
];

const article = (index: number): ResolvedArticle => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  slug: `article-${index}`,
  byline: "Naee Parvaz News Desk",
  publishedAt: "2026-08-28T00:00:00+05:30",
  featured: false,
  status: "published",
  sourceType: "original",
  labels: index % 2 ? labels : [labels[0]],
  videoIds: [],
  translations: { en: { title: `Article ${index}`, summary: "Summary", bodyMarkdown: "Body" } },
  createdAt: "2026-08-28T00:00:00Z",
  updatedAt: "2026-08-28T00:00:00Z",
  title: `Article ${index}`,
  summary: "Summary",
  bodyMarkdown: "Body",
  translationLocale: "en",
  relatedVideos: [],
});

test("publishing helpers validate Drive links, escape Markdown and preserve label pagination", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Helper behavior is viewport-independent");
  expect(parseDriveImageUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing").fileId).toBe("1AbCdEfGhIjKlMnOp");
  expect(parseDriveImageUrl("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp").fileId).toBe("1AbCdEfGhIjKlMnOp");
  expect(() => parseDriveImageUrl("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp")).toThrow(/folder/i);
  expect(() => parseDriveImageUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit")).toThrow(/Google Drive/i);

  const rendered = renderSafeMarkdown("## Report\n\n<script>alert(1)</script>\n\n[Safe](https://example.com) [Bad](javascript:alert(1))");
  expect(rendered).toContain("&lt;script&gt;");
  expect(rendered).not.toContain("<script>");
  expect(rendered).toContain('rel="noopener"');
  expect(rendered).not.toContain('href="javascript:');

  const articles = Array.from({ length: 12 }, (_, index) => article(index + 1));
  const view = createArticleLibraryView(articles, labels, "podcast", "2", 3);
  expect(view).toMatchObject({ activeLabel: labels[1], currentPage: 2, totalPages: 2, totalArticles: 6, firstVisible: 4, lastVisible: 6 });
  expect(createArticleLibraryView(articles, labels, "invalid", "999", 9)).toMatchObject({ activeLabel: undefined, currentPage: 2, totalPages: 2 });
});

test("Drive image delivery accepts images and rejects inaccessible, unsupported, oversized and timed-out responses", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Drive response validation is viewport-independent");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } })) as typeof fetch;
    await expect(fetchDriveImage("1AbCdEfGhIjKlMnOp")).resolves.toMatchObject({ contentType: "image/webp" });

    globalThis.fetch = (async () => new Response("Private", { status: 403 })) as typeof fetch;
    await expect(fetchDriveImage("1AbCdEfGhIjKlMnOp")).rejects.toThrow(/did not return/i);

    globalThis.fetch = (async () => new Response("Not an image", { headers: { "Content-Type": "text/html" } })) as typeof fetch;
    await expect(fetchDriveImage("1AbCdEfGhIjKlMnOp")).rejects.toThrow(/JPEG, PNG or WebP/i);

    globalThis.fetch = (async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png", "Content-Length": String(maxDriveImageBytes + 1) } })) as typeof fetch;
    await expect(fetchDriveImage("1AbCdEfGhIjKlMnOp")).rejects.toThrow(/5 MB or smaller/i);

    globalThis.fetch = (async () => { throw new DOMException("Timed out", "TimeoutError"); }) as typeof fetch;
    await expect(fetchDriveImage("1AbCdEfGhIjKlMnOp")).rejects.toThrow(/Timed out/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("changed bilingual publishing pages render safely without horizontal overflow", async ({ page, request }, testInfo) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(testInfo.project.name), "Focused desktop and mobile coverage only");
  const routes = [
    ["/en/news/", "Latest News"],
    ["/hi/news/", "नवीनतम समाचार"],
    ["/en/disclaimer/", "Source, video and advertising disclaimer"],
    ["/hi/disclaimer/", "स्रोत, वीडियो और विज्ञापन अस्वीकरण"],
  ] as const;
  for (const [path, heading] of routes) {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
  if (testInfo.project.name === "desktop-1440") {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain("https://naeeparvaz.com/en/news/");
    expect(xml).toContain("https://naeeparvaz.com/hi/disclaimer/");
    expect(xml).not.toContain("/editor/");
    const arbitraryImage = await request.get("/media/drive/1AbCdEfGhIjKlMnOp/");
    expect(arbitraryImage.status()).toBe(404);
  }
});
