import type { Locale, ResolvedVideo, VideoProvider, VideoRecord } from "../types/content";
import { driveImagePath } from "./drive-image";

export interface ParsedVideoUrl {
  sourceUrl: string;
  canonicalUrl: string;
  provider: VideoProvider;
  providerId: string;
}

function safeUrl(input: string): URL {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Use a standard HTTPS video URL.");
  }
  url.hash = "";
  return url;
}

function parseYouTube(url: URL): ParsedVideoUrl | undefined {
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      id = match?.[1] ?? null;
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return undefined;
  return {
    sourceUrl: url.toString(),
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    provider: "youtube",
    providerId: id,
  };
}

function parseInstagram(url: URL): ParsedVideoUrl | undefined {
  if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return undefined;
  const match = url.pathname.match(/^\/(reel|p|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!match) return undefined;
  const type = match[1];
  const id = match[2];
  return {
    sourceUrl: url.toString(),
    canonicalUrl: `https://www.instagram.com/${type}/${id}/`,
    provider: "instagram",
    providerId: `${type}:${id}`,
  };
}

function parseFacebook(url: URL): ParsedVideoUrl | undefined {
  const host = url.hostname.toLowerCase();
  const allowed = ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"];
  if (!allowed.includes(host)) return undefined;

  const reel = url.pathname.match(/^\/reel\/([A-Za-z0-9._-]+)(?:\/|$)/);
  const sharedVideo = url.pathname.match(/^\/share\/v\/([A-Za-z0-9._-]+)(?:\/|$)/);
  const video = url.pathname.match(/^\/(?:[^/]+\/videos|video\.php)\/([A-Za-z0-9._-]+)(?:\/|$)/);
  const watchId = url.pathname === "/watch/" || url.pathname === "/watch" ? url.searchParams.get("v") : null;
  const videoParam = url.pathname === "/video.php" ? url.searchParams.get("v") : null;
  const shortCode = host === "fb.watch" ? url.pathname.split("/").filter(Boolean)[0] : null;
  const id = reel?.[1] ?? sharedVideo?.[1] ?? video?.[1] ?? watchId ?? videoParam ?? shortCode;
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) return undefined;

  const canonicalUrl = host === "fb.watch"
    ? `https://fb.watch/${id}/`
    : reel
      ? `https://www.facebook.com/reel/${id}/`
      : sharedVideo
        ? `https://www.facebook.com/share/v/${id}/`
      : `https://www.facebook.com/watch/?v=${id}`;
  return { sourceUrl: url.toString(), canonicalUrl, provider: "facebook", providerId: id };
}

export function parseVideoUrl(input: string): ParsedVideoUrl {
  let url: URL;
  try {
    url = safeUrl(input);
  } catch {
    throw new Error("Enter a valid HTTPS YouTube, Instagram or Facebook video URL.");
  }
  const parsed = parseYouTube(url) ?? parseInstagram(url) ?? parseFacebook(url);
  if (!parsed) throw new Error("Only supported YouTube, Instagram and Facebook video links are accepted.");
  return parsed;
}

export function videoEmbedUrl(video: Pick<VideoRecord, "provider" | "providerId" | "canonicalUrl">): string {
  if (video.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${video.providerId}?playsinline=1&rel=0`;
  }
  if (video.provider === "instagram") {
    const [type, id] = video.providerId.split(":");
    return `https://www.instagram.com/${type}/${id}/embed/`;
  }
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(video.canonicalUrl)}&show_text=false&width=720`;
}

export function videoThumbnail(video: Pick<VideoRecord, "provider" | "providerId" | "thumbnailDriveId">): string | undefined {
  if (video.thumbnailDriveId) return driveImagePath(video.thumbnailDriveId);
  return video.provider === "youtube" ? `https://i.ytimg.com/vi/${video.providerId}/hqdefault.jpg` : undefined;
}

export function resolveVideo(video: VideoRecord, locale: Locale): ResolvedVideo {
  const fallbackLocale: Locale = locale === "en" ? "hi" : "en";
  const translation = video.translations[locale] ?? video.translations[fallbackLocale];
  if (!translation) throw new Error(`Video ${video.id} has no usable translation.`);
  return { ...video, ...translation, translationLocale: video.translations[locale] ? locale : fallbackLocale };
}

export const providerLabels: Record<VideoProvider, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};
