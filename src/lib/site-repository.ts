import { defaultSiteSettings, defaultSocialLinks } from "../data/site";
import type { EditableSiteSettings, EditableSocialLink, SocialPlatform } from "../types/content";
import { getDatabase } from "./runtime";

interface SiteSettingsRow {
  editor_name: string;
  editor_title_en: string;
  editor_title_hi: string;
  email: string;
  phone_display: string;
  phone_href: string;
  updated_at: string;
}

interface SocialRow {
  platform: SocialPlatform;
  identity: string;
  url: string | null;
  enabled: number;
  display_order: number;
}

export async function getSiteSettings(locals: App.Locals): Promise<EditableSiteSettings> {
  const db = getDatabase(locals);
  if (!db) return { ...defaultSiteSettings };

  try {
    const row = await db.prepare("SELECT * FROM site_settings WHERE id = 1").first<SiteSettingsRow>();
    if (!row) return { ...defaultSiteSettings };
    return {
      editorName: row.editor_name,
      editorTitleEn: row.editor_title_en,
      editorTitleHi: row.editor_title_hi,
      email: row.email,
      phoneDisplay: row.phone_display,
      phoneHref: row.phone_href,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    console.error("Unable to read site settings", error);
    return { ...defaultSiteSettings };
  }
}

export async function getSocialLinks(locals: App.Locals): Promise<EditableSocialLink[]> {
  const db = getDatabase(locals);
  if (!db) return defaultSocialLinks.map((social) => ({ ...social }));

  try {
    const result = await db.prepare("SELECT * FROM social_links ORDER BY display_order").all<SocialRow>();
    if (!result.results.length) return defaultSocialLinks.map((social) => ({ ...social }));
    return result.results.map((row) => ({
      platform: row.platform,
      identity: row.identity,
      url: row.url ?? undefined,
      enabled: row.enabled === 1,
      displayOrder: row.display_order,
    }));
  } catch (error) {
    console.error("Unable to read social links", error);
    return defaultSocialLinks.map((social) => ({ ...social }));
  }
}

export async function updateSiteSettings(locals: App.Locals, settings: EditableSiteSettings): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The D1 database binding is unavailable.");

  await db.prepare(`
    INSERT INTO site_settings (
      id, editor_name, editor_title_en, editor_title_hi, email, phone_display, phone_href, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      editor_name = excluded.editor_name,
      editor_title_en = excluded.editor_title_en,
      editor_title_hi = excluded.editor_title_hi,
      email = excluded.email,
      phone_display = excluded.phone_display,
      phone_href = excluded.phone_href,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    settings.editorName,
    settings.editorTitleEn,
    settings.editorTitleHi,
    settings.email,
    settings.phoneDisplay,
    settings.phoneHref,
  ).run();
}

export async function updateSocialLinks(locals: App.Locals, socials: EditableSocialLink[]): Promise<void> {
  const db = getDatabase(locals);
  if (!db) throw new Error("The D1 database binding is unavailable.");

  await db.batch(socials.map((social) => db.prepare(`
    INSERT INTO social_links (platform, identity, url, enabled, display_order, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(platform) DO UPDATE SET
      identity = excluded.identity,
      url = excluded.url,
      enabled = excluded.enabled,
      display_order = excluded.display_order,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    social.platform,
    social.identity,
    social.url || null,
    social.enabled ? 1 : 0,
    social.displayOrder,
  )));
}

export const socialPlatformLabels: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X / Twitter",
};

const socialHosts: Record<SocialPlatform, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be"],
  facebook: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
};

export function validateSocialUrl(platform: SocialPlatform, input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Social links must be standard HTTPS URLs.");
  }
  if (!socialHosts[platform].includes(url.hostname.toLowerCase())) {
    throw new Error(`The ${socialPlatformLabels[platform]} URL uses an unexpected domain.`);
  }
  url.hash = "";
  return url.toString();
}
