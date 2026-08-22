import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { parseVideoUrl, resolveVideo, videoEmbedUrl } from "../src/lib/video";
import { createVideoLibraryView } from "../src/lib/video-library";
import type { VideoRecord } from "../src/types/content";

const routes = [
  { path: "/en/", heading: "Journalism that helps society see farther.", lang: "en" },
  { path: "/en/about/", heading: "About Naee Parvaz", lang: "en" },
  { path: "/en/vision-mission/", heading: "Vision, mission & objectives", lang: "en" },
  { path: "/en/contact/", heading: "Connect with the newsroom", lang: "en" },
  { path: "/en/videos/", heading: "Latest Videos", lang: "en" },
  { path: "/hi/", heading: "ऐसी पत्रकारिता जो समाज को दूर तक देखने में मदद करे।", lang: "hi" },
  { path: "/hi/about/", heading: "नई परवाज़ के बारे में", lang: "hi" },
  { path: "/hi/vision-mission/", heading: "दृष्टि, मिशन और उद्देश्य", lang: "hi" },
  { path: "/hi/contact/", heading: "न्यूज़रूम से संपर्क करें", lang: "hi" },
  { path: "/hi/videos/", heading: "नवीनतम वीडियो", lang: "hi" },
] as const;

test("all localized public routes render with canonical, language and organization metadata", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route.path);
    expect(response?.ok(), `${route.path} should return a successful response`).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://naeeparvaz.com${route.path}`);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /(?:Naee Parvaz|नई परवाज़)/i);

    const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
    const organization = JSON.parse(structuredData ?? "{}");
    expect(organization).toMatchObject({
      "@type": "NewsMediaOrganization",
      name: "Naee Parvaz News",
      url: "https://naeeparvaz.com",
      email: "editor@naeeparvaz.com",
      telephone: "+919823303222",
      slogan: "सच • संविधान • समाज",
    });

    expect(await page.locator("body").innerText()).not.toContain("naeeparvaznews@gmail.com");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("legacy routes redirect to English and the root remembers a Hindi preference", async ({ page }) => {
  await page.goto("/about/");
  expect(new URL(page.url()).pathname).toBe("/en/about/");
  await page.goto("/hi/");
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/hi/");
});

test("rendered public pages have no automatically detectable WCAG A/AA violations", async ({ page }, testInfo) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(testInfo.project.name), "Accessibility is checked at representative desktop and mobile widths");
  for (const route of routes) {
    await page.goto(route.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude(".cf-turnstile")
      .analyze();
    expect(results.violations, `${route.path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
});

test("internal navigation, robots and sitemap resolve without broken routes", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One crawl is enough");
  await page.goto("/en/");
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((links) =>
    [...new Set(links.map((link) => (link as HTMLAnchorElement).getAttribute("href")).filter(Boolean))] as string[],
  );

  for (const href of hrefs) {
    const url = new URL(href, "http://127.0.0.1:4321");
    url.hash = "";
    const response = await request.get(url.toString());
    expect(response.ok(), `${href} should resolve`).toBeTruthy();
  }

  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /editor/");
  const sitemapIndex = await request.get("/sitemap-index.xml");
  expect(sitemapIndex.ok()).toBeTruthy();
  const sitemap = await request.get("/sitemap-0.xml");
  const sitemapText = await sitemap.text();
  for (const route of routes) expect(sitemapText).toContain(`https://naeeparvaz.com${route.path}`);
  expect(sitemapText).not.toContain("https://naeeparvaz.com/editor/");
});

test("contact page exposes exact details, a real form and only approved social links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One semantic contact check is enough");
  await page.goto("/en/contact/");
  await expect(page.getByText("Mohd. Asim Ali", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Editor-in-Chief, Naee Parvaz News", { exact: true }).first()).toBeVisible();
  await expect(page.locator('a[href="mailto:editor@naeeparvaz.com"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:+919823303222"]').first()).toBeVisible();
  await expect(page.locator('form[action="/api/contact/"]')).toHaveCount(1);
  const socialHrefs = await page.locator(".social-directory a").evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  );
  const approvedSocialHosts = new Set([
    "instagram.com", "www.instagram.com",
    "youtube.com", "www.youtube.com",
    "facebook.com", "www.facebook.com",
    "x.com", "www.x.com", "twitter.com", "www.twitter.com",
  ]);
  for (const href of socialHrefs) {
    const url = new URL(href);
    expect(url.protocol).toBe("https:");
    expect(approvedSocialHosts.has(url.hostname)).toBe(true);
  }

  await page.goto("/hi/contact/");
  await expect(page.getByText("मुख्य संपादक, नई परवाज न्यूज़", { exact: true }).first()).toBeVisible();
});

test("YouTube, Instagram and Facebook links resolve only to approved embeds", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Provider parsing is viewport-independent");
  const youtube = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const youtubeShort = parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
  const youtubeCompact = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
  const instagram = parseVideoUrl("https://www.instagram.com/reel/ABC_def-123/");
  const facebook = parseVideoUrl("https://www.facebook.com/watch/?v=1234567890");
  const facebookReel = parseVideoUrl("https://www.facebook.com/reel/9876543210/");
  const facebookLegacy = parseVideoUrl("https://www.facebook.com/video.php?v=1234567890");
  const facebookShared = parseVideoUrl("https://www.facebook.com/share/v/1PbN4QrUVZ/");

  expect(youtube.provider).toBe("youtube");
  expect(youtubeShort.providerId).toBe(youtube.providerId);
  expect(youtubeCompact.providerId).toBe(youtube.providerId);
  expect(instagram.provider).toBe("instagram");
  expect(facebook.provider).toBe("facebook");
  expect(facebookReel.provider).toBe("facebook");
  expect(facebookLegacy.provider).toBe("facebook");
  expect(facebookShared).toMatchObject({
    provider: "facebook",
    providerId: "1PbN4QrUVZ",
    canonicalUrl: "https://www.facebook.com/share/v/1PbN4QrUVZ/",
  });
  expect(videoEmbedUrl({ ...youtube })).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  expect(videoEmbedUrl({ ...instagram })).toMatch(/^https:\/\/www\.instagram\.com\//);
  expect(videoEmbedUrl({ ...facebook })).toMatch(/^https:\/\/www\.facebook\.com\/plugins\/video\.php/);
  expect(decodeURIComponent(videoEmbedUrl({ ...facebookShared }))).toContain("https://www.facebook.com/share/v/1PbN4QrUVZ/");
  expect(() => parseVideoUrl("https://example.com/video/123")).toThrow(/Only supported/);
  expect(() => parseVideoUrl("javascript:alert(1)")).toThrow(/valid HTTPS/);
  expect(() => parseVideoUrl('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')).toThrow(/valid HTTPS/);

  const record: VideoRecord = {
    id: "00000000-0000-4000-8000-000000000001",
    ...youtube,
    publishedAt: "2026-08-18T00:00:00+05:30",
    category: "video-reports",
    featured: false,
    status: "published",
    translations: { en: { title: "English-only title" } },
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T00:00:00Z",
  };
  expect(resolveVideo(record, "hi")).toMatchObject({ title: "English-only title", translationLocale: "en" });
  record.translations = { hi: { title: "केवल हिंदी शीर्षक" } };
  expect(resolveVideo(record, "en")).toMatchObject({ title: "केवल हिंदी शीर्षक", translationLocale: "hi" });
});

test("video library filters and paginates published records", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Library pagination is viewport-independent");
  const parsed = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const records = Array.from({ length: 20 }, (_, index): VideoRecord => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ...parsed,
    provider: index < 12 ? "youtube" : "facebook",
    publishedAt: "2026-08-18T00:00:00+05:30",
    category: "video-reports",
    featured: false,
    status: "published",
    translations: { en: { title: `Video ${index + 1}` } },
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T00:00:00Z",
  }));
  const resolved = records.map((record) => resolveVideo(record, "en"));

  const secondPage = createVideoLibraryView(resolved, null, "2");
  expect(secondPage).toMatchObject({ currentPage: 2, totalPages: 3, totalVideos: 20, firstVisible: 10, lastVisible: 18 });
  expect(secondPage.videos).toHaveLength(9);

  const facebook = createVideoLibraryView(resolved, "facebook", "99");
  expect(facebook).toMatchObject({ activeProvider: "facebook", currentPage: 1, totalPages: 1, totalVideos: 8 });
  expect(facebook.videos).toHaveLength(8);
});

test("public video library exposes working platform filters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One filter-navigation check is enough");
  await page.goto("/en/videos/");
  const filters = page.getByRole("navigation", { name: "Filter videos by platform" });
  await expect(filters).toBeVisible();
  await expect(filters.locator('a[href="/en/videos/"]')).toHaveAttribute("aria-current", "page");
  await filters.locator('a[href="/en/videos/?platform=facebook"]').click();
  await expect(page).toHaveURL(/\/en\/videos\/\?platform=facebook$/);
  await expect(page.locator('a[href="/en/videos/?platform=facebook"]')).toHaveAttribute("aria-current", "page");
});

test("the production preview protects both the editor and editor APIs", async ({ request, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "One access-control smoke test is enough");
  const response = await request.get("/editor/", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response.headers().location).toMatch(/^\/editor\/login\//);

  const apiResponse = await request.post("/api/editor/settings/", {
    form: { section: "contact" },
    headers: { Origin: "http://127.0.0.1:4321" },
  });
  expect(apiResponse.status()).toBe(401);
  expect(apiResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow");

  await page.goto("/editor/login/");
  await expect(page.getByRole("heading", { level: 1, name: "Naee Parvaz control desk" })).toBeVisible();
  await expect(page.locator('form[action="/api/auth/request-code/"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Send one-time code" })).toBeDisabled();
});

test("mobile navigation exposes its state and restores focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Focused mobile-menu interaction test");
  await page.goto("/en/");

  const toggle = page.locator("[data-menu-toggle]");
  await expect(toggle).toHaveAccessibleName("Menu: Primary navigation");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName("Close: Primary navigation");
  await expect(page.locator("#primary-navigation")).toHaveClass(/is-open/);
  await expect(page.locator("#primary-navigation").getByRole("link", { name: "Home", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("capture responsive visual-QA screenshots", async ({ page }, testInfo) => {
  for (const route of routes) {
    await page.goto(route.path);
    const name = route.path.replaceAll("/", "-").replace(/^-|-$/g, "") || "home";
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`) });
  }
});
